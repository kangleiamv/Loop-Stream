import { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/authMiddleware';
import { loadCookies, saveCookies, deleteCookies } from '@/lib/youtubeCookies';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return requireAuth(req, res, async (req, res) => {
    switch (req.method) {
      case 'GET': {
        try {
          const cookieStatus = await loadCookies();
          return res.status(200).json(cookieStatus);
        } catch (err: any) {
          console.error('Error loading cookies:', err);
          return res.status(500).json({ error: `Failed to load cookies: ${err.message}` });
        }
      }

      case 'POST': {
        try {
          const { cookies } = req.body;
          if (!cookies) {
            return res.status(400).json({ error: 'Please provide cookie data in cookies.json format.' });
          }

          const savedStatus = await saveCookies(cookies);
          return res.status(200).json({
            success: true,
            message: `Successfully saved ${savedStatus.totalCount} cookies (${savedStatus.youtubeCount} YouTube cookies)!`,
            ...savedStatus,
          });
        } catch (err: any) {
          console.error('Error saving cookies:', err);
          return res.status(400).json({ error: err.message || 'Failed to parse and save cookies.' });
        }
      }

      case 'DELETE': {
        try {
          await deleteCookies();
          return res.status(200).json({
            success: true,
            message: 'Cookies cleared successfully.',
            configured: false,
            totalCount: 0,
            youtubeCount: 0,
            hasAuthCookies: false,
            detectedAuthCookies: [],
            updatedAt: null,
            fileSize: 0,
            rawJson: '',
            source: 'none',
          });
        } catch (err: any) {
          console.error('Error deleting cookies:', err);
          return res.status(500).json({ error: `Failed to delete cookies: ${err.message}` });
        }
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  });
}
