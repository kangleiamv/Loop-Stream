import { useState, useEffect } from 'react';
import { getSession } from '@/lib/auth';
import { GetServerSidePropsContext } from 'next';
import axios from 'axios';
import Link from 'next/link';
import Layout from '@/components/Layout';
import dayjs from 'dayjs';
import { PLATFORMS, PlatformId } from '@/lib/platforms';
import PlatformIcon from '@/components/PlatformIcon';

interface MetricCardProps {
  title: string;
  value: string;
  subtitle: string;
  showProgress?: boolean;
  progress?: number;
}

const formatBytes = (bytes: number): string => {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const idx = Math.min(Math.max(i, 0), sizes.length - 1);
  return parseFloat((bytes / Math.pow(k, idx)).toFixed(1)) + ' ' + sizes[idx];
};

const MetricCard = ({ title, value, subtitle, showProgress, progress }: MetricCardProps) => {
  return (
    <div className="backdrop-blur-xl bg-white/[0.03] border border-white/10 hover:border-white/20 rounded-xl p-4 transition-all duration-200 shadow-[0_8px_25px_rgba(0,0,0,0.5)]">
      <div className="text-xs text-zinc-400 font-medium mb-1 uppercase tracking-wider">{title}</div>
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

interface DashboardData {
  videoCount: number;
  streamCount: number;
  activeStreamCount: number;
  recentActivity: any[];
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

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>({
    videoCount: 0,
    streamCount: 0,
    activeStreamCount: 0,
    recentActivity: [],
  });
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
  const [streamStats, setStreamStats] = useState<StreamStatsData | null>(null);
  const [rtmpStatus, setRtmpStatus] = useState<{ isRunning: boolean; activeCount: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
    fetchSystemStats();
    fetchStreamStats();
    fetchRtmpStatus();

    const interval = setInterval(() => {
      fetchDashboardData();
      fetchSystemStats();
      fetchStreamStats();
      fetchRtmpStatus();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const fetchRtmpStatus = async () => {
    try {
      const res = await axios.get('/api/rtmp/status');
      setRtmpStatus({ isRunning: res.data?.isRunning, activeCount: res.data?.activeCount || 0 });
    } catch {
      // RTMP service may still be initializing
    }
  };

  const fetchDashboardData = async () => {
    try {
      const [videosRes, streamsRes] = await Promise.all([
        axios.get('/api/videos/list'),
        axios.get('/api/streams/list'),
      ]);

      const videos = videosRes.data.videos || [];
      const streams = streamsRes.data.streams || [];
      const activeStreams = streams.filter((s: any) => s.status === 'running');

      setData({
        videoCount: videos.length,
        streamCount: streams.length,
        activeStreamCount: activeStreams.length,
        recentActivity: [],
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

  const statCards = [
    {
      label: 'Active Broadcasts',
      value: data.activeStreamCount,
      subtitle: data.activeStreamCount > 0 ? 'Broadcasting Now' : 'Idle',
      link: '/streams',
      isLive: data.activeStreamCount > 0,
    },
    {
      label: 'Configured Streams',
      value: data.streamCount,
      subtitle: 'Multi & Single Destinations',
      link: '/streams',
    },
    {
      label: 'Video Library',
      value: data.videoCount,
      subtitle: 'Ready for 24/7 Loop',
      link: '/videos',
    },
    {
      label: 'Average Health',
      value: streamStats?.averages?.overallQuality || (data.activeStreamCount > 0 ? 'Good' : 'Optimal'),
      subtitle: `${streamStats?.averages?.avgFps != null && streamStats.averages.avgFps > 0 ? streamStats.averages.avgFps.toFixed(0) : 30} FPS • 0 Drops`,
      link: '/streams',
    },
  ];

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header Title */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
              Dashboard
              {data.activeStreamCount > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white text-black shadow-[0_0_15px_rgba(255,255,255,0.4)]">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  LIVE
                </span>
              )}
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              Real-time monitoring & continuous multi-stream control
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/videos">
              <button className="px-4 py-2 text-xs font-semibold rounded-lg bg-white/[0.05] hover:bg-white/[0.12] text-white border border-white/10 transition-all backdrop-blur-md">
                + Upload Video
              </button>
            </Link>
            <Link href="/streams">
              <button className="px-4 py-2 text-xs font-semibold rounded-lg bg-white text-black hover:bg-zinc-200 transition-all shadow-[0_0_20px_rgba(255,255,255,0.2)]">
                + New Stream
              </button>
            </Link>
          </div>
        </div>

        {isLoading ? (
          <div className="py-20 text-center text-zinc-500 text-sm">
            <div className="inline-block animate-spin w-6 h-6 border-2 border-white/20 border-t-white rounded-full mb-3" />
            <div>Loading streaming engine metrics...</div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Top Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {statCards.map((stat, idx) => (
                <Link key={idx} href={stat.link}>
                  <div className="backdrop-blur-xl bg-white/[0.03] border border-white/10 hover:border-white/25 rounded-xl p-5 transition-all duration-300 hover:-translate-y-0.5 shadow-[0_8px_30px_rgba(0,0,0,0.6)] cursor-pointer group">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                          {stat.label}
                        </p>
                        <p className="text-3xl font-extrabold text-white mt-1.5 tracking-tight group-hover:text-zinc-100 capitalize">
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

            {/* System Performance Gauges */}
            {systemStats && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    Hardware & Engine Resources
                  </h2>
                  <span className="text-[11px] text-zinc-400">Auto-refreshing 5s</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <MetricCard
                    title="System CPU Load"
                    value={`${systemStats.systemCpu}%`}
                    subtitle="Host Processing Units"
                    showProgress={true}
                    progress={systemStats.systemCpu}
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
                    title="Active FFmpeg Streamers"
                    value={(systemStats.activeStreams ?? 0).toString()}
                    subtitle="Live RTMP Processes"
                  />
                </div>
              </div>
            )}

            {/* Multi-Platform Simulcast Panel & System Info */}
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

              {/* Station Status Overview */}
              <div className="backdrop-blur-xl bg-white/[0.03] border border-white/10 rounded-2xl p-6 flex flex-col justify-between shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
                <div>
                  <h2 className="text-lg font-bold text-white mb-4 tracking-tight">Streaming Engine Status</h2>
                  <div className="space-y-3.5 text-xs">
                    <div className="flex justify-between items-center py-1.5 border-b border-white/[0.06]">
                      <span className="text-zinc-400">Web Application</span>
                      <span className="text-white font-medium flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        Online (Port 3000)
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-white/[0.06]">
                      <span className="text-zinc-400">FFmpeg Transcoder</span>
                      <span className="text-white font-medium">H.264 / AAC Engine Ready</span>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-white/[0.06]">
                      <span className="text-zinc-400">RTMP Ingest Receiver</span>
                      <Link href="/rtmp" className="font-medium flex items-center gap-1.5 hover:underline text-white transition-colors">
                        {rtmpStatus?.isRunning ? (
                          <>
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            <span>Port 1935 Active{rtmpStatus.activeCount > 0 ? ` (${rtmpStatus.activeCount} live)` : ''}</span>
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
                      <span className="text-zinc-400">Hot-Swap Video Switcher</span>
                      <span className="text-emerald-400 font-semibold flex items-center gap-1">
                        <span>⚡</span> Enabled (No Stream Drop)
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1.5">
                      <span className="text-zinc-400">Database Engine</span>
                      <span className="text-white font-medium">SQLite3 (Active)</span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-white/10 flex items-center justify-between text-xs text-zinc-400">
                  <span>Server Platform: Linux x86_64</span>
                  <span className="text-zinc-300">LOOP STREAM v1.0.0 by CMAISNAM</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}