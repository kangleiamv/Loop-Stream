import { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { PLATFORMS, PlatformId, parseStreamUrls, detectPlatform } from '@/lib/platforms';
import PlatformIcon from './PlatformIcon';

interface Video {
  id: number;
  original_name: string;
}

interface Stream {
  id: number;
  name: string;
  video_id: number;
  rtmp_url: string;
  quality: string;
  loop_enabled: boolean;
  status?: string;
  source_type?: 'video' | 'rtmp_ingest' | 'rtmp_pull';
  source_url?: string;
  fallback_video_id?: number;
  auto_start?: boolean;
}

interface EditStreamModalProps {
  stream: Stream;
  onClose: () => void;
  onSuccess: () => void;
}

interface DestinationItem {
  id: string;
  platform: PlatformId;
  server: string;
  streamKey: string;
  useBackup?: boolean;
}

export default function EditStreamModal({ stream, onClose, onSuccess }: EditStreamModalProps) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMultiStream, setIsMultiStream] = useState(false);

  // Single mode state
  const [singlePlatform, setSinglePlatform] = useState<PlatformId>('youtube');
  const [singleKey, setSingleKey] = useState('');
  const [singleServer, setSingleServer] = useState(PLATFORMS.youtube.defaultServer);
  const [singleBackup, setSingleBackup] = useState(false);
  const [singleCustomUrl, setSingleCustomUrl] = useState('');

  // Multi-stream destinations
  const [destinations, setDestinations] = useState<DestinationItem[]>([]);

  const [sourceType, setSourceType] = useState<'video' | 'rtmp_ingest' | 'rtmp_pull'>(stream.source_type || 'video');
  const [ingestKey, setIngestKey] = useState(stream.source_type === 'rtmp_ingest' ? stream.source_url || 'live_loopstream' : 'live_loopstream');
  const [externalUrl, setExternalUrl] = useState(stream.source_type === 'rtmp_pull' ? stream.source_url || '' : '');
  const [fallbackVideoId, setFallbackVideoId] = useState(stream.fallback_video_id ? stream.fallback_video_id.toString() : '');

  const [formData, setFormData] = useState({
    name: stream.name,
    videoId: stream.video_id ? stream.video_id.toString() : '',
    quality: stream.quality || '720p',
    loopEnabled: stream.loop_enabled,
  });

  useEffect(() => {
    fetchVideos();
    parseExistingUrls();
  }, [stream]);

  const parseExistingUrls = () => {
    const urls = parseStreamUrls(stream.rtmp_url);
    if (urls.length > 1) {
      setIsMultiStream(true);
      const parsedDests: DestinationItem[] = urls.map((url, idx) => {
        const plat = detectPlatform(url);
        const config = PLATFORMS[plat];
        if (plat === 'custom') {
          return {
            id: `dest-${idx}`,
            platform: 'custom',
            server: url,
            streamKey: '',
          };
        }
        const parts = url.split('/');
        const key = parts[parts.length - 1] || '';
        const server = parts.slice(0, -1).join('/');
        return {
          id: `dest-${idx}`,
          platform: plat,
          server: server || config?.defaultServer || '',
          streamKey: key,
          useBackup: url.includes('backup=1'),
        };
      });
      setDestinations(parsedDests);
    } else if (urls.length === 1) {
      setIsMultiStream(false);
      const url = urls[0];
      const plat = detectPlatform(url);
      setSinglePlatform(plat);
      if (plat === 'custom') {
        setSingleCustomUrl(url);
      } else {
        const parts = url.split('/');
        const key = parts[parts.length - 1] || '';
        const server = parts.slice(0, -1).join('/');
        setSingleServer(server || PLATFORMS[plat]?.defaultServer || '');
        setSingleKey(key);
        setSingleBackup(url.includes('backup=1'));
      }
    }
  };

  const fetchVideos = async () => {
    try {
      const response = await axios.get('/api/videos/list');
      setVideos(response.data.videos || []);
    } catch (error) {
      toast.error('Failed to load videos');
    }
  };

  const addDestination = () => {
    const newId = `dest-${Date.now()}`;
    const nextPlatform: PlatformId = 'kick';
    setDestinations((prev) => [
      ...prev,
      {
        id: newId,
        platform: nextPlatform,
        server: PLATFORMS[nextPlatform].defaultServer,
        streamKey: '',
      },
    ]);
  };

  const removeDestination = (id: string) => {
    if (destinations.length <= 1) {
      toast.error('Multi-stream requires at least one destination');
      return;
    }
    setDestinations((prev) => prev.filter((d) => d.id !== id));
  };

  const updateDestination = (id: string, updates: Partial<DestinationItem>) => {
    setDestinations((prev) =>
      prev.map((dest) => {
        if (dest.id !== id) return dest;
        const updated = { ...dest, ...updates };
        if (updates.platform && updates.platform !== dest.platform) {
          const config = PLATFORMS[updates.platform];
          updated.server = config.defaultServer;
          updated.streamKey = '';
          updated.useBackup = false;
        }
        return updated;
      })
    );
  };

  const computeSingleUrl = (): string => {
    if (singlePlatform === 'custom') {
      return singleCustomUrl.trim();
    }
    const config = PLATFORMS[singlePlatform];
    if (!singleKey.trim()) return '';
    const server = singlePlatform === 'youtube' && singleBackup && config.backupServer
      ? config.backupServer
      : singleServer || config.defaultServer;
    return config.formatUrl(server, singleKey.trim());
  };

  const computeDestinationUrl = (dest: DestinationItem): string => {
    if (dest.platform === 'custom') {
      return dest.server.trim();
    }
    const config = PLATFORMS[dest.platform];
    if (!dest.streamKey.trim()) return '';
    const server = dest.platform === 'youtube' && dest.useBackup && config.backupServer
      ? config.backupServer
      : dest.server || config.defaultServer;
    return config.formatUrl(server, dest.streamKey.trim());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error('Please enter a stream name');
      return;
    }

    if (sourceType === 'video' && !formData.videoId) {
      toast.error('Please select a video source');
      return;
    }

    if (sourceType === 'rtmp_pull' && !externalUrl.trim()) {
      toast.error('Please enter the external RTMP / RTSP pull URL');
      return;
    }

    let finalUrls: string[] = [];

    if (!isMultiStream) {
      const url = computeSingleUrl();
      if (!url) {
        toast.error(`Please provide the stream key for ${PLATFORMS[singlePlatform].name}`);
        return;
      }
      finalUrls = [url];
    } else {
      for (let i = 0; i < destinations.length; i++) {
        const dest = destinations[i];
        const url = computeDestinationUrl(dest);
        if (!url) {
          toast.error(`Destination #${i + 1} (${PLATFORMS[dest.platform].name}) is missing a stream key`);
          return;
        }
        finalUrls.push(url);
      }
    }

    setIsLoading(true);

    try {
      await axios.put(`/api/streams/${stream.id}/update`, {
        name: formData.name,
        videoId: formData.videoId || fallbackVideoId || null,
        rtmpUrl: finalUrls.join('\n'),
        quality: formData.quality,
        loopEnabled: formData.loopEnabled,
        sourceType,
        sourceUrl: sourceType === 'rtmp_ingest' ? ingestKey : sourceType === 'rtmp_pull' ? externalUrl : undefined,
        fallbackVideoId: fallbackVideoId || null,
      });

      toast.success(
        stream.status === 'running'
          ? 'Stream updated & hot-swapped without ending broadcast!'
          : 'Stream updated successfully'
      );
      onSuccess();
      onClose();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to update stream');
    } finally {
      setIsLoading(false);
    }
  };

  const platformKeys = Object.keys(PLATFORMS) as PlatformId[];

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-2xl flex items-center justify-center p-4 z-50 overflow-y-auto selection:bg-white selection:text-black">
      <div className="backdrop-blur-3xl bg-zinc-950/85 border border-white/15 rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-[0_25px_70px_rgba(0,0,0,0.95)] text-white animate-in fade-in zoom-in-95 duration-150">
        <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/10">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">Edit Stream Settings</h2>
            {stream.status === 'running' && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live Broadcast Active (Hot Swap Enabled)
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-white/[0.08] transition-colors"
          >
            ✕
          </button>
        </div>

        {stream.status === 'running' && (
          <div className="mb-4 p-3 rounded-xl bg-white/[0.04] border border-white/15 flex items-center gap-2.5 text-xs">
            <span className="text-base">⚡</span>
            <div>
              <span className="font-semibold text-white">Stream is LIVE.</span> Changing the video or resolution will hot-swap on the fly without ending your broadcast!
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="edit-name" className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
              Stream Name
            </label>
            <input
              type="text"
              id="edit-name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-white/[0.04] backdrop-blur-md border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-white focus:ring-1 focus:ring-white/40"
              required
            />
          </div>

          {/* Source Type Selector */}
          <div>
            <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2">
              Source Type
            </label>
            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-white/[0.04] border border-white/10 backdrop-blur-md">
              <button
                type="button"
                onClick={() => setSourceType('video')}
                className={`py-2 px-2.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                  sourceType === 'video'
                    ? 'bg-white text-black shadow-[0_0_15px_rgba(255,255,255,0.3)]'
                    : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                <span>📁</span>
                <span className="truncate">Stored Video</span>
              </button>
              <button
                type="button"
                onClick={() => setSourceType('rtmp_ingest')}
                className={`py-2 px-2.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                  sourceType === 'rtmp_ingest'
                    ? 'bg-white text-black shadow-[0_0_15px_rgba(255,255,255,0.3)]'
                    : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                <span>📡</span>
                <span className="truncate">RTMP Ingest</span>
              </button>
              <button
                type="button"
                onClick={() => setSourceType('rtmp_pull')}
                className={`py-2 px-2.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                  sourceType === 'rtmp_pull'
                    ? 'bg-white text-black shadow-[0_0_15px_rgba(255,255,255,0.3)]'
                    : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                <span>🌐</span>
                <span className="truncate">External URL</span>
              </button>
            </div>
          </div>

          {sourceType === 'video' && (
            <div>
              <label htmlFor="edit-video" className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                Video Source {stream.status === 'running' && '(Hot-Swaps Live)'}
              </label>
              <select
                id="edit-video"
                value={formData.videoId}
                onChange={(e) => setFormData({ ...formData, videoId: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white/[0.04] backdrop-blur-md border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-white focus:bg-zinc-900"
                required
              >
                {videos.map((video) => (
                  <option key={video.id} value={video.id} className="bg-zinc-900 text-white">
                    {video.original_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {sourceType === 'rtmp_ingest' && (
            <div className="space-y-3 p-3.5 rounded-xl bg-white/[0.03] border border-white/10 backdrop-blur-md">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1">
                  Ingest Stream Key
                </label>
                <input
                  type="text"
                  value={ingestKey}
                  onChange={(e) => setIngestKey(e.target.value.trim())}
                  placeholder="e.g. live_loopstream"
                  className="w-full px-3 py-2 bg-white/[0.04] border border-white/10 rounded-lg text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-white"
                  required
                />
                <p className="text-[11px] text-zinc-400 mt-1 font-mono">
                  Publish to: rtmp://&lt;server&gt;:1935/live/{ingestKey}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1">
                  Backup Loop Video (Plays while OBS is offline)
                </label>
                <select
                  value={fallbackVideoId}
                  onChange={(e) => setFallbackVideoId(e.target.value)}
                  className="w-full px-3 py-2 bg-white/[0.04] border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-white focus:bg-zinc-900"
                >
                  <option value="" className="bg-zinc-900 text-zinc-400">None</option>
                  {videos.map((v) => (
                    <option key={v.id} value={v.id} className="bg-zinc-900 text-white">
                      {v.original_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {sourceType === 'rtmp_pull' && (
            <div className="space-y-3 p-3.5 rounded-xl bg-white/[0.03] border border-white/10 backdrop-blur-md">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1">
                  External Stream URL
                </label>
                <input
                  type="text"
                  value={externalUrl}
                  onChange={(e) => setExternalUrl(e.target.value.trim())}
                  placeholder="rtmp://... or rtsp://... or https://...m3u8"
                  className="w-full px-3 py-2 bg-white/[0.04] border border-white/10 rounded-lg text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-white"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1">
                  Backup Video
                </label>
                <select
                  value={fallbackVideoId}
                  onChange={(e) => setFallbackVideoId(e.target.value)}
                  className="w-full px-3 py-2 bg-white/[0.04] border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-white focus:bg-zinc-900"
                >
                  <option value="" className="bg-zinc-900 text-zinc-400">None</option>
                  {videos.map((v) => (
                    <option key={v.id} value={v.id} className="bg-zinc-900 text-white">
                      {v.original_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Mode Selector */}
          <div className="backdrop-blur-md bg-white/[0.03] border border-white/10 rounded-xl p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white">
                {isMultiStream ? 'Multi-Stream (Simulcast)' : 'Single Destination'}
              </span>
              <button
                type="button"
                onClick={() => setIsMultiStream(!isMultiStream)}
                className="px-2.5 py-1 text-xs font-semibold rounded-md border border-white/15 bg-white/[0.06] hover:bg-white/[0.12] text-white transition-all"
              >
                {isMultiStream ? 'Switch to Single' : 'Switch to Multi-Stream'}
              </button>
            </div>
          </div>

          {/* Single Mode */}
          {!isMultiStream ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {platformKeys.map((key) => {
                  const p = PLATFORMS[key];
                  const active = singlePlatform === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSinglePlatform(key)}
                      className={`p-2 rounded-xl border text-center transition-all ${
                        active
                          ? 'border-white bg-white/[0.12] text-white ring-1 ring-white/40'
                          : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:text-white'
                      }`}
                    >
                      <PlatformIcon platform={key} className="w-4 h-4 mx-auto mb-1" />
                      <span className="text-[11px] font-medium">{p.badgeText}</span>
                    </button>
                  );
                })}
              </div>

              {singlePlatform === 'custom' ? (
                <div>
                  <input
                    type="text"
                    value={singleCustomUrl}
                    onChange={(e) => setSingleCustomUrl(e.target.value)}
                    className="w-full px-3 py-2 bg-white/[0.04] border border-white/10 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-white"
                    required
                  />
                </div>
              ) : (
                <div className="space-y-2.5 p-3 rounded-xl bg-white/[0.02] border border-white/10">
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-0.5">Ingest Server</label>
                    <input
                      type="text"
                      value={singleServer}
                      onChange={(e) => setSingleServer(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white/[0.04] border border-white/10 rounded-lg text-xs text-zinc-300 font-mono focus:outline-none focus:border-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-0.5">Stream Key</label>
                    <input
                      type="password"
                      value={singleKey}
                      onChange={(e) => setSingleKey(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white/[0.04] border border-white/10 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-white"
                      required
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Multi-Stream Mode */
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-300">Destinations ({destinations.length})</span>
                <button
                  type="button"
                  onClick={addDestination}
                  className="px-2 py-1 text-xs bg-white/[0.06] hover:bg-white/[0.12] text-white rounded-md border border-white/10"
                >
                  + Add Destination
                </button>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {destinations.map((dest) => (
                  <div key={dest.id} className="p-2.5 rounded-xl border border-white/10 bg-white/[0.02] space-y-1.5">
                    <div className="flex justify-between items-center">
                      <select
                        value={dest.platform}
                        onChange={(e) => updateDestination(dest.id, { platform: e.target.value as PlatformId })}
                        className="bg-zinc-900 text-white text-xs border border-white/15 rounded px-2 py-1"
                      >
                        {platformKeys.map((k) => (
                          <option key={k} value={k}>{PLATFORMS[k].name}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => removeDestination(dest.id)}
                        className="text-xs text-red-400 hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                    <input
                      type="password"
                      value={dest.streamKey}
                      onChange={(e) => updateDestination(dest.id, { streamKey: e.target.value })}
                      placeholder="Stream Key"
                      className="w-full px-2 py-1 bg-white/[0.04] border border-white/10 rounded text-xs text-white font-mono focus:outline-none focus:border-white"
                      required
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quality */}
          <div>
            <label htmlFor="edit-quality" className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
              Stream Quality
            </label>
            <select
              id="edit-quality"
              value={formData.quality}
              onChange={(e) => setFormData({ ...formData, quality: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-white/[0.04] backdrop-blur-md border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-white focus:bg-zinc-900"
            >
              <option value="720p" className="bg-zinc-900 text-white">720p Landscape (1280x720)</option>
              <option value="1080p" className="bg-zinc-900 text-white">1080p Landscape (1920x1080)</option>
              <option value="vertical-720p" className="bg-zinc-900 text-white">720p Vertical (720x1280)</option>
              <option value="vertical-1080p" className="bg-zinc-900 text-white">1080p Vertical (1080x1920)</option>
              <option value="original" className="bg-zinc-900 text-white">Original Video Resolution</option>
            </select>
          </div>

          {/* Loop */}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="edit-loop"
              checked={formData.loopEnabled}
              onChange={(e) => setFormData({ ...formData, loopEnabled: e.target.checked })}
              className="h-4 w-4 rounded border-white/20 bg-white/10 text-white focus:ring-white"
            />
            <label htmlFor="edit-loop" className="text-xs text-zinc-300 cursor-pointer">
              Loop video continuously (24/7 continuous stream)
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 hover:text-white rounded-lg border border-white/10 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 text-xs font-semibold bg-white text-black hover:bg-zinc-200 rounded-lg shadow-[0_0_20px_rgba(255,255,255,0.25)] transition-all disabled:opacity-40"
            >
              {isLoading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}