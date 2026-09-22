/**
 * LOOP STREAM by CMAISNAM - Stream Health Watchdog & Auto-Recovery Service
 * 
 * Continuously monitors running broadcasts and scheduled timers:
 * - Detects unexpected FFmpeg crashes (network dropouts, platform rate-limits) and auto-recovers streams.
 * - Manages automated broadcast start/stop times according to user schedules.
 */

const axios = require('axios');
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DATABASE_PATH || './data/streams.db';
const NEXT_API_BASE = process.env.NEXT_API_BASE || 'http://127.0.0.1:3000';
const INTERNAL_KEY = process.env.LOOPSTREAM_INTERNAL_KEY || 'loopstream-internal-mcp-key';
const POLL_INTERVAL_MS = 10000; // 10 seconds

const client = axios.create({
  baseURL: NEXT_API_BASE,
  timeout: 5000,
  headers: {
    'x-loopstream-internal-key': INTERNAL_KEY,
    'Content-Type': 'application/json',
  },
});

function isPidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

async function checkStreams() {
  try {
    let streams = [];
    try {
      const res = await client.get('/api/streams/list');
      streams = res.data.streams || [];
    } catch {
      // Fallback directly to SQLite if Next.js is temporarily reloading
      try {
        const db = new Database(DB_PATH, { readonly: true });
        streams = db.prepare('SELECT * FROM streams').all();
        db.close();
      } catch {}
    }

    const now = new Date();

    for (const stream of streams) {
      // ==========================================
      // 1. WATCHDOG AUTO-RECOVERY
      // ==========================================
      if (stream.status === 'running') {
        const pidAlive = stream.pid ? isPidAlive(stream.pid) : false;

        if (!pidAlive) {
          console.warn(`⚠️ [WATCHDOG] Stream #${stream.id} ("${stream.name}") marked as running but PID ${stream.pid} is dead.`);
          
          if (stream.auto_start !== 0) {
            console.log(`🔄 [WATCHDOG] Auto-recovering Stream #${stream.id} ("${stream.name}")...`);
            try {
              await client.post('/api/streams/start', { streamId: stream.id });
              console.log(`✅ [WATCHDOG] Successfully restarted Stream #${stream.id}`);
            } catch (startErr) {
              console.error(`❌ [WATCHDOG] Failed to restart Stream #${stream.id}:`, startErr.message);
            }
          }
        }
      }

      // ==========================================
      // 2. SCHEDULED START
      // ==========================================
      if (stream.status === 'stopped' && stream.scheduled_start) {
        const startTime = new Date(stream.scheduled_start);
        const stopTime = stream.scheduled_stop ? new Date(stream.scheduled_stop) : null;

        if (!isNaN(startTime.getTime()) && now >= startTime) {
          // Verify we haven't already passed the stop time
          if (!stopTime || now < stopTime) {
            console.log(`⏰ [SCHEDULER] Triggering scheduled broadcast for Stream #${stream.id} ("${stream.name}")...`);
            try {
              await client.post('/api/streams/start', { streamId: stream.id });
              console.log(`✅ [SCHEDULER] Stream #${stream.id} started according to schedule.`);
            } catch (err) {
              console.error(`❌ [SCHEDULER] Failed to start scheduled stream #${stream.id}:`, err.message);
            }
          }
        }
      }

      // ==========================================
      // 3. SCHEDULED STOP
      // ==========================================
      if (stream.status === 'running' && stream.scheduled_stop) {
        const stopTime = new Date(stream.scheduled_stop);
        if (!isNaN(stopTime.getTime()) && now >= stopTime) {
          console.log(`⏹️ [SCHEDULER] Stopping scheduled Stream #${stream.id} ("${stream.name}")...`);
          try {
            await client.post('/api/streams/stop', { streamId: stream.id });
            console.log(`✅ [SCHEDULER] Stream #${stream.id} stopped at scheduled end time.`);
          } catch (err) {
            console.error(`❌ [SCHEDULER] Failed to stop scheduled stream #${stream.id}:`, err.message);
          }
        }
      }
    }
  } catch (err) {
    console.error('[WATCHDOG] Error in check cycle:', err.message);
  }
}

console.log('🛡️ [LOOP STREAM WATCHDOG] Stream auto-recovery & scheduler daemon initialized.');
setInterval(checkStreams, POLL_INTERVAL_MS);
checkStreams(); // Run immediately on start
