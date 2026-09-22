import { spawn, ChildProcess, exec } from 'child_process';
import { getDb, logActivity } from './database';
import { registerStream, unregisterStream } from './stream-manager';
import { killFFmpegProcess } from './processKiller';
import { updateStreamStats, clearStreamStats } from './streamStats';
import { setStreamRunning } from './streamState';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface StreamProcess {
  process: ChildProcess;
  streamId: number;
  pid?: number;
}

const activeStreams = new Map<number, StreamProcess>();
// Tracks streams undergoing on-the-fly video switching to prevent exit handlers from marking them stopped
const switchingStreams = new Set<number>();

export interface StreamOptions {
  videoPath?: string;
  rtmpUrl: string;
  quality: string;
  loop: boolean;
  sourceType?: 'video' | 'rtmp_ingest' | 'rtmp_pull';
  sourceUrl?: string;
}

const qualityPresets: Record<string, { resolution?: string; videoBitrate: string; maxBitrate: string; bufferSize: string }> = {
  '720p': {
    resolution: '1280:720',
    videoBitrate: '2000k',
    maxBitrate: '2500k',
    bufferSize: '5000k',
  },
  '1080p': {
    resolution: '1920:1080',
    videoBitrate: '3500k',
    maxBitrate: '4000k',
    bufferSize: '8000k',
  },
  'vertical-720p': {
    resolution: '720:1280',
    videoBitrate: '2000k',
    maxBitrate: '2500k',
    bufferSize: '5000k',
  },
  'vertical-1080p': {
    resolution: '1080:1920',
    videoBitrate: '3500k',
    maxBitrate: '4000k',
    bufferSize: '8000k',
  },
  'original': {
    videoBitrate: '3000k',
    maxBitrate: '3500k',
    bufferSize: '7000k',
  },
};

export async function startStream(
  streamId: number,
  options: StreamOptions,
  preserveStartedAt: boolean = false
): Promise<void> {
  const preset = qualityPresets[options.quality] || qualityPresets['720p'];
  
  // Parse single or multiple RTMP URLs (multi-streaming / simulcasting)
  const rawUrls = (options.rtmpUrl || '')
    .split(/[\n,;|]+/)
    .map(u => u.trim())
    .filter(Boolean);
  const rtmpUrls = Array.from(new Set(rawUrls));

  if (rtmpUrls.length === 0) {
    throw new Error('No valid RTMP destination URL provided');
  }

  const vfArgs = preset.resolution ? ['-vf', `scale=${preset.resolution}`] : [];

  // If multiple destinations: encode ONCE and branch via tee muxer.
  // onfail=ignore keeps remaining streams alive if one platform hiccups.
  const outputArgs = rtmpUrls.length === 1
    ? ['-f', 'flv', rtmpUrls[0]]
    : [
        '-f', 'tee',
        '-map', '0:v:0',
        '-map', '0:a?',
        rtmpUrls.map(url => `[f=flv:onfail=ignore]${url}`).join('|')
      ];

  const isNetworkInput = options.sourceType === 'rtmp_ingest' ||
    options.sourceType === 'rtmp_pull' ||
    (options.sourceUrl && (
      options.sourceUrl.startsWith('rtmp://') ||
      options.sourceUrl.startsWith('rtsp://') ||
      options.sourceUrl.startsWith('http://') ||
      options.sourceUrl.startsWith('https://')
    ));

  const inputSource = isNetworkInput
    ? (options.sourceUrl || options.videoPath || '')
    : (options.videoPath || '');

  const inputArgs = isNetworkInput
    ? [
        '-reconnect', '1',
        '-reconnect_at_eof', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '2',
        '-i', inputSource,
      ]
    : [
        '-re',
        ...(options.loop ? ['-stream_loop', '-1'] : []),
        '-i', inputSource,
      ];

  // Add a unique metadata comment to help identify this specific FFmpeg process
  const args = [
    ...inputArgs,
    '-metadata', `comment=streamid:${streamId}`,
    '-metadata', `title=Stream ${streamId}`,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-tune', 'zerolatency',
    '-b:v', preset.videoBitrate,
    '-maxrate', preset.maxBitrate,
    '-bufsize', preset.bufferSize,
    ...vfArgs,
    '-r', '30',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    ...outputArgs,
  ];

  // Try to find ffmpeg in common locations or use system PATH
  let ffmpegPath = 'ffmpeg';
  
  // Check common Windows locations
  const possiblePaths = [
    'C:\\ffmpeg\\bin\\ffmpeg.exe',
    'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
    path.join(process.cwd(), 'ffmpeg', 'bin', 'ffmpeg.exe'),
    path.join(process.cwd(), 'ffmpeg', 'ffmpeg.exe'),
  ];
  
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      ffmpegPath = p;
      console.log('Using FFmpeg from:', p);
      break;
    }
  }
  
  const ffmpegProcess = spawn(ffmpegPath, args, {
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  
  console.log(`Started FFmpeg process for stream ${streamId} with PID: ${ffmpegProcess.pid}`);
  
  activeStreams.set(streamId, {
    process: ffmpegProcess,
    streamId,
    pid: ffmpegProcess.pid || undefined,
  });

  const db = await getDb();

  ffmpegProcess.on('error', async (error) => {
    if (switchingStreams.has(streamId)) {
      console.log(`[SWITCH VIDEO ERROR IGNORED] Stream ${streamId}:`, error.message);
      return;
    }
    console.error(`FFmpeg error for stream ${streamId}:`, error);
    await db.run(
      'UPDATE streams SET status = ?, error_message = ?, pid = NULL WHERE id = ?',
      ['error', error.message, streamId]
    );
    await logActivity('stream_error', `Stream ${streamId} encountered an error: ${error.message}`);
    activeStreams.delete(streamId);
    unregisterStream(streamId);
  });

  ffmpegProcess.on('exit', async (code, signal) => {
    console.log(`[STREAM EXIT] Stream ${streamId} - Code: ${code}, Signal: ${signal}, Time: ${new Date().toISOString()}`);
    
    // If stream is currently in hot-swap transition, keep running status in database!
    if (switchingStreams.has(streamId)) {
      console.log(`[HOT SWAP EXIT] Stream ${streamId} old process exited during video switch. Keeping live status.`);
      activeStreams.delete(streamId);
      unregisterStream(streamId);
      return;
    }

    // Log more details about the exit
    if (signal) {
      console.log(`[STREAM EXIT SIGNAL] Stream ${streamId} received signal: ${signal}`);
      console.trace('Exit signal trace');
    }
    
    // Remove from active streams immediately
    activeStreams.delete(streamId);
    unregisterStream(streamId);
    clearStreamStats(streamId);
    
    // Log the stack trace to help debug unexpected exits
    if (code !== 0 && code !== null && signal !== 'SIGTERM' && signal !== 'SIGKILL') {
      console.error(`[UNEXPECTED EXIT] Stream ${streamId} exited unexpectedly with code ${code}`);
      console.trace();
      // Only show actual errors, not termination messages
      const errorLines = errorOutput.split('\n').filter(line => 
        line.includes('error') || line.includes('Error') || line.includes('failed')
      );
      
      const errorMessage = errorLines.length > 0 
        ? `Stream error: ${errorLines[errorLines.length - 1]}`
        : `Process exited with code ${code}`;
        
      await db.run(
        'UPDATE streams SET status = ?, error_message = ?, pid = NULL WHERE id = ?',
        ['stopped', errorMessage, streamId]
      );
    } else {
      // Clean stop - check if this was intentional
      console.log(`[CLEAN EXIT] Stream ${streamId} stopped cleanly`);
      await db.run(
        'UPDATE streams SET status = ?, error_message = NULL, pid = NULL WHERE id = ?',
        ['stopped', streamId]
      );
    }
  });

  let errorOutput = '';
  
  ffmpegProcess.stderr?.on('data', (data) => {
    const output = data.toString();
    console.log(`Stream ${streamId} FFmpeg:`, output);
    errorOutput += output;
    
    // Update stream statistics
    updateStreamStats(streamId, output);
  });

  // Also handle 'close' event as a fallback
  ffmpegProcess.on('close', (code, signal) => {
    console.log(`FFmpeg process for stream ${streamId} closed with code ${code} and signal ${signal}`);
    if (switchingStreams.has(streamId)) {
      return;
    }
    // Ensure it's removed from active streams
    if (activeStreams.has(streamId)) {
      activeStreams.delete(streamId);
      unregisterStream(streamId);
    }
  });

  // Update stream status to running (preserve started_at if hot-swapping)
  if (preserveStartedAt) {
    await db.run(
      'UPDATE streams SET status = ?, pid = ?, error_message = NULL WHERE id = ?',
      ['running', ffmpegProcess.pid || null, streamId]
    );
  } else {
    await db.run(
      'UPDATE streams SET status = ?, pid = ?, started_at = CURRENT_TIMESTAMP, error_message = NULL WHERE id = ?',
      ['running', ffmpegProcess.pid || null, streamId]
    );
  }

  // Register stream globally
  registerStream(streamId);

  await logActivity('stream_started', `Stream ${streamId} started`);
}

export async function stopStream(streamId: number, caller?: string): Promise<void> {
  const streamProcess = activeStreams.get(streamId);
  const db = await getDb();
  
  console.log(`[STOP REQUEST] Stream ${streamId} - Process exists: ${!!streamProcess}, Caller: ${caller || new Error().stack?.split('\n')[2]?.trim()}`);
  
  // Add safety check - verify this is an intentional stop
  const stream = await db.get('SELECT status, pid, rtmp_url FROM streams WHERE id = ?', [streamId]);
  if (!stream) {
    console.error(`[STOP ABORT] Stream ${streamId} not found in database`);
    return;
  }
  
  // Only stop if stream is actually running in database
  if (stream.status !== 'running') {
    console.log(`[STOP SKIP] Stream ${streamId} is already ${stream.status}, skipping stop`);
    return;
  }
  
  // Remove from active streams first
  activeStreams.delete(streamId);
  unregisterStream(streamId);
  
  // Update database immediately to reflect stopped status
  await db.run(
    'UPDATE streams SET status = ?, pid = NULL WHERE id = ?',
    ['stopped', streamId]
  );
  
  let killed = false;
  
  // Method 1: Try to kill using the ChildProcess object
  if (streamProcess?.process && !streamProcess.process.killed) {
    try {
      streamProcess.process.kill('SIGKILL');
      killed = true;
      console.log(`Killed stream ${streamId} using ChildProcess.kill()`);
    } catch (e) {
      console.log('ChildProcess.kill() failed:', e);
    }
  }
  
  // Method 2: Try to kill using stored PID
  const pid = streamProcess?.process?.pid || stream?.pid;
  if (pid && !killed) {
    console.log(`Trying to kill FFmpeg process with PID: ${pid}`);
    
    try {
      // Use kill -9 which is most reliable
      await execAsync(`kill -9 ${pid}`);
      killed = true;
      console.log(`Successfully killed FFmpeg process ${pid} for stream ${streamId}`);
    } catch (e) {
      console.log(`kill -9 ${pid} failed:`, e);
      
      // Try Node.js process.kill
      try {
        process.kill(pid, 'SIGKILL');
        killed = true;
        console.log(`Killed process ${pid} using process.kill`);
      } catch (e2) {
        console.log('process.kill also failed:', e2);
      }
    }
  }
  
  // Method 3: Kill by stream ID pattern (most reliable)
  try {
    // First try to find by stream ID metadata
    const { stdout: psOutput } = await execAsync(`ps aux | grep ffmpeg | grep "streamid:${streamId}" | grep -v grep`);
    const processes = psOutput.trim().split('\n').filter(line => line);
    
    console.log(`Found ${processes.length} FFmpeg processes with streamid:${streamId}`);
    
    for (const proc of processes) {
      const parts = proc.split(/\s+/);
      const procPid = parts[1];
      if (procPid) {
        try {
          await execAsync(`kill -9 ${procPid}`);
          killed = true;
          console.log(`Killed FFmpeg process ${procPid} by stream ID match`);
        } catch (e) {
          console.log(`Failed to kill PID ${procPid}:`, e);
        }
      }
    }
  } catch (e) {
    console.log('ps/grep for stream ID failed:', e);
  }
  
  // Method 4: Kill by RTMP URL pattern (fallback)
  if (!killed && stream?.rtmp_url) {
    const urls = stream.rtmp_url.split(/[\n,;|]+/).map((u: string) => u.trim()).filter(Boolean);
    for (const url of urls) {
      if (killed) break;
      try {
        const { stdout } = await execAsync(`ps aux | grep ffmpeg | grep "${url.replace(/"/g, '')}" | grep -v grep`);
        const processes = stdout.trim().split('\n').filter(line => line);
        
        for (const proc of processes) {
          const parts = proc.split(/\s+/);
          const procPid = parts[1];
          if (procPid) {
            try {
              await execAsync(`kill -9 ${procPid}`);
              killed = true;
            } catch (e) {
              console.log(`Failed to kill PID ${procPid}:`, e);
            }
          }
        }
      } catch (e) {
        // url search failed
      }
    }
    
    // Also try pkill as last resort
    if (!killed) {
      try {
        await execAsync(`pkill -9 -f "streamid:${streamId}"`);
        console.log(`Used pkill to stop processes with streamid:${streamId}`);
      } catch (e) {}
    }
  }
  
  // Method 5: Use dedicated kill script (ultimate fallback)
  if (!killed) {
    try {
      const scriptPath = path.join(process.cwd(), 'scripts', 'kill-stream.sh');
      await execAsync(`sh "${scriptPath}" ${streamId} "${stream?.rtmp_url || ''}"`);
      console.log(`Used kill script to stop stream ${streamId}`);
    } catch (e) {
      console.log('Kill script failed:', e);
    }
  }
  
  // Clear stream statistics
  clearStreamStats(streamId);
  
  await logActivity('stream_stopped', `Stream ${streamId} stop requested`);
}

export function getActiveStreams(): number[] {
  return Array.from(activeStreams.keys());
}

export async function stopAllStreams(): Promise<void> {
  activeStreams.forEach((streamProcess, streamId) => {
    streamProcess.process.kill('SIGTERM');
  });
  activeStreams.clear();
  
  const db = await getDb();
  await db.run('UPDATE streams SET status = ?, pid = NULL WHERE status = ?', ['stopped', 'running']);
}

/**
 * Switch video for a stream without ending the stream.
 * If stream is running, performs an instantaneous hot swap to the new video source
 * while preserving the live stream status and elapsed uptime.
 */
export async function switchStreamVideo(
  streamId: number,
  newVideoId: number
): Promise<{ success: boolean; videoName: string }> {
  const db = await getDb();

  // 1. Fetch stream
  const stream = await db.get('SELECT * FROM streams WHERE id = ?', [streamId]);
  if (!stream) {
    throw new Error(`Stream #${streamId} not found`);
  }

  // 2. Fetch new video
  const video = await db.get('SELECT * FROM videos WHERE id = ?', [newVideoId]);
  if (!video) {
    throw new Error(`Video #${newVideoId} not found`);
  }

  // Check file exists
  const absPath = path.isAbsolute(video.file_path)
    ? video.file_path
    : path.resolve(process.cwd(), video.file_path);

  if (!fs.existsSync(absPath)) {
    throw new Error(`Video file does not exist on disk: ${video.file_path}`);
  }

  // If stream is not currently running, simply update the DB record
  if (stream.status !== 'running') {
    await db.run(
      'UPDATE streams SET video_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newVideoId, streamId]
    );
    await logActivity(
      'stream_video_updated',
      `Stream "${stream.name}" video set to "${video.original_name}"`
    );
    return { success: true, videoName: video.original_name };
  }

  console.log(`[HOT SWAP] Seamlessly switching video for active stream ${streamId} to "${video.original_name}" (ID: ${newVideoId})`);

  // Protect from being marked 'stopped' by exit handlers
  switchingStreams.add(streamId);
  const originalStartedAt = stream.started_at;

  try {
    // 1. Terminate old FFmpeg process
    const activeItem = activeStreams.get(streamId);
    if (activeItem?.process) {
      try {
        activeItem.process.kill('SIGKILL');
      } catch (e) {
        console.log(`[HOT SWAP] kill failed for stream ${streamId}:`, e);
      }
    }

    const pid = activeItem?.process?.pid || stream.pid;
    if (pid) {
      try {
        await execAsync(`kill -9 ${pid}`);
      } catch (e) {}
    }
    try {
      await execAsync(`pkill -9 -f "streamid:${streamId}"`);
    } catch (e) {}

    activeStreams.delete(streamId);

    // 2. Short 150ms pause for socket release
    await new Promise((resolve) => setTimeout(resolve, 150));

    // 3. Update database record with new video_id
    await db.run(
      'UPDATE streams SET video_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newVideoId, streamId]
    );

    // 4. Start new stream process with new video while preserving started_at
    await startStream(
      streamId,
      {
        videoPath: video.file_path,
        rtmpUrl: stream.rtmp_url,
        quality: stream.quality || '720p',
        loop: stream.loop_enabled === 1,
      },
      true // preserveStartedAt
    );

    // Ensure in-memory state is preserved with original start time
    setStreamRunning(streamId, originalStartedAt);

    await logActivity(
      'stream_video_switched',
      `Hot-swapped live video on stream "${stream.name}" to "${video.original_name}" without ending stream`
    );

    return { success: true, videoName: video.original_name };
  } finally {
    switchingStreams.delete(streamId);
  }
}

/**
 * Hot-swap a running stream from video loop to an incoming live RTMP feed without ending the broadcast.
 */
export async function switchStreamToRtmp(
  streamId: number,
  rtmpSourceUrl: string
): Promise<{ success: boolean; sourceUrl: string }> {
  const db = await getDb();
  const stream = await db.get('SELECT * FROM streams WHERE id = ?', [streamId]);
  if (!stream) {
    throw new Error(`Stream #${streamId} not found`);
  }

  switchingStreams.add(streamId);
  const originalStartedAt = stream.started_at;

  try {
    const activeItem = activeStreams.get(streamId);
    if (activeItem?.process) {
      try {
        activeItem.process.kill('SIGKILL');
      } catch (e) {}
    }
    const pid = activeItem?.process?.pid || stream.pid;
    if (pid) {
      try {
        await execAsync(`kill -9 ${pid}`);
      } catch (e) {}
    }
    try {
      await execAsync(`pkill -9 -f "streamid:${streamId}"`);
    } catch (e) {}

    activeStreams.delete(streamId);
    await new Promise((resolve) => setTimeout(resolve, 150));

    await startStream(
      streamId,
      {
        sourceType: 'rtmp_ingest',
        sourceUrl: rtmpSourceUrl,
        rtmpUrl: stream.rtmp_url,
        quality: stream.quality || '720p',
        loop: false,
      },
      true // preserveStartedAt
    );

    setStreamRunning(streamId, originalStartedAt);

    await logActivity(
      'stream_switched_to_rtmp',
      `Hot-swapped stream "${stream.name}" to live incoming RTMP feed without dropping broadcast`
    );

    return { success: true, sourceUrl: rtmpSourceUrl };
  } finally {
    switchingStreams.delete(streamId);
  }
}