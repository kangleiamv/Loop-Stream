import { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/authMiddleware';
import { deleteApiKey } from '@/lib/database';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return requireAuth(req, res, async (req, res) => {
    if (req.method !== 'DELETE') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { id } = req.query;
    const numericId = parseInt(id as string, 10);

    if (isNaN(numericId)) {
      return res.status(400).json({ error: 'Invalid API key ID' });
    }

    try {
      const deleted = await deleteApiKey(numericId);
      if (!deleted) {
        return res.status(404).json({ error: 'API key not found' });
      }

      return res.status(200).json({
        success: true,
        message: 'API key revoked successfully',
      });
    } catch (err: any) {
      console.error('Error deleting API key:', err);
      return res.status(500).json({ error: `Failed to delete API key: ${err.message}` });
    }
  });
}
