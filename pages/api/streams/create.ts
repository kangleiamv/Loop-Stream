import { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/authMiddleware';
import { getDb, logActivity } from '@/lib/database';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return requireAuth(req, res, async (req, res) => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { name, videoId, rtmpUrl, quality, loopEnabled, sourceType = 'video', sourceUrl, fallbackVideoId, autoStart } = req.body;

    let normalizedRtmpUrl = '';
    if (Array.isArray(rtmpUrl)) {
      normalizedRtmpUrl = rtmpUrl.map(u => String(u).trim()).filter(Boolean).join('\n');
    } else if (typeof rtmpUrl === 'string') {
      normalizedRtmpUrl = rtmpUrl.trim();
    }

    if (!name || !normalizedRtmpUrl) {
      return res.status(400).json({ error: 'Please provide a stream name and at least one destination URL' });
    }

    if (sourceType === 'video' && !videoId) {
      return res.status(400).json({ error: 'Please select a video for stored video looping' });
    }

    if (sourceType === 'rtmp_pull' && !sourceUrl) {
      return res.status(400).json({ error: 'Please provide the external RTMP / RTSP pull URL' });
    }

    try {
      const db = await getDb();
      
      const effectiveVideoId = videoId || fallbackVideoId || null;
      if (effectiveVideoId) {
        const video = await db.get('SELECT * FROM videos WHERE id = ?', [effectiveVideoId]);
        if (!video && sourceType === 'video') {
          return res.status(404).json({ error: 'Selected video not found' });
        }
      }

      // Check if stream already exists
      const existingStream = await db.get(
        'SELECT * FROM streams WHERE name = ? AND rtmp_url = ?',
        [name, normalizedRtmpUrl]
      );

      if (existingStream) {
        return res.status(400).json({ error: 'Stream already exists with this name and destination' });
      }

      const streamKey = sourceUrl || `live_${Date.now().toString(36)}`;

      // Create stream record (not started)
      const result = await db.run(
        `INSERT INTO streams 
          (name, video_id, rtmp_url, quality, loop_enabled, status, source_type, source_url, fallback_video_id, auto_start) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          name,
          effectiveVideoId,
          normalizedRtmpUrl,
          quality || '720p',
          loopEnabled ? 1 : 0,
          'stopped',
          sourceType,
          streamKey,
          fallbackVideoId || null,
          autoStart !== undefined ? (autoStart ? 1 : 0) : 1
        ]
      );

      await logActivity('stream_created', `Stream "${name}" created (Source: ${sourceType})`);

      res.status(200).json({ 
        success: true, 
        streamId: result.lastID,
        streamKey,
        message: 'Stream created successfully' 
      });
    } catch (error) {
      console.error('Create stream error:', error);
      res.status(500).json({ error: 'Failed to create stream' });
    }
  });
}