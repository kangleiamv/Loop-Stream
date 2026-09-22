import { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/authMiddleware';
import { listApiKeys, createApiKey } from '@/lib/database';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return requireAuth(req, res, async (req, res) => {
    switch (req.method) {
      case 'GET': {
        try {
          const keys = await listApiKeys();
          return res.status(200).json({
            success: true,
            keys,
            primaryKey: keys.length > 0 ? keys[0].key : null,
          });
        } catch (err: any) {
          console.error('Error listing API keys:', err);
          return res.status(500).json({ error: `Failed to list API keys: ${err.message}` });
        }
      }

      case 'POST': {
        try {
          const { name } = req.body || {};
          const newKey = await createApiKey(name || 'API Key');
          return res.status(201).json({
            success: true,
            message: 'API Key generated successfully!',
            key: newKey,
          });
        } catch (err: any) {
          console.error('Error generating API key:', err);
          return res.status(500).json({ error: `Failed to generate API key: ${err.message}` });
        }
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  });
}
