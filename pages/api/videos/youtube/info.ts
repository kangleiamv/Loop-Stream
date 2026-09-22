import { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/authMiddleware';
import { getBaseYtDlpCmd, formatYtDlpError } from '@/lib/youtubeCookies';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '00:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }
  return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return requireAuth(req, res, async (req, res) => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { url } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Please provide a valid YouTube URL' });
    }

    try {
      // Validate YouTube URL pattern
      const isYouTube = /(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/)|youtu\.be\/)/i.test(url);
      if (!isYouTube) {
        return res.status(400).json({ error: 'Invalid URL. Please provide a YouTube video or shorts link.' });
      }

      // Safe escape URL argument
      const sanitizedUrl = url.replace(/(["'$`\\])/g, '\\$1');
      const baseCmd = await getBaseYtDlpCmd();
      const cmd = `${baseCmd} -j --skip-download "${sanitizedUrl}"`;

      const { stdout } = await execAsync(cmd, { timeout: 30000 });
      const lines = stdout.trim().split('\n');

      let info: any = null;
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line.trim());
          if (parsed && (parsed.id || parsed.title)) {
            info = parsed;
            break;
          }
        } catch {}
      }

      if (!info) {
        throw new Error('yt-dlp completed but outputted no video metadata JSON.');
      }

      return res.status(200).json({
        id: info.id,
        title: info.title,
        uploader: info.uploader || info.channel || 'Unknown Uploader',
        thumbnail: info.thumbnail,
        durationSeconds: info.duration,
        durationFormatted: formatDuration(info.duration),
        resolution: info.resolution || (info.height ? `${info.height}p` : 'HD'),
        viewCount: info.view_count,
        url,
      });
    } catch (err: any) {
      console.error('Failed to get YouTube video info:', err);
      const formatted = formatYtDlpError(err);
      return res.status(formatted.requiresCookies ? 403 : 500).json({
        error: formatted.message,
        requiresCookies: formatted.requiresCookies,
        isPrivate: formatted.isPrivate,
      });
    }
  });
}
