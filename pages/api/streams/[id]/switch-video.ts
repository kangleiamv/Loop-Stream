import { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/authMiddleware';
import { switchStreamVideo } from '@/lib/ffmpeg';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return requireAuth(req, res, async (req, res) => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { id } = req.query;
    const { videoId } = req.body;

    if (!id || !videoId) {
      return res.status(400).json({ error: 'Missing stream ID or video ID' });
    }

    const streamId = parseInt(id as string, 10);
    const newVideoId = parseInt(videoId as string, 10);

    if (isNaN(streamId) || isNaN(newVideoId)) {
      return res.status(400).json({ error: 'Invalid stream ID or video ID' });
    }

    try {
      const result = await switchStreamVideo(streamId, newVideoId);
      res.status(200).json({
        success: true,
        message: `Video switched to "${result.videoName}" without ending stream`,
        videoName: result.videoName,
      });
    } catch (error: any) {
      console.error(`Error switching video for stream ${streamId}:`, error);
      res.status(500).json({ error: error.message || 'Failed to switch video' });
    }
  });
}
