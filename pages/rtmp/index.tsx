import { useState, useEffect } from 'react';
import { getSession } from '@/lib/auth';
import { GetServerSidePropsContext } from 'next';
import axios from 'axios';
import toast from 'react-hot-toast';
import Layout from '@/components/Layout';
import Link from 'next/link';
import { copyToClipboard as copyUniversal } from '@/lib/clipboard';

export const getServerSideProps = async (context: GetServerSidePropsContext) => {
  const session = await getSession(context.req, context.res);

  if (!session.user?.isLoggedIn) {
    return {
      redirect: {
        destination: '/auth/login',
        permanent: false,
      },
    };
  }

  return {
    props: {},
  };
};

interface IngestItem {
  streamKey: string;
  streamPath: string;
  ip: string;
  startedAt: string;
  width?: number;
  height?: number;
  fps?: number;
  bitrate?: number;
  inBytes?: number;
}

interface RtmpStatusData {
  isRunning: boolean;
  rtmpPort: number;
  httpPort: number;
  serverUrl: string;
  host: string;
  activeIngests: IngestItem[];
  activeCount: number;
  uptimeSeconds: number;
  configuredStreams: any[];
}

export default function RtmpReceiverPage() {
  const [data, setData] = useState<RtmpStatusData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [customKey, setCustomKey] = useState('live_loopstream');
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await axios.get('/api/rtmp/status');
      setData(res.data);
    } catch (err) {
      console.error('Failed to fetch RTMP status:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const copyToClipboard = async (text: string, label: string) => {
    if (!text) {
      toast.error(`No ${label} available to copy`);
      return;
    }
    const ok = await copyUniversal(text);
    if (ok) {
      setCopiedField(label);
      toast.success(`${label} copied to clipboard!`);
      setTimeout(() => setCopiedField(null), 2000);
    } else {
      toast.error(`Could not copy ${label} to clipboard automatically`);
    }
  };

  const generateNewKey = async () => {
    try {
      const res = await axios.post('/api/rtmp/generate-key');
      setCustomKey(res.data.streamKey);
      toast.success('Generated new stream key!');
    } catch {
      toast.error('Failed to generate key');
    }
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 selection:bg-white selection:text-black">
        {/* Header Title & Status */}
        <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
                RTMP Receiver
              </h1>
              {data?.isRunning ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 shadow-[0_0_20px_rgba(52,211,153,0.2)]">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Online • Port {data.rtmpPort}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-500/15 border border-red-500/30 text-red-400">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  Offline
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Ingest live RTMP streams from OBS Studio, vMix, Prism, & IP hardware encoders
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchStatus}
              className="px-3.5 py-2 text-xs font-medium rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 hover:text-white border border-white/10 transition-all backdrop-blur-md"
            >
              Refresh Status
            </button>
            <Link href="/streams">
              <button className="px-4 py-2 text-xs font-semibold rounded-lg bg-white text-black hover:bg-zinc-200 transition-all shadow-[0_0_20px_rgba(255,255,255,0.2)]">
                + Create Relay Stream
              </button>
            </Link>
          </div>
        </div>

        {isLoading ? (
          <div className="py-20 text-center text-zinc-500 text-sm">
            <div className="inline-block animate-spin w-6 h-6 border-2 border-white/20 border-t-white rounded-full mb-3" />
            <div>Checking RTMP ingest service...</div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Top Grid: OBS Connection Setup & Live Signal Monitor */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* OBS & Encoder Connection Setup */}
              <div className="lg:col-span-6">
                <div className="backdrop-blur-2xl bg-white/[0.025] border border-white/10 rounded-2xl p-6 shadow-[0_12px_40px_rgba(0,0,0,0.6)] h-full flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-5 pb-3 border-b border-white/10">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-white text-black flex items-center justify-center font-bold text-xs shadow-[0_0_15px_rgba(255,255,255,0.3)]">
                          📡
                        </div>
                        <div>
                          <h2 className="text-base font-bold text-white tracking-tight">OBS / Encoder Ingest Settings</h2>
                          <p className="text-[11px] text-zinc-400">Point your streaming software to this server</p>
                        </div>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.08] text-white border border-white/10 font-mono">
                        H.264 / AAC
                      </span>
                    </div>

                    <div className="space-y-4">
                      {/* Server URL */}
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                            Server URL (RTMP)
                          </label>
                          <span className="text-[10px] text-zinc-500 font-mono">Port {data?.rtmpPort}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            readOnly
                            value={data?.serverUrl || `rtmp://localhost:${data?.rtmpPort || 1935}/live`}
                            className="flex-1 px-3 py-2 bg-white/[0.04] border border-white/10 rounded-lg text-xs font-mono text-zinc-200 select-all"
                          />
                          <button
                            onClick={() =>
                              copyToClipboard(
                                data?.serverUrl || `rtmp://localhost:${data?.rtmpPort || 1935}/live`,
                                'Server URL'
                              )
                            }
                            className="px-3 py-2 text-xs font-semibold bg-white text-black hover:bg-zinc-200 rounded-lg transition-all shrink-0"
                          >
                            {copiedField === 'Server URL' ? '✓ Copied' : 'Copy'}
                          </button>
                        </div>
                      </div>

                      {/* Stream Key */}
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                            Stream Key
                          </label>
                          <button
                            onClick={generateNewKey}
                            className="text-[11px] text-zinc-400 hover:text-white underline transition-colors"
                          >
                            Generate New
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={customKey}
                            onChange={(e) => setCustomKey(e.target.value.trim())}
                            className="flex-1 px-3 py-2 bg-white/[0.04] border border-white/10 rounded-lg text-xs font-mono text-zinc-200 focus:outline-none focus:border-white"
                            placeholder="e.g. live_loopstream"
                          />
                          <button
                            onClick={() => copyToClipboard(customKey, 'Stream Key')}
                            className="px-3 py-2 text-xs font-semibold bg-white text-black hover:bg-zinc-200 rounded-lg transition-all shrink-0"
                          >
                            {copiedField === 'Stream Key' ? '✓ Copied' : 'Copy'}
                          </button>
                        </div>
                        <p className="text-[11px] text-zinc-500 mt-1">
                          Publish destination: <span className="text-zinc-300 font-mono">{data?.serverUrl}/{customKey}</span>
                        </p>
                      </div>

                      {/* Instructions */}
                      <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.08] space-y-2 text-xs text-zinc-400">
                        <p className="font-semibold text-white">How to connect in OBS Studio:</p>
                        <ol className="list-decimal list-inside space-y-1 text-[11px] leading-relaxed">
                          <li>Open OBS Studio → Settings → Stream</li>
                          <li>Select Service: <strong className="text-white">Custom...</strong></li>
                          <li>Paste the <strong className="text-white">Server URL</strong> and <strong className="text-white">Stream Key</strong> above</li>
                          <li>Click <strong className="text-white">Start Streaming</strong> — LOOP STREAM will immediately ingest & relay live!</li>
                        </ol>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 mt-6 border-t border-white/10 flex items-center justify-between text-xs text-zinc-400">
                    <span>Protocol: RTMP / RTMPS / FLV</span>
                    <span className="text-emerald-400 font-medium">⚡ Low-Latency Passthrough Ready</span>
                  </div>
                </div>
              </div>

              {/* Live Signal Ingest Monitor */}
              <div className="lg:col-span-6">
                <div className="backdrop-blur-2xl bg-white/[0.025] border border-white/10 rounded-2xl p-6 shadow-[0_12px_40px_rgba(0,0,0,0.6)] h-full flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-5 pb-3 border-b border-white/10">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/15 text-white flex items-center justify-center font-bold text-xs">
                          📊
                        </div>
                        <div>
                          <h2 className="text-base font-bold text-white tracking-tight">Active Ingest Feeds</h2>
                          <p className="text-[11px] text-zinc-400">Real-time incoming signal diagnostic</p>
                        </div>
                      </div>
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/10 border border-white/15 text-white font-semibold">
                        {data?.activeCount || 0} Connected
                      </span>
                    </div>

                    {data && data.activeIngests.length > 0 ? (
                      <div className="space-y-4">
                        {data.activeIngests.map((ing, idx) => (
                          <div
                            key={idx}
                            className="p-4 rounded-xl bg-white/[0.04] border border-emerald-500/30 backdrop-blur-md shadow-[0_0_20px_rgba(52,211,153,0.1)]"
                          >
                            <div className="flex justify-between items-start mb-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                  <h3 className="text-sm font-bold text-white font-mono">{ing.streamPath}</h3>
                                </div>
                                <p className="text-[11px] text-zinc-400 mt-0.5">
                                  Publisher IP: <span className="text-zinc-200">{ing.ip}</span>
                                </p>
                              </div>
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                LIVE INGEST
                              </span>
                            </div>

                            <div className="grid grid-cols-3 gap-2 text-xs pt-2 border-t border-white/10 text-center">
                              <div className="p-2 rounded-lg bg-black/40 border border-white/5">
                                <span className="text-[10px] text-zinc-500 block uppercase">Resolution</span>
                                <span className="text-white font-bold">{ing.width && ing.height ? `${ing.width}x${ing.height}` : '720p/1080p'}</span>
                              </div>
                              <div className="p-2 rounded-lg bg-black/40 border border-white/5">
                                <span className="text-[10px] text-zinc-500 block uppercase">Framerate</span>
                                <span className="text-white font-bold">{ing.fps ? `${ing.fps} FPS` : '30/60 FPS'}</span>
                              </div>
                              <div className="p-2 rounded-lg bg-black/40 border border-white/5">
                                <span className="text-[10px] text-zinc-500 block uppercase">Bitrate</span>
                                <span className="text-white font-bold">{ing.bitrate ? `${Math.round(ing.bitrate)} kbps` : 'Live Stream'}</span>
                              </div>
                            </div>

                            <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-400">
                              <span>Connected: {new Date(ing.startedAt).toLocaleTimeString()}</span>
                              <Link href="/streams">
                                <button className="text-white hover:underline text-xs font-medium">
                                  Forward to YouTube / Twitch →
                                </button>
                              </Link>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-12 text-center text-zinc-500 text-xs">
                        <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-center text-zinc-400">
                          <svg className="w-6 h-6 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                        </div>
                        <p className="text-white font-semibold mb-1">Awaiting Incoming RTMP Signal</p>
                        <p className="text-zinc-400 max-w-xs mx-auto">
                          Start streaming in OBS Studio to <span className="font-mono text-zinc-200">rtmp://...:{data?.rtmpPort || 1935}/live</span> to see real-time ingest telemetry here.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t border-white/10 text-xs text-zinc-400 flex items-center justify-between">
                    <span>Engine: NodeMediaServer + H.264 Transcoder</span>
                    <span>Failover Auto-Switch: Enabled</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Configured Ingest Broadcast Streams Table */}
            <div className="backdrop-blur-2xl bg-white/[0.025] border border-white/10 rounded-2xl p-6 shadow-[0_12px_40px_rgba(0,0,0,0.6)]">
              <div className="flex items-center justify-between mb-5 pb-3 border-b border-white/10">
                <div>
                  <h2 className="text-base font-bold text-white tracking-tight">Configured RTMP Ingest Streams</h2>
                  <p className="text-xs text-zinc-400">Streams configured to forward incoming RTMP feeds to live platforms</p>
                </div>
                <Link href="/streams">
                  <button className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-white text-black hover:bg-zinc-200 transition-all">
                    + New Ingest Stream
                  </button>
                </Link>
              </div>

              {data && data.configuredStreams.length > 0 ? (
                <div className="space-y-3">
                  {data.configuredStreams.map((st) => (
                    <div
                      key={st.id}
                      className="p-4 rounded-xl bg-white/[0.03] border border-white/10 hover:border-white/20 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div>
                        <div className="flex items-center gap-2.5">
                          <h3 className="text-sm font-bold text-white">{st.name}</h3>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            st.status === 'running'
                              ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                              : 'bg-white/5 border border-white/10 text-zinc-500'
                          }`}>
                            {st.status.toUpperCase()}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-zinc-400 mt-1 flex-wrap">
                          <span>
                            Source Key: <span className="text-white font-mono">/live/{st.source_url}</span>
                          </span>
                          <span>•</span>
                          <span>
                            Backup Loop: <span className="text-zinc-200">{st.fallback_video_name || 'None'}</span>
                          </span>
                          <span>•</span>
                          <span>Quality: {st.quality}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Link href="/streams">
                          <button className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-zinc-200 border border-white/10 transition-colors">
                            Manage in Streams
                          </button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-zinc-500 text-xs">
                  No streams are currently using RTMP Ingest as their source. When creating a stream, select &quot;RTMP Ingest&quot; to forward live OBS feeds to multiple platforms.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
