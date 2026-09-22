import { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/authMiddleware';
import { getDb, logActivity } from '@/lib/database';
import { generateThumbnail } from '@/lib/thumbnail';
import { getBaseYtDlpCmd, formatYtDlpError } from '@/lib/youtubeCookies';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';

const execAsync = promisify(exec);

export const config = {
  api: {
    responseLimit: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return requireAuth(req, res, async (req, res) => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { url, customTitle } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Please provide a valid YouTube URL' });
    }

    const uploadDir = path.resolve(process.env.UPLOAD_DIR || './public/uploads');

    // Ensure uploads directory exists
    try {
      await fs.mkdir(uploadDir, { recursive: true });
    } catch {}

    const sanitizedUrl = url.replace(/(["'$`\\])/g, '\\$1');
    const safeBaseName = `yt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const outputFileName = `${safeBaseName}.mp4`;
    const outputPath = path.join(uploadDir, outputFileName);

    try {
      const baseCmd = await getBaseYtDlpCmd();

      // 1. Fetch info for title and duration
      let videoTitle = customTitle || 'YouTube Video';
      let durationSeconds = 0;
      let resolutionStr = '1080p';

      try {
        const { stdout: infoJson } = await execAsync(`${baseCmd} -j --skip-download "${sanitizedUrl}"`, { timeout: 30000 });
        const lines = infoJson.trim().split('\n');
        for (const line of lines) {
          try {
            const info = JSON.parse(line.trim());
            if (info && (info.id || info.title)) {
              if (!customTitle && info.title) {
                videoTitle = info.title;
              }
              durationSeconds = info.duration || 0;
              resolutionStr = info.resolution || (info.height ? `${info.height}p` : '1080p');
              break;
            }
          } catch {}
        }
      } catch (infoErr) {
        console.warn('Could not pre-fetch info, continuing to download:', infoErr);
      }

      // 2. Download highest quality up to 1080p in MP4 container (prefer H.264/AVC1 to minimize CPU during playback)
      const downloadCmd = `${baseCmd} -f "bestvideo[height<=1080][vcodec^=avc1]+bestaudio[ext=m4a]/bestvideo[height<=1080][vcodec^=avc]+bestaudio/bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best" --merge-output-format mp4 -o "${outputPath}" "${sanitizedUrl}"`;
      
      console.log(`[YOUTUBE IMPORT] Downloading "${videoTitle}" from ${url}...`);
      await execAsync(downloadCmd, { timeout: 300000 }); // 5 minutes max

      // 3. Verify downloaded file exists and check file size
      const stat = await fs.stat(outputPath);
      const fileSize = stat.size;

      // 4. Generate Thumbnail
      let thumbnailPath = null;
      try {
        const thumbName = `${safeBaseName}_thumb.jpg`;
        thumbnailPath = await generateThumbnail(outputPath, thumbName);
      } catch (thumbErr) {
        console.warn('Thumbnail generation failed for imported YouTube video:', thumbErr);
      }

      // 5. Insert into Database
      const db = await getDb();
      const result = await db.run(
        `INSERT INTO videos (name, filename, original_name, file_path, thumbnail_path, file_size, duration, resolution)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          videoTitle,
          outputFileName,
          `${videoTitle}.mp4`,
          outputPath,
          thumbnailPath,
          fileSize,
          durationSeconds,
          resolutionStr,
        ]
      );

      await logActivity('youtube_imported', `Imported YouTube video "${videoTitle}" (${fileSize} bytes)`);

      return res.status(200).json({
        success: true,
        message: 'YouTube video imported successfully!',
        video: {
          id: result.lastID,
          name: videoTitle,
          filename: outputFileName,
          originalName: `${videoTitle}.mp4`,
          filePath: outputPath,
          thumbnailPath,
          fileSize,
          duration: durationSeconds,
          resolution: resolutionStr,
        },
      });
    } catch (err: any) {
      console.error('[YOUTUBE IMPORT ERROR]:', err);
      // Clean up partial file if failed
      try {
        await fs.unlink(outputPath);
      } catch {}

      const formatted = formatYtDlpError(err);
      return res.status(formatted.requiresCookies ? 403 : 500).json({
        error: formatted.message,
        requiresCookies: formatted.requiresCookies,
        isPrivate: formatted.isPrivate,
      });
    }
  });
}
