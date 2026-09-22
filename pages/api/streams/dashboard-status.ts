import { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/authMiddleware';
import { getDb } from '@/lib/database';
import { getAllActiveStreams } from '@/lib/stream-manager';
import { getStreamStats } from '@/lib/streamStats';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return requireAuth(req, res, async (req, res) => {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const db = await getDb();
      
      // Get running streams from database joined with video info
      const streams = await db.all(`
        SELECT 
          s.id,
          s.name,
          s.video_id,
          s.rtmp_url,
          s.quality,
          s.loop_enabled,
          s.status,
          s.pid,
          s.started_at,
          s.error_message,
          s.source_type,
          s.source_url,
          s.fallback_video_id,
          v.filename as video_filename,
          v.original_name as video_title,
          v.thumbnail_path as video_thumbnail,
          v.duration as video_duration,
          v.file_size as video_file_size
        FROM streams s
        LEFT JOIN videos v ON s.video_id = v.id
        WHERE s.status = 'running'
        ORDER BY s.started_at DESC
      `);

      // Get active streams from memory
      const globalActiveStreams = getAllActiveStreams();
      const activeIds = new Set(globalActiveStreams.map(s => s.streamId));

      // Enrich running streams with real-time streamStats
      const runningStreams = streams
        .filter((stream: any) => activeIds.has(stream.id) || stream.status === 'running')
        .map((stream: any) => {
          const stats = getStreamStats(stream.id);
          return {
            ...stream,
            stats: stats || {
              bitrate: 0,
              fps: 0,
              speed: 0,
              droppedFrames: 0,
              duration: 0,
              quality: 'good',
              errors: [],
            },
          };
        });

      // Get recent activity logs
      const recentActivity = await db.all(
        'SELECT id, action, details, created_at FROM activity_logs ORDER BY id DESC LIMIT 6'
      ).catch(() => []);

      res.status(200).json({ 
        streams: runningStreams,
        activeCount: runningStreams.length,
        recentActivity,
      });
    } catch (error) {
      console.error('Dashboard status error:', error);
      res.status(500).json({ error: 'Failed to fetch stream status' });
    }
  });
}