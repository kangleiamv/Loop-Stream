import { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import EditStreamModal from './EditStreamModal';
import SwitchVideoModal from './SwitchVideoModal';
import { PLATFORMS, parseStreamUrls, detectPlatform, maskStreamUrl } from '@/lib/platforms';
import PlatformIcon from './PlatformIcon';

dayjs.extend(relativeTime);

interface Stream {
  id: number;
  name: string;
  video_id: number;
  video_name: string;
  rtmp_url: string;
  quality: string;
  loop_enabled: boolean;
  status: 'running' | 'stopped' | 'error';
  started_at: string | null;
  error_message: string | null;
  created_at: string;
  source_type?: 'video' | 'rtmp_ingest' | 'rtmp_pull';
  source_url?: string;
  fallback_video_id?: number;
  fallback_video_name?: string;
  auto_start?: boolean;
}

interface StreamStats {
  bitrate: number;
  fps: number;
  speed: number;
  quality: 'excellent' | 'good' | 'fair' | 'poor';
  errors: string[];
}

interface StreamCardProps {
  stream: Stream;
  onUpdate: () => void;
}

export default function StreamCard({ stream, onUpdate }: StreamCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSwitchingVideo, setIsSwitchingVideo] = useState(false);
  const [stats, setStats] = useState<StreamStats | null>(null);

  const urls = parseStreamUrls(stream.rtmp_url);
  const platforms = urls.map((u) => {
    const plat = detectPlatform(u);
    return {
      url: u,
      platform: plat,
      config: PLATFORMS[plat],
    };
  });

  useEffect(() => {
    if (stream.status === 'running') {
      fetchStats();
      const interval = setInterval(fetchStats, 2000);
      return () => clearInterval(interval);
    }
  }, [stream.id, stream.status]);

  const fetchStats = async () => {
    try {
      const response = await axios.get(`/api/streams/stats?streamId=${stream.id}`);
      setStats(response.data);
    } catch {
      // Stats might not be available yet
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete the stream "${stream.name}"?`)) {
      return;
    }

    setIsDeleting(true);

    try {
      await axios.delete(`/api/streams/${stream.id}/delete`);
      toast.success('Stream deleted successfully');
      onUpdate();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete stream');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggle = async () => {
    setIsLoading(true);

    try {
      if (stream.status === 'running') {
        await axios.post('/api/streams/stop', { streamId: stream.id });
        toast.success('Stream stopped');
      } else {
        await axios.post('/api/streams/start', { streamId: stream.id });
        toast.success(urls.length > 1 ? 'Multi-stream started live!' : 'Stream started live!');
      }
      onUpdate();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to update stream state');
    } finally {
      setIsLoading(false);
    }
  };

  const getUptime = () => {
    if (stream.status !== 'running') return null;
    return '24/7';
  };

  const formatQualityLabel = (quality: string) => {
    if (quality === 'vertical-720p') return '720p Vertical (9:16)';
    if (quality === 'vertical-1080p') return '1080p Vertical (9:16)';
    if (quality === 'original') return 'Original Source';
    return quality;
  };

  return (
    <div className="backdrop-blur-xl bg-white/[0.03] border border-white/10 hover:border-white/20 rounded-xl p-5 shadow-[0_8px_30px_rgba(0,0,0,0.5)] transition-all duration-300">
      {/* Top Title & Status */}
      <div className="flex justify-between items-start mb-3 gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-white tracking-tight">{stream.name}</h3>
            {urls.length > 1 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/10 border border-white/20 text-white">
                Multi-Cast ({urls.length})
              </span>
            )}
          </div>

          {/* Source Information */}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {stream.source_type === 'rtmp_ingest' ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 px-2 py-0.5 rounded-md">
                  <span>📡</span>
                  <span>RTMP Ingest: /live/{stream.source_url}</span>
                </span>
                {stream.fallback_video_name && (
                  <span className="text-[11px] text-zinc-400">
                    Backup: <span className="text-zinc-200">{stream.fallback_video_name}</span>
                  </span>
                )}
              </div>
            ) : stream.source_type === 'rtmp_pull' ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-sky-500/15 border border-sky-500/30 text-sky-300 px-2 py-0.5 rounded-md">
                <span>🌐</span>
                <span>Pull: {maskStreamUrl(stream.source_url || '')}</span>
              </span>
            ) : (
              <>
                <p className="text-xs text-zinc-400">
                  Source: <span className="text-white font-medium">{stream.video_name || 'Stored Video'}</span>
                </p>
                <button
                  onClick={() => setIsSwitchingVideo(true)}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-white hover:text-zinc-200 transition-all bg-white/[0.08] hover:bg-white/[0.15] px-2 py-0.5 rounded-md border border-white/15"
                  title="Hot-swap video without ending stream"
                >
                  <span>⚡</span>
                  <span>{stream.status === 'running' ? 'Switch Live' : 'Change Video'}</span>
                </button>
              </>
            )}
          </div>

          {/* Platform Badges */}
          <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
            {platforms.map((p, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-white/[0.04] border border-white/10 text-white backdrop-blur-xs"
                title={maskStreamUrl(p.url)}
              >
                <PlatformIcon platform={p.platform} className="w-3.5 h-3.5" />
                <span>{p.config?.badgeText || 'RTMP'}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Live / Stopped Status Pill */}
        <div className="flex items-center gap-2 shrink-0">
          <div
            className={`px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 border backdrop-blur-md ${
              stream.status === 'running'
                ? 'bg-white/[0.08] border-white/20 text-white shadow-[0_0_15px_rgba(255,255,255,0.2)]'
                : 'bg-white/[0.02] border-white/10 text-zinc-500'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                stream.status === 'running' ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'
              }`}
            />
            <span className="capitalize">{stream.status}</span>
          </div>
        </div>
      </div>

      {/* Settings & Stats */}
      <div className="space-y-2.5 mb-4 pt-3 border-t border-white/10">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-zinc-500">Quality:</span>{' '}
            <span className="text-zinc-200 font-medium">{formatQualityLabel(stream.quality)}</span>
          </div>
          <div>
            <span className="text-zinc-500">Looping:</span>{' '}
            <span className="text-zinc-200 font-medium">
              {stream.loop_enabled ? '24/7 Loop' : 'Single Play'}
            </span>
          </div>
        </div>

        {stream.status === 'running' && (
          <>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-zinc-500">Uptime:</span>{' '}
                <span
                  className="text-white font-medium"
                  title={stream.started_at ? `Elapsed: ${dayjs(stream.started_at).fromNow(true)}` : undefined}
                >
                  {getUptime()}
                </span>
              </div>
              {stats && (
                <div>
                  <span className="text-zinc-500">Speed:</span>{' '}
                  <span className="text-white font-medium">{Number(stats.speed || 0).toFixed(2)}x</span>
                </div>
              )}
            </div>

            {stats && (
              <div className="grid grid-cols-3 gap-2 text-xs p-2.5 rounded-lg bg-white/[0.03] border border-white/10 backdrop-blur-md">
                <div>
                  <span className="text-zinc-500 block text-[10px] uppercase tracking-wider">Bitrate</span>
                  <span className="text-white font-bold">{Math.round(stats.bitrate || 0)} kbps</span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[10px] uppercase tracking-wider">FPS</span>
                  <span className="text-white font-bold">{Number(stats.fps || 0).toFixed(1)}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[10px] uppercase tracking-wider">Health</span>
                  <span className="text-white font-bold capitalize flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    {stats.quality || 'good'}
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        {stream.error_message && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 p-2.5 rounded-lg">
            Error: {stream.error_message}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          onClick={handleToggle}
          disabled={isLoading || isDeleting}
          className={`flex-1 min-w-[110px] px-3.5 py-2 text-xs font-semibold rounded-lg transition-all shadow disabled:opacity-50 disabled:cursor-not-allowed ${
            stream.status === 'running'
              ? 'bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30'
              : 'bg-white text-black hover:bg-zinc-200 shadow-[0_0_20px_rgba(255,255,255,0.2)]'
          }`}
        >
          {isLoading
            ? 'Processing...'
            : stream.status === 'running'
            ? 'Stop Stream'
            : urls.length > 1
            ? 'Start Multi-Stream'
            : 'Start Stream'}
        </button>

        {/* Change / Switch Video Button */}
        <button
          onClick={() => setIsSwitchingVideo(true)}
          disabled={isLoading || isDeleting}
          className={`px-3 py-2 text-xs font-semibold rounded-lg transition-all border flex items-center gap-1.5 backdrop-blur-md ${
            stream.status === 'running'
              ? 'bg-white/10 hover:bg-white/20 text-white border-white/25 shadow-[0_0_15px_rgba(255,255,255,0.1)]'
              : 'bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 border-white/10'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
          title={stream.status === 'running' ? 'Hot-swap video live without ending broadcast' : 'Change video'}
        >
          <span>⚡</span>
          <span>{stream.status === 'running' ? 'Switch Video' : 'Change Video'}</span>
        </button>

        <button
          onClick={() => setIsEditing(true)}
          disabled={isDeleting || isLoading}
          className="px-3 py-2 text-xs font-medium bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 hover:text-white rounded-lg border border-white/10 transition-all backdrop-blur-md disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Edit
        </button>

        <button
          onClick={handleDelete}
          disabled={isDeleting || isLoading || stream.status === 'running'}
          className="px-3 py-2 text-xs font-medium bg-white/[0.02] hover:bg-red-500/15 text-zinc-500 hover:text-red-400 rounded-lg border border-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          title={stream.status === 'running' ? 'Stop stream before deleting' : 'Delete stream'}
        >
          {isDeleting ? 'Deleting...' : 'Delete'}
        </button>
      </div>

      {isSwitchingVideo && (
        <SwitchVideoModal
          stream={stream}
          onClose={() => setIsSwitchingVideo(false)}
          onSuccess={() => {
            setIsSwitchingVideo(false);
            onUpdate();
          }}
        />
      )}

      {isEditing && (
        <EditStreamModal
          stream={stream}
          onClose={() => setIsEditing(false)}
          onSuccess={() => {
            setIsEditing(false);
            onUpdate();
          }}
        />
      )}
    </div>
  );
}