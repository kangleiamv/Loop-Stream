import { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/authMiddleware';
import { getDb, logActivity } from '@/lib/database';
import { startStream } from '@/lib/ffmpeg';
import { setStreamRunning } from '@/lib/streamState';
import axios from 'axios';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return requireAuth(req, res, async (req, res) => {

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { streamId } = req.body;

  if (!streamId) {
    return res.status(400).json({ error: 'Missing stream ID' });
  }

  try {
    const db = await getDb();
    
    // Get stream details
    const stream = await db.get(
      `SELECT s.*, v.file_path, fb.file_path as fallback_file_path
       FROM streams s 
       LEFT JOIN videos v ON s.video_id = v.id 
       LEFT JOIN videos fb ON s.fallback_video_id = fb.id 
       WHERE s.id = ?`,
      [streamId]
    );
    
    if (!stream) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    if (stream.status === 'running') {
      return res.status(400).json({ error: 'Stream is already running' });
    }

    let inputPath = stream.file_path;
    let inputSourceType = stream.source_type || 'video';
    let inputSourceUrl = stream.source_url;

    if (inputSourceType === 'rtmp_ingest') {
      let isPublishing = false;
      try {
        const rtmpCheck = await axios.get('http://127.0.0.1:8000/status', { timeout: 1000 });
        const ingests = rtmpCheck.data?.ingests || [];
        isPublishing = ingests.some((ing: any) => ing.streamKey === stream.source_url);
      } catch {}

      if (isPublishing) {
        inputSourceUrl = `rtmp://127.0.0.1:1935/live/${stream.source_url}`;
      } else if (stream.fallback_file_path) {
        // Fall back to backup video until live RTMP connects!
        inputPath = stream.fallback_file_path;
        inputSourceType = 'video';
      } else {
        inputSourceUrl = `rtmp://127.0.0.1:1935/live/${stream.source_url}`;
      }
    }

    // Start FFmpeg process
    await startStream(stream.id, {
      videoPath: inputPath,
      sourceType: inputSourceType,
      sourceUrl: inputSourceUrl,
      rtmpUrl: stream.rtmp_url,
      quality: stream.quality || '720p',
      loop: inputSourceType === 'video' ? stream.loop_enabled === 1 : false,
    });

    // Mark stream as running in global state
    setStreamRunning(stream.id);

    res.status(200).json({ 
      success: true, 
      streamId: stream.id,
      message: 'Stream started successfully' 
    });
  } catch (error) {
    console.error('Start stream error:', error);
    res.status(500).json({ error: 'Failed to start stream' });
  }
  });
}