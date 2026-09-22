const NodeMediaServer = require('node-media-server');
const http = require('http');

const RTMP_PORT = parseInt(process.env.RTMP_PORT || '1935', 10);
const HTTP_PORT = parseInt(process.env.HTTP_PORT || '8000', 10);
const NEXT_API_BASE = process.env.NEXT_API_BASE || 'http://127.0.0.1:3000';

const activeIngests = new Map();

const nmsConfig = {
  rtmp: {
    port: RTMP_PORT,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60,
  },
  http: {
    port: HTTP_PORT,
    allow_origin: '*',
  },
  logType: 2, // 1: none, 2: error, 3: debug
};

const nms = new NodeMediaServer(nmsConfig);

async function notifyNextJs(payload) {
  try {
    const data = JSON.stringify(payload);
    const url = new URL('/api/rtmp/webhook', NEXT_API_BASE);
    const req = http.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          'x-rtmp-internal-secret': 'loopstream-internal-webhook',
        },
        timeout: 3000,
      },
      (res) => {
        res.resume(); // consume response data to free up memory
      }
    );
    req.on('error', (err) => {
      // Next.js might be booting or reloading, quietly retry or ignore
      console.log(`[RTMP WEBHOOK] Notification warning: ${err.message}`);
    });
    req.write(data);
    req.end();
  } catch (err) {
    console.error('[RTMP WEBHOOK] Failed to dispatch event:', err.message);
  }
}

// Intercept HTTP requests for /status
const originalListeners = nms.httpServer.httpServer.listeners('request').slice(0);
nms.httpServer.httpServer.removeAllListeners('request');
nms.httpServer.httpServer.on('request', (req, res) => {
  const parsedUrl = new URL(req.url, `http://localhost:${HTTP_PORT}`);
  if (parsedUrl.pathname === '/status' || parsedUrl.pathname === '/api/status') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    });
    const ingestsList = Array.from(activeIngests.values()).map((ing) => ({
      streamKey: ing.streamKey,
      streamPath: ing.streamPath,
      ip: ing.ip,
      startedAt: ing.startedAt,
      width: ing.session.videoWidth || 0,
      height: ing.session.videoHeight || 0,
      fps: ing.session.videoFramerate || 0,
      bitrate: ing.session.videoDatarate || 0,
      inBytes: ing.session.inBytes || 0,
    }));

    res.end(
      JSON.stringify({
        status: 'online',
        rtmpPort: RTMP_PORT,
        httpPort: HTTP_PORT,
        serverTime: new Date().toISOString(),
        activeCount: ingestsList.length,
        ingests: ingestsList,
        uptimeSeconds: Math.floor(process.uptime()),
      })
    );
    return;
  }

  // Preflight OPTIONS for CORS
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    });
    res.end();
    return;
  }

  // Delegate all other routes (e.g. /:app/:name.flv) to NodeMediaServer
  for (const listener of originalListeners) {
    listener.call(nms.httpServer.httpServer, req, res);
  }
});

// RTMP Event Listeners
nms.on('prePublish', (session) => {
  console.log(`[RTMP] Pre-publish connection: ${session.streamPath} from ${session.ip}`);
});

nms.on('postPublish', (session) => {
  const streamKey = session.streamName || (session.streamPath ? session.streamPath.replace(/^\/live\/?/, '') : '');
  console.log(`[RTMP INGEST RECEIVED] Stream: ${session.streamPath} (Key: ${streamKey}) from IP: ${session.ip}`);
  
  activeIngests.set(streamKey, {
    streamKey,
    streamPath: session.streamPath,
    ip: session.ip,
    startedAt: new Date().toISOString(),
    session,
  });

  notifyNextJs({
    event: 'postPublish',
    streamKey,
    streamPath: session.streamPath,
    ip: session.ip,
    timestamp: new Date().toISOString(),
  });
});

nms.on('donePublish', (session) => {
  const streamKey = session.streamName || (session.streamPath ? session.streamPath.replace(/^\/live\/?/, '') : '');
  console.log(`[RTMP INGEST DISCONNECTED] Stream: ${session.streamPath} (Key: ${streamKey})`);
  
  activeIngests.delete(streamKey);

  notifyNextJs({
    event: 'donePublish',
    streamKey,
    streamPath: session.streamPath,
    ip: session.ip,
    timestamp: new Date().toISOString(),
  });
});

async function main() {
  try {
    await nms.run();
    console.log(`🚀 [LOOP STREAM RTMP RECEIVER] Active on rtmp://0.0.0.0:${RTMP_PORT}/live`);
    console.log(`🌐 [LOOP STREAM HTTP-FLV SERVER] Active on http://0.0.0.0:${HTTP_PORT}`);
  } catch (err) {
    console.error('❌ Failed to start RTMP Receiver:', err);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  console.log('Shutting down RTMP Receiver...');
  await nms.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down RTMP Receiver...');
  await nms.stop();
  process.exit(0);
});

main();
