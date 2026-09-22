import { NextApiRequest, NextApiResponse } from 'next';
import { getDb, logActivity } from '@/lib/database';
import { switchStreamToRtmp, switchStreamVideo, startStream } from '@/lib/ffmpeg';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { event, streamKey, ip } = req.body;

  if (!event || !streamKey) {
    return res.status(400).json({ error: 'Missing event or streamKey' });
  }

  try {
    const db = await getDb();

    // Find streams configured for rtmp_ingest that match this streamKey
    const matchingStreams = await db.all(
      `SELECT s.*, v.file_path as fallback_file_path, v.original_name as fallback_name
       FROM streams s
       LEFT JOIN videos v ON s.fallback_video_id = v.id
       WHERE s.source_type = 'rtmp_ingest' AND (s.source_url = ? OR s.source_url = ? OR s.name = ?)`,
      [streamKey, `/live/${streamKey}`, streamKey]
    );

    console.log(`[RTMP WEBHOOK] Event "${event}" for streamKey "${streamKey}". Matched streams: ${matchingStreams.length}`);

    const rtmpLiveUrl = `rtmp://127.0.0.1:1935/live/${streamKey}`;

    for (const stream of matchingStreams) {
      if (event === 'postPublish') {
        // Publisher connected!
        if (stream.status === 'running') {
          console.log(`[RTMP HOOK] Hot-swapping running stream #${stream.id} (${stream.name}) to live RTMP feed`);
          await switchStreamToRtmp(stream.id, rtmpLiveUrl);
        } else if (stream.auto_start) {
          console.log(`[RTMP HOOK] Auto-starting stream #${stream.id} (${stream.name}) with live RTMP feed`);
          await startStream(stream.id, {
            sourceType: 'rtmp_ingest',
            sourceUrl: rtmpLiveUrl,
            rtmpUrl: stream.rtmp_url,
            quality: stream.quality || '720p',
            loop: false,
          });
          await db.run('UPDATE streams SET status = ?, started_at = CURRENT_TIMESTAMP WHERE id = ?', ['running', stream.id]);
        }
        await logActivity(
          'rtmp_ingest_started',
          `Incoming live RTMP received on /live/${streamKey} from ${ip || 'unknown'}`
        );
      } else if (event === 'donePublish') {
        // Publisher disconnected!
        if (stream.status === 'running') {
          if (stream.fallback_video_id && stream.fallback_file_path) {
            console.log(`[RTMP HOOK] Publisher disconnected. Engaging fallback video for stream #${stream.id}`);
            await switchStreamVideo(stream.id, stream.fallback_video_id);
            await logActivity(
              'rtmp_fallback_engaged',
              `Live RTMP input disconnected on /live/${streamKey}. Seamlessly engaged fallback backup video "${stream.fallback_name}". Live broadcast preserved.`
            );
          } else {
            await logActivity(
              'rtmp_ingest_stopped',
              `Live RTMP input disconnected on /live/${streamKey}`
            );
          }
        }
      }
    }

    return res.status(200).json({ success: true, matchedCount: matchingStreams.length });
  } catch (error: any) {
    console.error('[RTMP WEBHOOK ERROR]', error);
    return res.status(500).json({ error: error.message });
  }
}
