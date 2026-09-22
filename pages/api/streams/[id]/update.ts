import { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/authMiddleware';
import { getDb } from '@/lib/database';
import { switchStreamVideo } from '@/lib/ffmpeg';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return requireAuth(req, res, async (req, res) => {
    if (req.method !== 'PUT') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { id } = req.query;
    const { name, videoId, rtmpUrl, quality, loopEnabled, sourceType = 'video', sourceUrl, fallbackVideoId, autoStart } = req.body;

    let normalizedRtmpUrl = '';
    if (Array.isArray(rtmpUrl)) {
      normalizedRtmpUrl = rtmpUrl.map(u => String(u).trim()).filter(Boolean).join('\n');
    } else if (typeof rtmpUrl === 'string') {
      normalizedRtmpUrl = rtmpUrl.trim();
    }

    if (!id || !name || !normalizedRtmpUrl) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const streamId = parseInt(id as string, 10);
    const parsedVideoId = videoId ? parseInt(videoId as string, 10) : null;
    const parsedFallbackId = fallbackVideoId ? parseInt(fallbackVideoId as string, 10) : null;

    try {
      const db = await getDb();
      
      // Check if stream exists
      const stream = await db.get('SELECT * FROM streams WHERE id = ?', [streamId]);
      
      if (!stream) {
        return res.status(404).json({ error: 'Stream not found' });
      }

      if (parsedVideoId) {
        const video = await db.get('SELECT * FROM videos WHERE id = ?', [parsedVideoId]);
        if (!video && sourceType === 'video') {
          return res.status(404).json({ error: 'Video not found' });
        }
      }

      if (stream.status === 'running') {
        // If the video was changed on a stored video stream, hot-swap the video without ending stream!
        if (sourceType === 'video' && parsedVideoId && parsedVideoId !== stream.video_id) {
          await switchStreamVideo(streamId, parsedVideoId);
        }

        await db.run(
          `UPDATE streams 
           SET name = ?, rtmp_url = ?, quality = ?, loop_enabled = ?, source_type = ?, source_url = ?, fallback_video_id = ?, auto_start = ?, updated_at = CURRENT_TIMESTAMP 
           WHERE id = ?`,
          [name, normalizedRtmpUrl, quality || '720p', loopEnabled ? 1 : 0, sourceType, sourceUrl || stream.source_url, parsedFallbackId, autoStart !== undefined ? (autoStart ? 1 : 0) : 1, streamId]
        );

        return res.status(200).json({ 
          success: true, 
          message: 'Stream updated live without ending stream' 
        });
      }

      // Update stream
      await db.run(
        `UPDATE streams 
         SET name = ?, video_id = ?, rtmp_url = ?, quality = ?, loop_enabled = ?, source_type = ?, source_url = ?, fallback_video_id = ?, auto_start = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [name, parsedVideoId, normalizedRtmpUrl, quality || '720p', loopEnabled ? 1 : 0, sourceType, sourceUrl || stream.source_url, parsedFallbackId, autoStart !== undefined ? (autoStart ? 1 : 0) : 1, streamId]
      );

      res.status(200).json({ 
        success: true, 
        message: 'Stream updated successfully' 
      });
    } catch (error) {
      console.error('Update stream error:', error);
      res.status(500).json({ error: 'Failed to update stream' });
    }
  });
}