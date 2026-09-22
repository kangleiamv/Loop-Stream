import { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/authMiddleware';
import { testYouTubeCookies } from '@/lib/youtubeCookies';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return requireAuth(req, res, async (req, res) => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { url } = req.body || {};
    const testUrl = url && typeof url === 'string' && url.trim()
      ? url.trim()
      : 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

    try {
      const result = await testYouTubeCookies(testUrl);
      if (result.success) {
        return res.status(200).json(result);
      } else {
        return res.status(400).json(result);
      }
    } catch (err: any) {
      console.error('Error during YouTube cookie test:', err);
      return res.status(500).json({
        success: false,
        error: `Unexpected test failure: ${err.message}`,
      });
    }
  });
}
