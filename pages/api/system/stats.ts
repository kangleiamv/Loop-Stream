import { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/authMiddleware';
import { getDb, listApiKeys } from '@/lib/database';
import { getActiveStreams } from '@/lib/ffmpeg';
import { loadCookies } from '@/lib/youtubeCookies';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

const execAsync = promisify(exec);
const fsPromises = fs.promises;

// Module-level CPU measurement cache
let prevCpuTimes: { idle: number; total: number } | null = null;
let lastCpuPercent = 0;

function getCpuTimes() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    for (const type in cpu.times) {
      total += (cpu.times as any)[type];
    }
    idle += cpu.times.idle;
  }
  return { idle, total };
}

function calculateCpuPercent(): number {
  const current = getCpuTimes();
  if (prevCpuTimes) {
    const idleDiff = current.idle - prevCpuTimes.idle;
    const totalDiff = current.total - prevCpuTimes.total;
    if (totalDiff > 0) {
      lastCpuPercent = Math.max(0, Math.min(100, Math.round((1 - idleDiff / totalDiff) * 100)));
    }
  } else {
    // Fallback: estimate from 1-min load average normalized by core count
    const load = os.loadavg()[0];
    const cores = os.cpus().length || 1;
    lastCpuPercent = Math.max(0, Math.min(100, Math.round((load / cores) * 100)));
  }
  prevCpuTimes = current;
  return lastCpuPercent;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return requireAuth(req, res, async (req, res) => {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      // Get system memory stats
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      const memoryPercent = Math.round((usedMem / totalMem) * 100);

      // Get real CPU usage
      const cpuPercent = calculateCpuPercent();

      // Get disk usage (for the root partition)
      let diskUsage = { used: 0, total: 0, percent: 0 };
      try {
        if (process.platform === 'win32') {
          const { stdout } = await execAsync('wmic logicaldisk get size,freespace,caption');
          const lines = stdout.trim().split('\n').slice(1);
          const cDrive = lines.find(line => line.includes('C:'));
          if (cDrive) {
            const parts = cDrive.trim().split(/\s+/);
            const free = parseInt(parts[1]);
            const size = parseInt(parts[2]);
            diskUsage = {
              used: size - free,
              total: size,
              percent: Math.round(((size - free) / size) * 100)
            };
          }
        } else {
          const { stdout } = await execAsync('df -k /');
          const lines = stdout.trim().split('\n');
          const data = lines[1].split(/\s+/);
          const used = parseInt(data[2]) * 1024;
          const total = parseInt(data[1]) * 1024;
          diskUsage = {
            used,
            total,
            percent: parseInt(data[4])
          };
        }
      } catch (e) {
        console.error('Failed to get disk usage:', e);
      }

      // Get database stats & counts
      const db = await getDb();
      const dbPath = path.resolve(process.env.DATABASE_PATH || './data/streams.db');
      let dbSize = 0;
      try {
        const stats = await fsPromises.stat(dbPath);
        dbSize = stats.size;
      } catch {}

      const [streamCountsRow, videoStatsRow] = await Promise.all([
        db.all('SELECT status, COUNT(*) as count FROM streams GROUP BY status').catch(() => []),
        db.get('SELECT COUNT(*) as count, COALESCE(SUM(file_size), 0) as totalSize FROM videos').catch(() => ({ count: 0, totalSize: 0 })),
      ]);

      let totalStreams = 0;
      let runningStreamsCount = 0;
      let stoppedStreamsCount = 0;
      let errorStreamsCount = 0;
      if (Array.isArray(streamCountsRow)) {
        for (const row of streamCountsRow) {
          totalStreams += row.count;
          if (row.status === 'running') runningStreamsCount += row.count;
          else if (row.status === 'stopped') stoppedStreamsCount += row.count;
          else if (row.status === 'error') errorStreamsCount += row.count;
        }
      }

      // Check Watchdog service status
      let watchdog = { running: false, pid: 0 };
      try {
        const { stdout } = await execAsync('pgrep -f "watchdog-serv" || pm2 pid loopstream-watchdog');
        const pid = parseInt(stdout.trim().split('\n')[0], 10);
        if (pid && !isNaN(pid)) {
          try {
            process.kill(pid, 0);
            watchdog = { running: true, pid };
          } catch {}
        }
      } catch {}

      // Check RTMP Ingest service status
      let rtmp = { running: false, port: 1935, activeCount: 0, uptimeSeconds: 0 };
      try {
        const rtmpRes = await axios.get('http://127.0.0.1:8000/status', { timeout: 800 });
        if (rtmpRes.data?.status === 'online') {
          rtmp = {
            running: true,
            port: rtmpRes.data.rtmpPort || 1935,
            activeCount: rtmpRes.data.activeCount || 0,
            uptimeSeconds: rtmpRes.data.uptimeSeconds || 0,
          };
        }
      } catch {}

      // Check YouTube Cookies configuration
      let youtubeCookies = { configured: false, totalCount: 0, hasAuthCookies: false };
      try {
        const cookieStatus = await loadCookies();
        youtubeCookies = {
          configured: cookieStatus.configured,
          totalCount: cookieStatus.totalCount,
          hasAuthCookies: cookieStatus.hasAuthCookies,
        };
      } catch {}

      // Check API Keys count
      let apiKeys = { count: 0, hasKeys: false };
      try {
        const keys = await listApiKeys();
        apiKeys = {
          count: keys.length,
          hasKeys: keys.length > 0,
        };
      } catch {}

      // Get active streams count from FFmpeg engine
      const activeStreams = getActiveStreams().length;
      
      // Get Node.js heap memory
      const heapUsed = process.memoryUsage().heapUsed;
      const heapTotal = process.memoryUsage().heapTotal;
      const heapPercent = Math.round((heapUsed / heapTotal) * 100);

      // FFmpeg CPU usage
      let amsCpu = 0;
      try {
        const { stdout } = await execAsync('ps -C ffmpeg -o %cpu= || true');
        const lines = stdout.trim().split('\n').filter(Boolean);
        if (lines.length > 0) {
          amsCpu = Math.round(lines.reduce((acc, line) => acc + (parseFloat(line.trim()) || 0), 0));
        }
      } catch {}

      // Calculate ideal number of streams based on system resources
      const idealStreams = calculateIdealStreams({
        cpuPercent,
        amsCpu,
        memoryPercent,
        totalMemGB: totalMem / (1024 * 1024 * 1024),
        activeStreams,
        diskPercent: diskUsage.percent
      });

      res.status(200).json({
        systemCpu: cpuPercent,
        amsCpu: amsCpu,
        dbAvgQueryTime: 1,
        activeStreams: activeStreams,
        idealStreams: idealStreams,
        disk: {
          used: diskUsage.used,
          total: diskUsage.total,
          percent: diskUsage.percent,
          usedFormatted: formatBytes(diskUsage.used),
          totalFormatted: formatBytes(diskUsage.total)
        },
        memory: {
          used: usedMem,
          total: totalMem,
          percent: memoryPercent,
          usedFormatted: formatBytes(usedMem),
          totalFormatted: formatBytes(totalMem)
        },
        heap: {
          used: heapUsed,
          total: heapTotal,
          percent: heapPercent,
          usedFormatted: formatBytes(heapUsed),
          totalFormatted: formatBytes(heapTotal)
        },
        db: {
          size: dbSize,
          sizeFormatted: formatBytes(dbSize),
          path: dbPath
        },
        services: {
          watchdog,
          rtmp,
          youtubeCookies,
          apiKeys,
          ffmpeg: { available: true }
        },
        counts: {
          streams: {
            total: totalStreams,
            running: runningStreamsCount,
            stopped: stoppedStreamsCount,
            error: errorStreamsCount
          },
          videos: {
            total: videoStatsRow?.count || 0,
            totalSize: videoStatsRow?.totalSize || 0,
            totalSizeFormatted: formatBytes(videoStatsRow?.totalSize || 0)
          }
        }
      });
    } catch (error) {
      console.error('System stats error:', error);
      res.status(500).json({ error: 'Failed to get system stats' });
    }
  });
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function calculateIdealStreams(metrics: {
  cpuPercent: number;
  amsCpu: number;
  memoryPercent: number;
  totalMemGB: number;
  activeStreams: number;
  diskPercent: number;
}): number {
  const cpuPerStream = metrics.activeStreams > 0 ? metrics.amsCpu / metrics.activeStreams : 15;
  const memoryPerStreamGB = 0.5;
  
  const cpuLimit = Math.floor((80 - metrics.cpuPercent) / Math.max(cpuPerStream, 10));
  const memoryLimit = Math.floor((metrics.totalMemGB * 0.7) / memoryPerStreamGB);
  const currentLoadLimit = metrics.activeStreams > 2 ? metrics.activeStreams + 1 : 3;
  const diskLimit = metrics.diskPercent > 80 ? metrics.activeStreams : 10;
  
  let qualityMultiplier = 1;
  if (metrics.totalMemGB < 2) qualityMultiplier = 0.5;
  if (metrics.totalMemGB > 8) qualityMultiplier = 1.5;
  
  const idealCount = Math.floor(
    Math.min(cpuLimit, memoryLimit, currentLoadLimit, diskLimit) * qualityMultiplier
  );
  
  return Math.max(1, Math.min(idealCount, 10));
}