#!/usr/bin/env node

/**
 * LOOP STREAM by CMAISNAM - Model Context Protocol (MCP) Server
 * 
 * Provides an MCP compliant server allowing AI assistants (Claude Desktop, Cursor, Antigravity, etc.)
 * to inspect, orchestrate, control, and hot-swap 24/7 live streams and RTMP ingest feeds.
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const axios = require('axios');

const BASE_URL = process.env.LOOPSTREAM_API_BASE || 'http://127.0.0.1:3000';
const INTERNAL_SECRET = process.env.LOOPSTREAM_INTERNAL_KEY || 'loopstream-internal-mcp-key';
const API_KEY = process.env.LOOPSTREAM_API_KEY;

const clientHeaders = {
  'Content-Type': 'application/json',
};

if (API_KEY) {
  clientHeaders['x-api-key'] = API_KEY;
} else {
  clientHeaders['x-loopstream-internal-key'] = INTERNAL_SECRET;
}

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: clientHeaders,
});

const server = new McpServer({
  name: 'loopstream-mcp',
  version: '1.0.0',
});

// ==========================================
// 1. TOOL: list_streams
// ==========================================
server.tool(
  'list_streams',
  'List all configured live streams, active status (running/stopped), quality presets, loop settings, and destinations.',
  {},
  async () => {
    try {
      const res = await client.get('/api/streams/list');
      const streams = res.data.streams || [];
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            totalCount: streams.length,
            runningCount: streams.filter(s => s.status === 'running').length,
            streams,
          }, null, 2),
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Failed to list streams: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ==========================================
// 2. TOOL: get_stream
// ==========================================
server.tool(
  'get_stream',
  'Get comprehensive details, video path, PID, and live status for a specific stream ID.',
  {
    stream_id: z.number().describe('The ID of the stream to inspect'),
  },
  async ({ stream_id }) => {
    try {
      const res = await client.get('/api/streams/list');
      const stream = (res.data.streams || []).find((s) => s.id === stream_id);
      if (!stream) {
        return {
          content: [{ type: 'text', text: `Stream #${stream_id} not found.` }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(stream, null, 2) }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Failed to fetch stream details: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ==========================================
// 3. TOOL: start_stream
// ==========================================
server.tool(
  'start_stream',
  'Start an idle or stopped live stream broadcast by its ID.',
  {
    stream_id: z.number().describe('The ID of the stream to start'),
  },
  async ({ stream_id }) => {
    try {
      const res = await client.post('/api/streams/start', { streamId: stream_id });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: `Stream #${stream_id} started successfully.`,
            data: res.data,
          }, null, 2),
        }],
      };
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      return {
        content: [{ type: 'text', text: `Failed to start stream #${stream_id}: ${msg}` }],
        isError: true,
      };
    }
  }
);

// ==========================================
// 4. TOOL: stop_stream
// ==========================================
server.tool(
  'stop_stream',
  'Stop an actively broadcasting live stream by its ID.',
  {
    stream_id: z.number().describe('The ID of the stream to stop'),
  },
  async ({ stream_id }) => {
    try {
      const res = await client.post('/api/streams/stop', { streamId: stream_id });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: `Stream #${stream_id} stopped successfully.`,
            data: res.data,
          }, null, 2),
        }],
      };
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      return {
        content: [{ type: 'text', text: `Failed to stop stream #${stream_id}: ${msg}` }],
        isError: true,
      };
    }
  }
);

// ==========================================
// 5. TOOL: switch_stream_video
// ==========================================
server.tool(
  'switch_stream_video',
  'Perform zero-drop hot-swapping of the video playing on an active live stream without stopping the broadcast or disconnecting viewers on YouTube/Twitch.',
  {
    stream_id: z.number().describe('ID of the running stream'),
    video_id: z.number().describe('ID of the new video from the library to switch to'),
  },
  async ({ stream_id, video_id }) => {
    try {
      const res = await client.post(`/api/streams/${stream_id}/switch-video`, { videoId: video_id });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: `Successfully hot-swapped video on stream #${stream_id} with zero broadcast drop!`,
            data: res.data,
          }, null, 2),
        }],
      };
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      return {
        content: [{ type: 'text', text: `Failed to switch video on stream #${stream_id}: ${msg}` }],
        isError: true,
      };
    }
  }
);

// ==========================================
// 6. TOOL: switch_stream_to_rtmp
// ==========================================
server.tool(
  'switch_stream_to_rtmp',
  'Hot-swap an active live stream over to an incoming RTMP ingest feed without terminating the outgoing broadcast.',
  {
    stream_id: z.number().describe('ID of the running stream'),
    stream_key: z.string().describe('The RTMP stream key to switch to (e.g. "live_abc123" or OBS key)'),
  },
  async ({ stream_id, stream_key }) => {
    try {
      const res = await client.post('/api/rtmp/webhook', {
        event: 'postPublish',
        streamKey: stream_key,
        ip: '127.0.0.1',
      });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: `Stream #${stream_id} hot-swapped to incoming RTMP key "${stream_key}".`,
            data: res.data,
          }, null, 2),
        }],
      };
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      return {
        content: [{ type: 'text', text: `Failed to switch stream to RTMP: ${msg}` }],
        isError: true,
      };
    }
  }
);

// ==========================================
// 7. TOOL: create_stream
// ==========================================
server.tool(
  'create_stream',
  'Create a new continuous 24/7 stream or RTMP ingest relay with multi-destination targets.',
  {
    name: z.string().describe('Stream name or title'),
    rtmp_url: z.string().describe('Single RTMP destination or multiple RTMP URLs separated by newlines'),
    quality: z.enum(['720p', '1080p', 'vertical-720p', 'vertical-1080p', 'original']).default('720p'),
    loop_enabled: z.boolean().default(true).describe('Continuous 24/7 looping'),
    source_type: z.enum(['video', 'rtmp_ingest', 'rtmp_pull']).default('video'),
    video_id: z.number().optional().describe('Video library ID if sourceType is "video"'),
    source_url: z.string().optional().describe('OBS stream key or external RTMP/RTSP pull URL'),
    fallback_video_id: z.number().optional().describe('Fallback loop video ID when RTMP disconnects'),
    auto_start: z.boolean().default(true).describe('Auto start stream when publisher connects or on reboot'),
  },
  async ({ name, rtmp_url, quality, loop_enabled, source_type, video_id, source_url, fallback_video_id, auto_start }) => {
    try {
      const res = await client.post('/api/streams/create', {
        name,
        rtmpUrl: rtmp_url,
        quality,
        loopEnabled: loop_enabled,
        sourceType: source_type,
        videoId: video_id,
        sourceUrl: source_url,
        fallbackVideoId: fallback_video_id,
        autoStart: auto_start,
      });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: `Stream "${name}" created successfully.`,
            streamId: res.data.streamId,
            streamKey: res.data.streamKey,
          }, null, 2),
        }],
      };
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      return {
        content: [{ type: 'text', text: `Failed to create stream: ${msg}` }],
        isError: true,
      };
    }
  }
);

// ==========================================
// 8. TOOL: delete_stream
// ==========================================
server.tool(
  'delete_stream',
  'Permanently delete a configured stream by ID.',
  {
    stream_id: z.number().describe('ID of the stream to delete'),
  },
  async ({ stream_id }) => {
    try {
      const res = await client.delete(`/api/streams/${stream_id}/delete`);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: true, message: `Stream #${stream_id} deleted.` }, null, 2),
        }],
      };
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      return {
        content: [{ type: 'text', text: `Failed to delete stream #${stream_id}: ${msg}` }],
        isError: true,
      };
    }
  }
);

// ==========================================
// 9. TOOL: list_videos
// ==========================================
server.tool(
  'list_videos',
  'List all stored videos in the library with duration, resolution, size, and thumbnails.',
  {},
  async () => {
    try {
      const res = await client.get('/api/videos/list');
      const videos = res.data.videos || [];
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            totalCount: videos.length,
            videos,
          }, null, 2),
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Failed to list videos: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ==========================================
// 10. TOOL: import_youtube_video
// ==========================================
server.tool(
  'import_youtube_video',
  'Download and import a YouTube video or Shorts link directly into the LOOP STREAM video library for 24/7 continuous looping.',
  {
    url: z.string().describe('YouTube video or shorts link (e.g. https://www.youtube.com/watch?v=... or https://youtu.be/...)'),
    custom_title: z.string().optional().describe('Optional custom title to assign to the imported video'),
  },
  async ({ url, custom_title }) => {
    try {
      const res = await client.post('/api/videos/youtube/import', {
        url,
        customTitle: custom_title,
      });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: 'YouTube video imported successfully!',
            video: res.data.video,
          }, null, 2),
        }],
      };
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      return {
        content: [{ type: 'text', text: `Failed to import YouTube video: ${msg}` }],
        isError: true,
      };
    }
  }
);

// ==========================================
// 11. TOOL: get_system_stats
// ==========================================
server.tool(
  'get_system_stats',
  'Get host hardware telemetry: CPU load, RAM usage, storage space, and active FFmpeg streamers.',
  {},
  async () => {
    try {
      const res = await client.get('/api/system/stats');
      return {
        content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Failed to retrieve system stats: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ==========================================
// 11. TOOL: get_rtmp_status
// ==========================================
server.tool(
  'get_rtmp_status',
  'Get RTMP Receiver status, active incoming ingest streams (resolution, FPS, bitrate, publisher IP), and connection endpoints.',
  {},
  async () => {
    try {
      const res = await client.get('/api/rtmp/status');
      return {
        content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Failed to get RTMP status: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ==========================================
// 12. TOOL: generate_rtmp_key
// ==========================================
server.tool(
  'generate_rtmp_key',
  'Generate a new secure RTMP stream key for OBS Studio, vMix, or hardware encoders.',
  {},
  async () => {
    try {
      const res = await client.post('/api/rtmp/generate-key');
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            streamKey: res.data.streamKey,
            serverUrl: `rtmp://${process.env.PUBLIC_HOST || 'localhost'}:1935/live`,
            fullUrl: `rtmp://${process.env.PUBLIC_HOST || 'localhost'}:1935/live/${res.data.streamKey}`,
          }, null, 2),
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Failed to generate RTMP key: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ==========================================
// MCP Resources
// ==========================================
server.resource(
  'streams',
  'loopstream://streams',
  async (uri) => {
    try {
      const res = await client.get('/api/streams/list');
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(res.data, null, 2),
          mimeType: 'application/json',
        }],
      };
    } catch (err) {
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify({ error: err.message }),
          mimeType: 'application/json',
        }],
      };
    }
  }
);

server.resource(
  'system',
  'loopstream://system',
  async (uri) => {
    try {
      const res = await client.get('/api/system/stats');
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(res.data, null, 2),
          mimeType: 'application/json',
        }],
      };
    } catch (err) {
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify({ error: err.message }),
          mimeType: 'application/json',
        }],
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[LOOP STREAM MCP] Model Context Protocol server running via stdio.');
}

main().catch((err) => {
  console.error('[LOOP STREAM MCP] Fatal error:', err);
  process.exit(1);
});
