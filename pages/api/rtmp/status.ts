import { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/authMiddleware';
import { getDb } from '@/lib/database';
import axios from 'axios';
import os from 'os';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return requireAuth(req, res, async () => {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      let rtmpServiceStatus: any = {
        status: 'offline',
        rtmpPort: 1935,
        httpPort: 8000,
        activeCount: 0,
        ingests: [],
        uptimeSeconds: 0,
      };

      try {
        const response = await axios.get('http://127.0.0.1:8000/status', { timeout: 1500 });
        rtmpServiceStatus = response.data;
      } catch {
        // RTMP service may still be starting
      }

      // Determine public host/IP
      const host = req.headers.host ? req.headers.host.split(':')[0] : 'localhost';
      const rtmpServerUrl = `rtmp://${host}:${rtmpServiceStatus.rtmpPort || 1935}/live`;

      const db = await getDb();
      const configuredIngestStreams = await db.all(
        `SELECT s.*, v.original_name as fallback_video_name 
         FROM streams s
         LEFT JOIN videos v ON s.fallback_video_id = v.id
         WHERE s.source_type = 'rtmp_ingest' OR s.source_type = 'rtmp_pull'
         ORDER BY s.id DESC`
      );

      return res.status(200).json({
        isRunning: rtmpServiceStatus.status === 'online',
        rtmpPort: rtmpServiceStatus.rtmpPort || 1935,
        httpPort: rtmpServiceStatus.httpPort || 8000,
        serverUrl: rtmpServerUrl,
        host,
        activeIngests: rtmpServiceStatus.ingests || [],
        activeCount: rtmpServiceStatus.activeCount || 0,
        uptimeSeconds: rtmpServiceStatus.uptimeSeconds || 0,
        configuredStreams: configuredIngestStreams,
      });
    } catch (error: any) {
      console.error('Failed to get RTMP status:', error);
      return res.status(500).json({ error: 'Failed to retrieve RTMP receiver status' });
    }
  });
}
