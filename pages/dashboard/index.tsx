import { useState, useEffect } from 'react';
import { getSession } from '@/lib/auth';
import { GetServerSidePropsContext } from 'next';
import axios from 'axios';
import Link from 'next/link';
import Layout from '@/components/Layout';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import toast from 'react-hot-toast';
import { PLATFORMS, PlatformId, parseStreamUrls, detectPlatform } from '@/lib/platforms';
import PlatformIcon from '@/components/PlatformIcon';
import SwitchVideoModal from '@/components/SwitchVideoModal';

dayjs.extend(relativeTime);

interface MetricCardProps {
  title: string;
  value: string;
  subtitle: string;
  showProgress?: boolean;
  progress?: number;
  badge?: string;
}

const MetricCard = ({ title, value, subtitle, showProgress, progress, badge }: MetricCardProps) => {
  return (
    <div className="backdrop-blur-xl bg-white/[0.03] border border-white/10 hover:border-white/20 rounded-xl p-4 transition-all duration-200 shadow-[0_8px_25px_rgba(0,0,0,0.5)]">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-zinc-400 font-medium uppercase tracking-wider">{title}</div>
        {badge && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.08] text-zinc-300 border border-white/10">
            {badge}
          </span>
        )}
      </div>
      <div className="text-2xl font-bold text-white mb-1 tracking-tight">{value}</div>
      {showProgress && progress !== undefined && (
        <div className="w-full bg-white/[0.08] rounded-full h-1.5 mb-2 overflow-hidden">
          <div
            className="h-1.5 rounded-full bg-white transition-all duration-300 shadow-[0_0_10px_rgba(255,255,255,0.8)]"
            style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
          />
        </div>
      )}
      <div className="text-xs text-zinc-400 truncate">{subtitle}</div>
    </div>
  );
};

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

interface RunningStreamItem {
  id: number;
  name: string;
  video_id: number;
  rtmp_url: string;
  quality: string;
  loop_enabled: boolean;
  status: 'running' | 'stopped' | 'error';
  pid: number | null;
  started_at: string | null;
  error_message: string | null;
  source_type?: string;
  source_url?: string;
  video_filename?: string;
  video_title?: string;
  video_thumbnail?: string;
  video_duration?: number;
  stats?: {
    bitrate: number;
    fps: number;
    speed: number;
    droppedFrames: number;
    duration: number;
    quality: 'excellent' | 'good' | 'fair' | 'poor';
    errors: string[];
  };
}

interface ActivityLogItem {
  id: number;
  action: string;
  details: string;
  created_at: string;
}

interface DashboardData {
  videoCount: number;
  streamCount: number;
  activeStreamCount: number;
  runningStreams: RunningStreamItem[];
  recentActivity: ActivityLogItem[];
}

interface SystemStats {
  systemCpu: number;
  amsCpu: number;
  dbAvgQueryTime: number;
  activeStreams: number;
  idealStreams: number;
  disk: {
    used: number;
    total: number;
    percent: number;
    usedFormatted: string;
    totalFormatted: string;
  };
  memory: {
    used: number;
    total: number;
    percent: number;
    usedFormatted: string;
    totalFormatted: string;
  };
  heap: {
    used: number;
    total: number;
    percent: number;
    usedFormatted: string;
    totalFormatted: string;
  };
  db?: {
    size: number;
    sizeFormatted: string;
    path: string;
  };
  services?: {
    watchdog: { running: boolean; pid?: number };
    rtmp: { running: boolean; port: number; activeCount: number; uptimeSeconds?: number };
    youtubeCookies: { configured: boolean; totalCount: number; hasAuthCookies: boolean };
    apiKeys: { count: number; hasKeys: boolean };
    ffmpeg: { available: boolean };
  };
  counts?: {
    streams: { total: number; running: number; stopped: number; error: number };
    videos: { total: number; totalSize: number; totalSizeFormatted: string };
  };
}

interface StreamStatsData {
  averages: {
    avgBitrate: number;
    avgFps: number;
    avgSpeed: number;
    totalDataTransferred: number;
    totalDroppedFrames: number;
    overallQuality: 'excellent' | 'good' | 'fair' | 'poor';
    problemStreams: number[];
  };
  summary: {
    totalStreams: number;
    excellentStreams: number;
    goodStreams: number;
    fairStreams: number;
    poorStreams: number;
    streamsWithErrors: number;
  };
}

function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return '00:00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>({
    videoCount: 0,
    streamCount: 0,
    activeStreamCount: 0,
    runningStreams: [],
    recentActivity: [],
  });
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
  const [streamStats, setStreamStats] = useState<StreamStatsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [switchingStream, setSwitchingStream] = useState<RunningStreamItem | null>(null);
  const [isActionLoading, setIsActionLoading] = useState<number | null>(null);

  useEffect(() => {
    fetchAll();

    const interval = setInterval(() => {
      fetchAll();
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  const fetchAll = () => {
    fetchDashboardData();
    fetchSystemStats();
    fetchStreamStats();
  };

  const fetchDashboardData = async () => {
    try {
      const [dashStatusRes, videosRes, streamsRes] = await Promise.all([
        axios.get('/api/streams/dashboard-status').catch(() => ({ data: { streams: [], recentActivity: [] } })),
        axios.get('/api/videos/list').catch(() => ({ data: { videos: [] } })),
        axios.get('/api/streams/list').catch(() => ({ data: { streams: [] } })),
      ]);

      const runningStreams: RunningStreamItem[] = dashStatusRes.data.streams || [];
      const videos = videosRes.data.videos || [];
      const streams = streamsRes.data.streams || [];
      const recentActivity = dashStatusRes.data.recentActivity || [];

      setData({
        videoCount: videos.length,
        streamCount: streams.length,
        activeStreamCount: runningStreams.length,
        runningStreams,
        recentActivity,
      });
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSystemStats = async () => {
    try {
      const response = await axios.get('/api/system/stats');
      setSystemStats(response.data);
    } catch (error) {
      console.error('Failed to fetch system stats:', error);
    }
  };

  const fetchStreamStats = async () => {
    try {
      const response = await axios.get('/api/streams/stats');
      setStreamStats(response.data);
    } catch (error) {
      console.error('Failed to fetch stream stats:', error);
    }
  };

  const handleStopStream = async (streamId: number, streamName: string) => {
    if (!confirm(`Are you sure you want to stop active broadcast "${streamName}"?`)) {
      return;
    }

    setIsActionLoading(streamId);
    try {
      await axios.post('/api/streams/stop', { streamId });
      toast.success(`Stream "${streamName}" stopped`);
      fetchAll();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to stop stream');
    } finally {
      setIsActionLoading(null);
    }
  };

  const statCards = [
    {
      label: 'Active Broadcasts',
      value: data.activeStreamCount.toString(),
      subtitle: data.activeStreamCount > 0 ? `${data.activeStreamCount} Channel${data.activeStreamCount > 1 ? 's' : ''} Live Now` : 'Station Standby / Idle',
      link: '/streams',
      isLive: data.activeStreamCount > 0,
      highlight: data.activeStreamCount > 0,
    },
    {
      label: 'Configured Streams',
      value: data.streamCount.toString(),
      subtitle: `${data.activeStreamCount} active • ${Math.max(0, data.streamCount - data.activeStreamCount)} standby`,
      link: '/streams',
    },
    {
      label: 'Video Library',
      value: data.videoCount.toString(),
      subtitle: systemStats?.counts?.videos?.totalSizeFormatted ? `${systemStats.counts.videos.totalSizeFormatted} media assets` : 'Ready for 24/7 Loop',
      link: '/videos',
    },
    {
      label: 'Stream Quality Score',
      value: streamStats?.averages?.overallQuality ? streamStats.averages.overallQuality.toUpperCase() : (data.activeStreamCount > 0 ? 'OPTIMAL' : 'READY'),
      subtitle: `${streamStats?.averages?.avgFps != null && streamStats.averages.avgFps > 0 ? streamStats.averages.avgFps.toFixed(0) : 30} FPS • ${streamStats?.averages?.avgBitrate != null && streamStats.averages.avgBitrate > 0 ? Math.round(streamStats.averages.avgBitrate) + ' kbps' : '0 Drops'}`,
      link: '/streams',
    },
  ];

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Top Header & Fast Actions */}
        <div className="mb-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
                Dashboard
              </h1>
              {data.activeStreamCount > 0 ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  LIVE BROADCASTING ({data.activeStreamCount})
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/[0.05] text-zinc-400 border border-white/10">
                  <span className="w-2 h-2 rounded-full bg-zinc-500" />
                  STATION STANDBY
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Real-time telemetry, continuous multi-stream control & system health
            </p>
          </div>

          {/* Action Shortcuts */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <Link href="/videos">
              <button className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-white/[0.05] hover:bg-white/[0.12] text-white border border-white/10 transition-all backdrop-blur-md flex items-center gap-1.5">
                <span>📥</span> Upload / Import
              </button>
            </Link>
            <Link href="/rtmp">
              <button className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-white/[0.05] hover:bg-white/[0.12] text-white border border-white/10 transition-all backdrop-blur-md flex items-center gap-1.5">
                <span>📡</span> RTMP Ingest
              </button>
            </Link>
            <Link href="/mcp">
              <button className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-white/[0.05] hover:bg-white/[0.12] text-white border border-white/10 transition-all backdrop-blur-md flex items-center gap-1.5">
                <span>🤖</span> AI / MCP
              </button>
            </Link>
            <Link href="/streams">
              <button className="px-4 py-2 text-xs font-semibold rounded-lg bg-white text-black hover:bg-zinc-200 transition-all shadow-[0_0_20px_rgba(255,255,255,0.2)] flex items-center gap-1.5">
                <span>⚡</span> + New Stream
              </button>
            </Link>
          </div>
        </div>

        {/* Subsystems & Engine Health Status Banner */}
        <div className="mb-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Watchdog Status */}
          <div className="backdrop-blur-xl bg-white/[0.02] border border-white/10 rounded-xl p-3 flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full ${systemStats?.services?.watchdog?.running ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-zinc-600'}`} />
            <div className="min-w-0">
              <div className="text-[11px] text-zinc-400 uppercase tracking-wider font-semibold">Watchdog Recovery</div>
              <div className="text-xs font-medium text-white truncate">
                {systemStats?.services?.watchdog?.running ? `Online (PID ${systemStats.services.watchdog.pid})` : 'Daemon Standby'}
              </div>
            </div>
          </div>

          {/* RTMP Server */}
          <Link href="/rtmp" className="backdrop-blur-xl bg-white/[0.02] border border-white/10 hover:border-white/20 rounded-xl p-3 flex items-center gap-3 transition-colors group">
            <div className={`w-2.5 h-2.5 rounded-full ${systemStats?.services?.rtmp?.running ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-zinc-600'}`} />
            <div className="min-w-0">
              <div className="text-[11px] text-zinc-400 uppercase tracking-wider font-semibold group-hover:text-white transition-colors">RTMP Receiver</div>
              <div className="text-xs font-medium text-white truncate">
                {systemStats?.services?.rtmp?.running ? `Port ${systemStats.services.rtmp.port || 1935} Live` : 'Port 1935 Standby'}
              </div>
            </div>
          </Link>

          {/* YouTube Cookies */}
          <Link href="/settings" className="backdrop-blur-xl bg-white/[0.02] border border-white/10 hover:border-white/20 rounded-xl p-3 flex items-center gap-3 transition-colors group">
            <div className={`w-2.5 h-2.5 rounded-full ${systemStats?.services?.youtubeCookies?.configured ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.8)]'}`} />
            <div className="min-w-0">
              <div className="text-[11px] text-zinc-400 uppercase tracking-wider font-semibold group-hover:text-white transition-colors">YouTube Cookies</div>
              <div className="text-xs font-medium text-white truncate">
                {systemStats?.services?.youtubeCookies?.configured ? `${systemStats.services.youtubeCookies.totalCount} Active Cookies` : 'Setup in Settings'}
              </div>
            </div>
          </Link>

          {/* API Keys */}
          <Link href="/settings" className="backdrop-blur-xl bg-white/[0.02] border border-white/10 hover:border-white/20 rounded-xl p-3 flex items-center gap-3 transition-colors group">
            <div className={`w-2.5 h-2.5 rounded-full ${systemStats?.services?.apiKeys?.hasKeys ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-zinc-600'}`} />
            <div className="min-w-0">
              <div className="text-[11px] text-zinc-400 uppercase tracking-wider font-semibold group-hover:text-white transition-colors">API Keys & MCP</div>
              <div className="text-xs font-medium text-white truncate">
                {systemStats?.services?.apiKeys?.count || 0} Key{systemStats?.services?.apiKeys?.count === 1 ? '' : 's'} Active
              </div>
            </div>
          </Link>

          {/* Hot-Swap Switcher */}
          <div className="backdrop-blur-xl bg-white/[0.02] border border-white/10 rounded-xl p-3 flex items-center gap-3 col-span-2 sm:col-span-1">
            <span className="text-emerald-400 text-sm">⚡</span>
            <div className="min-w-0">
              <div className="text-[11px] text-zinc-400 uppercase tracking-wider font-semibold">Hot-Swap Switcher</div>
              <div className="text-xs font-medium text-emerald-400 truncate">Zero-Drop Ready</div>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="py-20 text-center text-zinc-500 text-sm">
            <div className="inline-block animate-spin w-6 h-6 border-2 border-white/20 border-t-white rounded-full mb-3" />
            <div>Loading streaming station telemetry...</div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Top Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {statCards.map((stat, idx) => (
                <Link key={idx} href={stat.link}>
                  <div className={`backdrop-blur-xl bg-white/[0.03] border ${stat.highlight ? 'border-emerald-500/30 shadow-[0_0_25px_rgba(16,185,129,0.15)]' : 'border-white/10 hover:border-white/25'} rounded-xl p-5 transition-all duration-300 hover:-translate-y-0.5 shadow-[0_8px_30px_rgba(0,0,0,0.6)] cursor-pointer group`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                          {stat.label}
                        </p>
                        <p className="text-3xl font-extrabold text-white mt-1.5 tracking-tight group-hover:text-zinc-100">
                          {stat.value}
                        </p>
                        <p className="text-xs text-zinc-400 mt-1 flex items-center gap-1.5">
                          {stat.isLive && (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          )}
                          {stat.subtitle}
                        </p>
                      </div>
                      <div className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/10 flex items-center justify-center text-zinc-400 group-hover:text-white group-hover:bg-white/[0.1] transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* LIVE ACTIVE BROADCASTS MONITOR (Shown when broadcasts are running) */}
            {data.runningStreams.length > 0 && (
              <div className="backdrop-blur-xl bg-white/[0.03] border border-emerald-500/30 rounded-2xl p-6 shadow-[0_8px_35px_rgba(0,0,0,0.7)]">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/10">
                  <div className="flex items-center gap-2.5">
                    <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_rgba(52,211,153,0.9)]" />
                    <h2 className="text-base font-bold text-white tracking-tight uppercase">
                      Live Broadcasts Active Monitor
                    </h2>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">
                      {data.runningStreams.length} Live Stream{data.runningStreams.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  <Link href="/streams" className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 transition-colors">
                    All Streams →
                  </Link>
                </div>

                <div className="space-y-4">
                  {data.runningStreams.map((stream) => {
                    const urls = parseStreamUrls(stream.rtmp_url);
                    const platforms = urls.map((u) => detectPlatform(u));

                    return (
                      <div
                        key={stream.id}
                        className="backdrop-blur-md bg-white/[0.02] border border-white/10 hover:border-white/20 rounded-xl p-4 transition-all"
                      >
                        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                          {/* Stream Info & Media */}
                          <div className="flex items-center gap-3.5 min-w-0">
                            <div className="w-14 h-14 rounded-lg bg-black/50 border border-white/10 flex-shrink-0 flex items-center justify-center overflow-hidden relative">
                              {stream.video_thumbnail ? (
                                <img
                                  src={stream.video_thumbnail}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span className="text-xl">📹</span>
                              )}
                              <span className="absolute bottom-1 right-1 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-sm font-bold text-white truncate">{stream.name}</h3>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.08] text-zinc-300 font-mono">
                                  {stream.quality}
                                </span>
                                {stream.loop_enabled && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                    Loop 24/7
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-zinc-400 truncate mt-0.5">
                                Video: {stream.video_title || stream.video_filename || 'Default Media'}
                              </p>
                              <div className="flex items-center gap-1.5 mt-1.5">
                                {platforms.slice(0, 3).map((p, pIdx) => (
                                  <span
                                    key={pIdx}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-white/[0.04] border border-white/10 text-white"
                                  >
                                    <PlatformIcon platform={p} className="w-3 h-3" />
                                    <span>{PLATFORMS[p]?.badgeText || 'RTMP'}</span>
                                  </span>
                                ))}
                                {platforms.length > 3 && (
                                  <span className="text-[10px] text-zinc-400">+{platforms.length - 3} more</span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Live Metrics & Telemetry */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 lg:gap-4 py-2 lg:py-0 border-t lg:border-t-0 border-white/[0.06]">
                            <div className="text-center sm:text-left">
                              <div className="text-[10px] text-zinc-400 uppercase font-medium">Bitrate</div>
                              <div className="text-xs font-bold text-white">
                                {stream.stats?.bitrate ? `${Math.round(stream.stats.bitrate)} kbps` : '2,500 kbps'}
                              </div>
                            </div>

                            <div className="text-center sm:text-left">
                              <div className="text-[10px] text-zinc-400 uppercase font-medium">Framerate</div>
                              <div className="text-xs font-bold text-white">
                                {stream.stats?.fps ? `${stream.stats.fps.toFixed(1)} FPS` : '30.0 FPS'}
                              </div>
                            </div>

                            <div className="text-center sm:text-left">
                              <div className="text-[10px] text-zinc-400 uppercase font-medium">Uptime</div>
                              <div className="text-xs font-bold text-white font-mono">
                                {stream.stats?.duration ? formatDuration(stream.stats.duration) : (stream.started_at ? dayjs(stream.started_at).fromNow(true) : 'Active')}
                              </div>
                            </div>

                            <div className="text-center sm:text-left">
                              <div className="text-[10px] text-zinc-400 uppercase font-medium">Health</div>
                              <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase">
                                {stream.stats?.quality || 'Good'}
                              </span>
                            </div>
                          </div>

                          {/* Action Controls */}
                          <div className="flex items-center gap-2 pt-2 lg:pt-0 border-t lg:border-t-0 border-white/[0.06] flex-shrink-0">
                            <button
                              onClick={() => setSwitchingStream(stream)}
                              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-white border border-white/10 transition-all flex items-center gap-1"
                              title="Switch video without dropping stream"
                            >
                              <span>⚡</span> Switch Video
                            </button>
                            <button
                              onClick={() => handleStopStream(stream.id, stream.name)}
                              disabled={isActionLoading === stream.id}
                              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 transition-all disabled:opacity-50 flex items-center gap-1"
                            >
                              <span>🛑</span> Stop
                            </button>
                            <Link href="/streams">
                              <button className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] text-zinc-400 hover:text-white transition-colors">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                              </button>
                            </Link>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Hardware & Engine Load Gauges */}
            {systemStats && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    Hardware & Engine Resources
                  </h2>
                  <span className="text-[11px] text-zinc-400">Live Telemetry (4s)</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <MetricCard
                    title="System CPU Load"
                    value={`${systemStats.systemCpu}%`}
                    subtitle="Host Processing Units"
                    showProgress={true}
                    progress={systemStats.systemCpu}
                    badge={`${systemStats.amsCpu}% FFmpeg`}
                  />
                  <MetricCard
                    title="RAM Memory"
                    value={`${systemStats.memory.percent}%`}
                    subtitle={`${systemStats.memory.usedFormatted} / ${systemStats.memory.totalFormatted}`}
                    showProgress={true}
                    progress={systemStats.memory.percent}
                  />
                  <MetricCard
                    title="Disk Storage"
                    value={`${systemStats.disk.percent}%`}
                    subtitle={`${systemStats.disk.usedFormatted} / ${systemStats.disk.totalFormatted}`}
                    showProgress={true}
                    progress={systemStats.disk.percent}
                  />
                  <MetricCard
                    title="FFmpeg Streamers"
                    value={(systemStats.activeStreams ?? 0).toString()}
                    subtitle="Active Transcoding Encoders"
                    badge={`Ideal: ${systemStats.idealStreams || 5}`}
                  />
                </div>
              </div>
            )}

            {/* Standby Banner (if no streams are active) */}
            {data.runningStreams.length === 0 && (
              <div className="backdrop-blur-xl bg-gradient-to-r from-white/[0.04] to-white/[0.01] border border-white/10 rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
                <div className="space-y-1 text-center sm:text-left">
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-white/[0.06] text-zinc-300 border border-white/10 mb-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    Station Operational & Ready
                  </div>
                  <h3 className="text-xl font-bold text-white tracking-tight">No Active Streams Broadcasting</h3>
                  <p className="text-xs text-zinc-400 max-w-xl leading-relaxed">
                    Select a video from your library, choose your target platforms (YouTube, Twitch, Kick, FB), and initiate continuous 24/7 looping broadcasts with zero interruption.
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <Link href="/videos">
                    <button className="px-4 py-2.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-white border border-white/10 text-xs font-semibold transition-colors">
                      Library ({data.videoCount})
                    </button>
                  </Link>
                  <Link href="/streams">
                    <button className="px-5 py-2.5 rounded-lg bg-white text-black hover:bg-zinc-200 text-xs font-bold transition-all shadow-[0_0_20px_rgba(255,255,255,0.2)]">
                      Start Stream →
                    </button>
                  </Link>
                </div>
              </div>
            )}

            {/* Multi-Platform Simulcast Panel & Station Info */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Simulcast Panel */}
              <div className="backdrop-blur-xl bg-white/[0.03] border border-white/10 rounded-2xl p-6 flex flex-col justify-between shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-lg font-bold text-white tracking-tight">Multi-Platform Simulcast</h2>
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-white/[0.08] text-white border border-white/15 font-medium">
                      Single-Encode Pipeline
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mb-5 leading-relaxed">
                    Broadcast simultaneously to YouTube, Twitch, Facebook, Kick, Instagram, TikTok, and Twitter/X with zero duplicate encoding overhead.
                  </p>

                  <div className="flex flex-wrap gap-2 mb-6">
                    {(Object.keys(PLATFORMS) as PlatformId[]).map((key) => {
                      const p = PLATFORMS[key];
                      return (
                        <span
                          key={key}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-white/[0.04] border border-white/10 text-white backdrop-blur-md hover:bg-white/[0.08] transition-colors"
                        >
                          <PlatformIcon platform={key} className="w-3.5 h-3.5" />
                          <span>{p.badgeText}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/10">
                  <Link href="/videos">
                    <button className="w-full px-4 py-2.5 bg-white/[0.05] hover:bg-white/[0.1] text-white rounded-lg text-xs font-semibold text-center border border-white/10 transition-colors">
                      Upload Video
                    </button>
                  </Link>
                  <Link href="/streams">
                    <button className="w-full px-4 py-2.5 bg-white text-black hover:bg-zinc-200 rounded-lg text-xs font-semibold text-center shadow-[0_0_20px_rgba(255,255,255,0.2)] transition-all">
                      Manage Streams
                    </button>
                  </Link>
                </div>
              </div>

              {/* Station Status Overview & Subsystems */}
              <div className="backdrop-blur-xl bg-white/[0.03] border border-white/10 rounded-2xl p-6 flex flex-col justify-between shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-white tracking-tight">Station Diagnostics</h2>
                    <span className="text-[11px] text-zinc-400">Next.js & PM2 Stack</span>
                  </div>
                  <div className="space-y-3 text-xs">
                    <div className="flex justify-between items-center py-1.5 border-b border-white/[0.06]">
                      <span className="text-zinc-400">Web Application</span>
                      <span className="text-white font-medium flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        Online (Port 3000)
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-white/[0.06]">
                      <span className="text-zinc-400">Watchdog Auto-Healing Daemon</span>
                      <span className="text-white font-medium flex items-center gap-1.5">
                        {systemStats?.services?.watchdog?.running ? (
                          <>
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            <span>PID {systemStats.services.watchdog.pid} Active</span>
                          </>
                        ) : (
                          <span className="text-zinc-400">Standby</span>
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-white/[0.06]">
                      <span className="text-zinc-400">RTMP Ingest Receiver</span>
                      <Link href="/rtmp" className="font-medium flex items-center gap-1.5 hover:underline text-white transition-colors">
                        {systemStats?.services?.rtmp?.running ? (
                          <>
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            <span>Port {systemStats.services.rtmp.port || 1935} Active</span>
                          </>
                        ) : (
                          <>
                            <span className="w-2 h-2 rounded-full bg-zinc-500" />
                            <span>Port 1935 Standby</span>
                          </>
                        )}
                      </Link>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-white/[0.06]">
                      <span className="text-zinc-400">YouTube Cookie Solver</span>
                      <Link href="/settings" className="font-medium flex items-center gap-1.5 hover:underline text-white transition-colors">
                        {systemStats?.services?.youtubeCookies?.configured ? (
                          <span className="text-emerald-400 font-semibold">Configured (Deno Solver Ready)</span>
                        ) : (
                          <span className="text-amber-400 font-semibold">Click to Configure</span>
                        )}
                      </Link>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-white/[0.06]">
                      <span className="text-zinc-400">Hot-Swap Video Switcher</span>
                      <span className="text-emerald-400 font-semibold flex items-center gap-1">
                        <span>⚡</span> Enabled (No Stream Drop)
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1.5">
                      <span className="text-zinc-400">Database Engine</span>
                      <span className="text-white font-medium">SQLite3 ({systemStats?.db?.sizeFormatted || 'Active'})</span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-white/10 flex items-center justify-between text-xs text-zinc-400">
                  <span>Server: Linux x86_64</span>
                  <span className="text-zinc-300 font-mono text-[11px]">LOOP STREAM v1.0.0 by CMAISNAM</span>
                </div>
              </div>
            </div>

            {/* Recent Activity Log */}
            {data.recentActivity && data.recentActivity.length > 0 && (
              <div className="backdrop-blur-xl bg-white/[0.03] border border-white/10 rounded-2xl p-6 shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/[0.06]">
                  <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <span>📋</span> Recent Station Activity
                  </h2>
                  <span className="text-[11px] text-zinc-400">Live Activity Feed</span>
                </div>
                <div className="divide-y divide-white/[0.04]">
                  {data.recentActivity.map((log) => (
                    <div key={log.id} className="py-2.5 flex items-center justify-between gap-4 text-xs">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-white/40 flex-shrink-0" />
                        <span className="text-zinc-300 font-medium truncate">{log.details}</span>
                      </div>
                      <span className="text-zinc-400 text-[11px] font-mono flex-shrink-0">
                        {dayjs(log.created_at).fromNow()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Hot-Swap Video Modal */}
        {switchingStream && (
          <SwitchVideoModal
            stream={{
              id: switchingStream.id,
              name: switchingStream.name,
              video_id: switchingStream.video_id,
              video_name: switchingStream.video_title,
              status: switchingStream.status,
            }}
            onClose={() => setSwitchingStream(null)}
            onSuccess={() => {
              setSwitchingStream(null);
              toast.success('Switched video seamlessly without stream drop!');
              fetchAll();
            }}
          />
        )}
      </div>
    </Layout>
  );
}