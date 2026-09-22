import { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/authMiddleware';
import { getDb } from '@/lib/database';
import { getActiveStreams, startStream, stopStream, switchStreamVideo, switchStreamToRtmp } from '@/lib/ffmpeg';
import axios from 'axios';

const MCP_TOOLS = [
  {
    name: 'list_streams',
    description: 'List all configured live streams with active status, quality, loop settings, and destinations.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_stream',
    description: 'Get comprehensive details, video path, PID, and live status for a specific stream ID.',
    inputSchema: {
      type: 'object',
      properties: { stream_id: { type: 'number', description: 'The ID of the stream to inspect' } },
      required: ['stream_id'],
    },
  },
  {
    name: 'start_stream',
    description: 'Start an idle or stopped live stream broadcast by its ID.',
    inputSchema: {
      type: 'object',
      properties: { stream_id: { type: 'number', description: 'The ID of the stream to start' } },
      required: ['stream_id'],
    },
  },
  {
    name: 'stop_stream',
    description: 'Stop an actively broadcasting live stream by its ID.',
    inputSchema: {
      type: 'object',
      properties: { stream_id: { type: 'number', description: 'The ID of the stream to stop' } },
      required: ['stream_id'],
    },
  },
  {
    name: 'switch_stream_video',
    description: 'Perform zero-drop hot-swapping of the video playing on an active live stream without stopping the broadcast or disconnecting viewers on YouTube/Twitch.',
    inputSchema: {
      type: 'object',
      properties: {
        stream_id: { type: 'number', description: 'ID of the running stream' },
        video_id: { type: 'number', description: 'ID of the new video from the library to switch to' },
      },
      required: ['stream_id', 'video_id'],
    },
  },
  {
    name: 'switch_stream_to_rtmp',
    description: 'Hot-swap an active live stream over to an incoming RTMP ingest feed without terminating the outgoing broadcast.',
    inputSchema: {
      type: 'object',
      properties: {
        stream_id: { type: 'number', description: 'ID of the running stream' },
        stream_key: { type: 'string', description: 'The RTMP stream key to switch to' },
      },
      required: ['stream_id', 'stream_key'],
    },
  },
  {
    name: 'create_stream',
    description: 'Create a new continuous 24/7 stream or RTMP ingest relay with multi-destination targets.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Stream name' },
        rtmp_url: { type: 'string', description: 'RTMP destination URL(s)' },
        quality: { type: 'string', enum: ['720p', '1080p', 'vertical-720p', 'vertical-1080p', 'original'] },
        loop_enabled: { type: 'boolean', default: true },
        source_type: { type: 'string', enum: ['video', 'rtmp_ingest', 'rtmp_pull'] },
        video_id: { type: 'number' },
        source_url: { type: 'string' },
        fallback_video_id: { type: 'number' },
        auto_start: { type: 'boolean', default: true },
      },
      required: ['name', 'rtmp_url'],
    },
  },
  {
    name: 'delete_stream',
    description: 'Permanently delete a configured stream by ID.',
    inputSchema: {
      type: 'object',
      properties: { stream_id: { type: 'number', description: 'ID of the stream to delete' } },
      required: ['stream_id'],
    },
  },
  {
    name: 'list_videos',
    description: 'List all stored videos in the library with duration, resolution, size, and thumbnails.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'import_youtube_video',
    description: 'Download and import a YouTube video or Shorts link directly into the LOOP STREAM video library for 24/7 continuous looping.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'YouTube video or shorts link' },
        custom_title: { type: 'string', description: 'Optional custom title' },
      },
      required: ['url'],
    },
  },
  {
    name: 'get_system_stats',
    description: 'Get host hardware telemetry: CPU load, RAM usage, storage space, and active FFmpeg streamers.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_rtmp_status',
    description: 'Get RTMP Receiver status, active incoming ingest streams (resolution, FPS, bitrate), and connection endpoints.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'generate_rtmp_key',
    description: 'Generate a new secure RTMP stream key for OBS Studio, vMix, or hardware encoders.',
    inputSchema: { type: 'object', properties: {} },
  },
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return requireAuth(req, res, async (req, res) => {
    const host = req.headers.host || 'localhost:3000';
    const apiKey = process.env.LOOPSTREAM_API_KEY || 'ls_mcp_' + (process.env.SESSION_SECRET ? process.env.SESSION_SECRET.substring(0, 24) : 'key_default_8819');

    // GET /api/mcp: Server info and config templates
    if (req.method === 'GET') {
      return res.status(200).json({
        server: {
          name: 'loopstream-mcp',
          version: '1.0.0',
          protocolVersion: '2024-11-05',
          description: 'Model Context Protocol (MCP) server for LOOP STREAM by CMAISNAM',
        },
        tools: MCP_TOOLS,
        resources: [
          { uri: 'loopstream://streams', name: 'Active Streams' },
          { uri: 'loopstream://system', name: 'System Hardware Metrics' },
          { uri: 'loopstream://rtmp', name: 'RTMP Ingest Sessions' },
        ],
        configurations: {
          claudeDesktop: {
            mcpServers: {
              loopstream: {
                command: 'node',
                args: ['/home/ubuntu/loopstream/QC-Live/scripts/mcp-server.js'],
                env: {
                  LOOPSTREAM_API_BASE: `http://127.0.0.1:3000`,
                  LOOPSTREAM_INTERNAL_KEY: 'loopstream-internal-mcp-key',
                },
              },
            },
          },
          cursor: {
            mcpServers: {
              loopstream: {
                command: 'node',
                args: ['/home/ubuntu/loopstream/QC-Live/scripts/mcp-server.js'],
              },
            },
          },
        },
        apiKey,
      });
    }

    // POST /api/mcp: JSON-RPC 2.0 or REST tool caller
    if (req.method === 'POST') {
      const { method, params, id = 1, tool, arguments: args } = req.body;

      // Handle JSON-RPC initialize
      if (method === 'initialize') {
        return res.status(200).json({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: { listChanged: true }, resources: { listChanged: true } },
            serverInfo: { name: 'loopstream-mcp', version: '1.0.0' },
          },
        });
      }

      // Handle JSON-RPC tools/list
      if (method === 'tools/list') {
        return res.status(200).json({
          jsonrpc: '2.0',
          id,
          result: { tools: MCP_TOOLS },
        });
      }

      // Determine tool name and parameters (support both JSON-RPC and REST formats)
      const toolName = tool || (method === 'tools/call' ? params?.name : method);
      const toolArgs = args || (method === 'tools/call' ? params?.arguments : params) || {};

      const db = await getDb();

      try {
        let result: any = null;

        switch (toolName) {
          case 'list_streams': {
            const streams = await db.all(
              `SELECT s.*, v.original_name as video_name, fb.original_name as fallback_video_name
               FROM streams s
               LEFT JOIN videos v ON s.video_id = v.id
               LEFT JOIN videos fb ON s.fallback_video_id = fb.id
               ORDER BY s.id DESC`
            );
            result = {
              totalCount: streams.length,
              runningCount: streams.filter((s: any) => s.status === 'running').length,
              streams,
            };
            break;
          }

          case 'get_stream': {
            const streamId = toolArgs.stream_id || toolArgs.streamId;
            const stream = await db.get(
              `SELECT s.*, v.original_name as video_name, v.file_path, fb.original_name as fallback_video_name
               FROM streams s
               LEFT JOIN videos v ON s.video_id = v.id
               LEFT JOIN videos fb ON s.fallback_video_id = fb.id
               WHERE s.id = ?`,
              [streamId]
            );
            if (!stream) {
              return res.status(404).json({ jsonrpc: '2.0', id, error: { code: -32602, message: `Stream #${streamId} not found` } });
            }
            result = stream;
            break;
          }

          case 'start_stream': {
            const streamId = toolArgs.stream_id || toolArgs.streamId;
            const startRes = await axios.post(
              `http://127.0.0.1:3000/api/streams/start`,
              { streamId },
              { headers: { 'x-loopstream-internal-key': 'loopstream-internal-mcp-key' } }
            );
            result = startRes.data;
            break;
          }

          case 'stop_stream': {
            const streamId = toolArgs.stream_id || toolArgs.streamId;
            const stopRes = await axios.post(
              `http://127.0.0.1:3000/api/streams/stop`,
              { streamId },
              { headers: { 'x-loopstream-internal-key': 'loopstream-internal-mcp-key' } }
            );
            result = stopRes.data;
            break;
          }

          case 'switch_stream_video': {
            const streamId = toolArgs.stream_id || toolArgs.streamId;
            const videoId = toolArgs.video_id || toolArgs.videoId;
            const video = await db.get('SELECT * FROM videos WHERE id = ?', [videoId]);
            if (!video) {
              return res.status(404).json({ jsonrpc: '2.0', id, error: { code: -32602, message: `Video #${videoId} not found` } });
            }
            await switchStreamVideo(streamId, video.file_path);
            await db.run('UPDATE streams SET video_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [videoId, streamId]);
            result = { success: true, message: `Zero-drop video switch applied to Stream #${streamId}. Video: ${video.original_name}` };
            break;
          }

          case 'switch_stream_to_rtmp': {
            const streamId = toolArgs.stream_id || toolArgs.streamId;
            const streamKey = toolArgs.stream_key || toolArgs.streamKey;
            const rtmpUrl = `rtmp://127.0.0.1:1935/live/${streamKey}`;
            await switchStreamToRtmp(streamId, rtmpUrl);
            result = { success: true, message: `Stream #${streamId} hot-swapped to RTMP live feed.` };
            break;
          }

          case 'list_videos': {
            const videos = await db.all('SELECT * FROM videos ORDER BY created_at DESC');
            result = { totalCount: videos.length, videos };
            break;
          }

          case 'import_youtube_video': {
            const videoUrl = toolArgs.url;
            const customTitle = toolArgs.custom_title || toolArgs.customTitle;
            const importRes = await axios.post(
              `http://127.0.0.1:3000/api/videos/youtube/import`,
              { url: videoUrl, customTitle },
              { headers: { 'x-loopstream-internal-key': 'loopstream-internal-mcp-key' } }
            );
            result = importRes.data;
            break;
          }

          case 'get_system_stats': {
            const statsRes = await axios.get(`http://127.0.0.1:3000/api/system/stats`, {
              headers: { 'x-loopstream-internal-key': 'loopstream-internal-mcp-key' },
            });
            result = statsRes.data;
            break;
          }

          case 'get_rtmp_status': {
            let rtmpData: any = { isRunning: false, activeCount: 0, ingests: [] };
            try {
              const rtmpRes = await axios.get('http://127.0.0.1:8000/status', { timeout: 1000 });
              rtmpData = {
                isRunning: rtmpRes.data.status === 'online',
                rtmpPort: rtmpRes.data.rtmpPort,
                httpPort: rtmpRes.data.httpPort,
                activeCount: rtmpRes.data.activeCount,
                ingests: rtmpRes.data.ingests,
                uptimeSeconds: rtmpRes.data.uptimeSeconds,
              };
            } catch {}
            result = rtmpData;
            break;
          }

          case 'generate_rtmp_key': {
            const key = 'live_' + Math.random().toString(36).substring(2, 14);
            result = {
              streamKey: key,
              serverUrl: `rtmp://${host.split(':')[0]}:1935/live`,
              fullUrl: `rtmp://${host.split(':')[0]}:1935/live/${key}`,
            };
            break;
          }

          default:
            return res.status(400).json({
              jsonrpc: '2.0',
              id,
              error: { code: -32601, message: `Method or tool "${toolName}" not found.` },
            });
        }

        // Return standard MCP / JSON-RPC tool response
        return res.status(200).json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            data: result,
          },
        });
      } catch (toolError: any) {
        return res.status(500).json({
          jsonrpc: '2.0',
          id,
          error: { code: -32603, message: toolError.message || 'Internal tool execution error' },
        });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
  });
}
