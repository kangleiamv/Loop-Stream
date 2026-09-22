import { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/authMiddleware';
import crypto from 'crypto';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return requireAuth(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const randomSuffix = crypto.randomBytes(6).toString('hex');
    const streamKey = `live_${randomSuffix}`;

    return res.status(200).json({ streamKey });
  });
}
