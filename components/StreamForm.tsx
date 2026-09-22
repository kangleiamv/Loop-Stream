import { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { PLATFORMS, PlatformId, PlatformConfig } from '@/lib/platforms';
import PlatformIcon from './PlatformIcon';

interface Video {
  id: number;
  original_name: string;
}

interface StreamFormProps {
  onSuccess: () => void;
}

interface DestinationItem {
  id: string;
  platform: PlatformId;
  server: string;
  streamKey: string;
  useBackup?: boolean;
}

export default function StreamForm({ onSuccess }: StreamFormProps) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMultiStream, setIsMultiStream] = useState(false);

  // Single mode state
  const [singlePlatform, setSinglePlatform] = useState<PlatformId>('youtube');
  const [singleKey, setSingleKey] = useState('');
  const [singleServer, setSingleServer] = useState(PLATFORMS.youtube.defaultServer);
  const [singleBackup, setSingleBackup] = useState(false);
  const [singleCustomUrl, setSingleCustomUrl] = useState('');

  // Multi-stream destinations list
  const [destinations, setDestinations] = useState<DestinationItem[]>([
    {
      id: 'dest-1',
      platform: 'youtube',
      server: PLATFORMS.youtube.defaultServer,
      streamKey: '',
      useBackup: false,
    },
    {
      id: 'dest-2',
      platform: 'twitch',
      server: PLATFORMS.twitch.defaultServer,
      streamKey: '',
    },
  ]);

  const [formData, setFormData] = useState({
    name: '',
    videoId: '',
    quality: '720p',
    loopEnabled: true,
  });

  const [sourceType, setSourceType] = useState<'video' | 'rtmp_ingest' | 'rtmp_pull'>('video');
  const [ingestKey, setIngestKey] = useState('live_loopstream');
  const [externalUrl, setExternalUrl] = useState('');
  const [fallbackVideoId, setFallbackVideoId] = useState('');
  const [autoStart, setAutoStart] = useState(true);

  useEffect(() => {
    fetchVideos();
  }, []);

  // Update singleServer when singlePlatform changes
  useEffect(() => {
    const config = PLATFORMS[singlePlatform];
    if (singlePlatform === 'youtube') {
      setSingleServer(singleBackup && config.backupServer ? config.backupServer : config.defaultServer);
    } else {
      setSingleServer(config.defaultServer);
    }
  }, [singlePlatform, singleBackup]);

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
      toast.error('Please select a video from your library');
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
      await axios.post('/api/streams/create', {
        name: formData.name,
        videoId: formData.videoId || fallbackVideoId || null,
        rtmpUrl: finalUrls.join('\n'),
        quality: formData.quality,
        loopEnabled: formData.loopEnabled,
        sourceType,
        sourceUrl: sourceType === 'rtmp_ingest' ? ingestKey : sourceType === 'rtmp_pull' ? externalUrl : undefined,
        fallbackVideoId: fallbackVideoId || null,
        autoStart,
      });

      toast.success(
        sourceType === 'rtmp_ingest'
          ? 'RTMP Ingest stream created! Stream from OBS to start broadcasting.'
          : 'Stream created successfully!'
      );
      setFormData({
        name: '',
        videoId: '',
        quality: '720p',
        loopEnabled: true,
      });
      setFallbackVideoId('');
      setExternalUrl('');
      setSingleKey('');
      setSingleCustomUrl('');
      setDestinations([
        {
          id: 'dest-1',
          platform: 'youtube',
          server: PLATFORMS.youtube.defaultServer,
          streamKey: '',
          useBackup: false,
        },
        {
          id: 'dest-2',
          platform: 'twitch',
          server: PLATFORMS.twitch.defaultServer,
          streamKey: '',
        },
      ]);
      onSuccess();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to create stream');
    } finally {
      setIsLoading(false);
    }
  };

  const platformKeys = Object.keys(PLATFORMS) as PlatformId[];

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-white selection:bg-white selection:text-black">
      {/* Stream Name */}
      <div>
        <label htmlFor="name" className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
          Stream Name
        </label>
        <input
          type="text"
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="w-full px-3.5 py-2.5 bg-white/[0.04] backdrop-blur-md border border-white/10 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-white focus:bg-white/[0.07] focus:ring-1 focus:ring-white/40 transition-all"
          placeholder="e.g. 24/7 Lo-Fi Live Broadcast"
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
            <span className="truncate">RTMP Ingest (OBS)</span>
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

      {/* Source Inputs Based on Type */}
      {sourceType === 'video' && (
        <div>
          <label htmlFor="video" className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
            Select Video Source
          </label>
          <select
            id="video"
            value={formData.videoId}
            onChange={(e) => setFormData({ ...formData, videoId: e.target.value })}
            className="w-full px-3.5 py-2.5 bg-white/[0.04] backdrop-blur-md border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-white focus:bg-zinc-900 focus:ring-1 focus:ring-white/40 transition-all"
            required
          >
            <option value="" className="bg-zinc-900 text-zinc-400">Choose an uploaded video...</option>
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
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                Ingest Stream Key
              </label>
              <span className="text-[11px] text-zinc-400">Port 1935</span>
            </div>
            <input
              type="text"
              value={ingestKey}
              onChange={(e) => setIngestKey(e.target.value.trim())}
              placeholder="e.g. live_loopstream"
              className="w-full px-3.5 py-2 bg-white/[0.04] border border-white/10 rounded-lg text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-white"
              required
            />
            <p className="text-[11px] text-zinc-400 mt-1">
              Broadcast target in OBS: <span className="font-mono text-zinc-200">rtmp://&lt;server&gt;:1935/live/{ingestKey}</span>
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1">
              Backup Loop Video (Optional Failover)
            </label>
            <select
              value={fallbackVideoId}
              onChange={(e) => setFallbackVideoId(e.target.value)}
              className="w-full px-3.5 py-2 bg-white/[0.04] border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-white focus:bg-zinc-900"
            >
              <option value="" className="bg-zinc-900 text-zinc-400">None (Wait for OBS signal)</option>
              {videos.map((v) => (
                <option key={v.id} value={v.id} className="bg-zinc-900 text-white">
                  {v.original_name} (Backup Loop)
                </option>
              ))}
            </select>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Plays in 24/7 loop while OBS is offline. Switches to live OBS automatically when you start streaming!
            </p>
          </div>

          <label className="flex items-center gap-2 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={autoStart}
              onChange={(e) => setAutoStart(e.target.checked)}
              className="rounded bg-white/10 border-white/20 text-white focus:ring-0"
            />
            <span className="text-xs text-zinc-300">
              Auto-forward live broadcast to destinations when RTMP signal is received
            </span>
          </label>
        </div>
      )}

      {sourceType === 'rtmp_pull' && (
        <div className="space-y-3 p-3.5 rounded-xl bg-white/[0.03] border border-white/10 backdrop-blur-md">
          <div>
            <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1">
              External Stream Source URL
            </label>
            <input
              type="text"
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value.trim())}
              placeholder="rtmp://... or rtsp://... or https://...m3u8"
              className="w-full px-3.5 py-2 bg-white/[0.04] border border-white/10 rounded-lg text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-white"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1">
              Backup Video (If External Stream Drops)
            </label>
            <select
              value={fallbackVideoId}
              onChange={(e) => setFallbackVideoId(e.target.value)}
              className="w-full px-3.5 py-2 bg-white/[0.04] border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-white focus:bg-zinc-900"
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

      {/* Mode Selector: Single vs Multi-Stream Simulcast */}
      <div className="backdrop-blur-md bg-white/[0.03] border border-white/10 rounded-xl p-3.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-xs font-bold text-white flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isMultiStream ? 'bg-white' : 'bg-zinc-400'} opacity-75`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${isMultiStream ? 'bg-white' : 'bg-zinc-400'}`}></span>
              </span>
              {isMultiStream ? 'Simulcast (Multi-Platform)' : 'Single Destination'}
            </span>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              {isMultiStream
                ? 'Broadcast to multiple platforms with single-encode efficiency'
                : 'Broadcast to one platform'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsMultiStream(!isMultiStream)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
              isMultiStream
                ? 'bg-white text-black border-white shadow-[0_0_15px_rgba(255,255,255,0.25)]'
                : 'bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 border-white/10'
            }`}
          >
            {isMultiStream ? 'Set to Single' : 'Enable Multi-Stream'}
          </button>
        </div>
      </div>

      {/* SINGLE PLATFORM MODE */}
      {!isMultiStream ? (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2">
              Destination Platform
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {platformKeys.map((key) => {
                const p = PLATFORMS[key];
                const active = singlePlatform === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSinglePlatform(key)}
                    className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all duration-200 ${
                      active
                        ? 'border-white bg-white/[0.12] text-white shadow-[0_0_20px_rgba(255,255,255,0.15)] ring-1 ring-white/40'
                        : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.06] text-zinc-400 hover:text-white'
                    }`}
                  >
                    <PlatformIcon platform={key} className="w-5 h-5 mb-1" />
                    <span className="text-xs font-medium truncate w-full">{p.badgeText}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Form fields for single platform */}
          {singlePlatform === 'custom' ? (
            <div>
              <label htmlFor="customUrl" className="block text-xs font-medium text-zinc-300 mb-1">
                Full Custom RTMP / RTMPS URL
              </label>
              <input
                type="text"
                id="customUrl"
                value={singleCustomUrl}
                onChange={(e) => setSingleCustomUrl(e.target.value)}
                placeholder="rtmp://your-rtmp-server.com/live/your_key"
                className="w-full px-3 py-2 bg-white/[0.04] backdrop-blur-md border border-white/10 rounded-lg text-white font-mono text-xs focus:outline-none focus:border-white focus:ring-1 focus:ring-white/40"
                required
              />
            </div>
          ) : (
            <div className="space-y-3 p-3.5 border border-white/10 rounded-xl bg-white/[0.02] backdrop-blur-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <PlatformIcon platform={singlePlatform} className="w-4 h-4" />
                  <span className="text-xs font-bold text-white">
                    {PLATFORMS[singlePlatform].name}
                  </span>
                </div>
                <span className="text-[11px] text-zinc-400 truncate max-w-[200px]">
                  {PLATFORMS[singlePlatform].guide}
                </span>
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Ingest Server URL</label>
                <input
                  type="text"
                  value={singleServer}
                  onChange={(e) => setSingleServer(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white/[0.04] border border-white/10 rounded-lg text-xs text-zinc-300 font-mono focus:outline-none focus:border-white"
                />
              </div>

              <div>
                <label htmlFor="singleKey" className="block text-[11px] text-zinc-400 mb-1">
                  Stream Key
                </label>
                <input
                  type="password"
                  id="singleKey"
                  value={singleKey}
                  onChange={(e) => setSingleKey(e.target.value)}
                  placeholder={PLATFORMS[singlePlatform].keyPlaceholder}
                  className="w-full px-3 py-2 bg-white/[0.04] border border-white/10 rounded-lg text-white font-mono text-xs focus:outline-none focus:border-white focus:ring-1 focus:ring-white/40"
                  required
                />
              </div>

              {singlePlatform === 'youtube' && (
                <label className="flex items-center space-x-2 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={singleBackup}
                    onChange={(e) => setSingleBackup(e.target.checked)}
                    className="rounded border-white/20 bg-white/10 text-white focus:ring-white h-4 w-4"
                  />
                  <span className="text-xs text-zinc-300">Use YouTube Backup Ingest Server</span>
                </label>
              )}
            </div>
          )}
        </div>
      ) : (
        /* MULTI-STREAM SIMULCAST MODE */
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider">
              Destinations ({destinations.length})
            </label>
            <button
              type="button"
              onClick={addDestination}
              className="px-2.5 py-1 text-xs font-medium bg-white/[0.06] hover:bg-white/[0.12] text-white rounded-lg flex items-center gap-1 border border-white/10 transition-colors"
            >
              <span>+</span> Add Platform
            </button>
          </div>

          <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
            {destinations.map((dest, index) => {
              const config = PLATFORMS[dest.platform];
              return (
                <div
                  key={dest.id}
                  className="p-3 border border-white/10 rounded-xl bg-white/[0.02] backdrop-blur-md space-y-2 relative transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-zinc-500 w-4">
                        #{index + 1}
                      </span>
                      <PlatformIcon platform={dest.platform} className="w-4 h-4" />
                      <select
                        value={dest.platform}
                        onChange={(e) =>
                          updateDestination(dest.id, { platform: e.target.value as PlatformId })
                        }
                        className="text-xs font-medium bg-zinc-900 border border-white/15 rounded-md px-2 py-1 text-white focus:outline-none"
                      >
                        {platformKeys.map((k) => (
                          <option key={k} value={k} className="bg-zinc-900 text-white">
                            {PLATFORMS[k].name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeDestination(dest.id)}
                      className="text-xs text-red-400 hover:text-red-300 hover:underline"
                      title="Remove destination"
                    >
                      Remove
                    </button>
                  </div>

                  {dest.platform === 'custom' ? (
                    <div>
                      <input
                        type="text"
                        value={dest.server}
                        onChange={(e) => updateDestination(dest.id, { server: e.target.value })}
                        placeholder="rtmp://server.com/live/key"
                        className="w-full px-2.5 py-1.5 bg-white/[0.04] border border-white/10 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-white"
                        required
                      />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-zinc-400 mb-0.5">
                          Server URL
                        </label>
                        <input
                          type="text"
                          value={dest.server}
                          onChange={(e) => updateDestination(dest.id, { server: e.target.value })}
                          className="w-full px-2 py-1 bg-white/[0.04] border border-white/10 rounded-lg text-[11px] text-zinc-300 font-mono truncate focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-zinc-400 mb-0.5">
                          Stream Key
                        </label>
                        <input
                          type="password"
                          value={dest.streamKey}
                          onChange={(e) => updateDestination(dest.id, { streamKey: e.target.value })}
                          placeholder={config.keyPlaceholder}
                          className="w-full px-2 py-1 bg-white/[0.04] border border-white/10 rounded-lg text-[11px] text-white font-mono focus:outline-none focus:border-white"
                          required
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quality Setting */}
      <div>
        <label htmlFor="quality" className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
          Resolution & Bitrate Preset
        </label>
        <select
          id="quality"
          value={formData.quality}
          onChange={(e) => setFormData({ ...formData, quality: e.target.value })}
          className="w-full px-3.5 py-2.5 bg-white/[0.04] backdrop-blur-md border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-white focus:bg-zinc-900 transition-all"
        >
          <option value="720p" className="bg-zinc-900 text-white">720p Landscape - 1280x720 (2 Mbps - Standard)</option>
          <option value="1080p" className="bg-zinc-900 text-white">1080p Landscape - 1920x1080 (3.5 Mbps - High Def)</option>
          <option value="vertical-720p" className="bg-zinc-900 text-white">720p Vertical - 720x1280 (Instagram & TikTok)</option>
          <option value="vertical-1080p" className="bg-zinc-900 text-white">1080p Vertical - 1080x1920 (Instagram & TikTok HD)</option>
          <option value="original" className="bg-zinc-900 text-white">Original Source Resolution (No scaling)</option>
        </select>
      </div>

      {/* Loop Setting */}
      <div className="flex items-center gap-2 pt-1">
        <input
          type="checkbox"
          id="loop"
          checked={formData.loopEnabled}
          onChange={(e) => setFormData({ ...formData, loopEnabled: e.target.checked })}
          className="h-4 w-4 rounded border-white/20 bg-white/10 text-white focus:ring-white"
        />
        <label htmlFor="loop" className="text-xs text-zinc-300 cursor-pointer">
          Loop video continuously (24/7 non-stop broadcast)
        </label>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isLoading || videos.length === 0}
        className="w-full py-3 px-4 bg-white text-black font-semibold text-xs uppercase tracking-wider rounded-lg hover:bg-neutral-200 focus:outline-none transition-all shadow-[0_0_20px_rgba(255,255,255,0.25)] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isLoading
          ? 'Initializing Stream...'
          : isMultiStream
          ? `Create Multi-Stream (${destinations.length} Platforms)`
          : 'Create Stream'}
      </button>

      {videos.length === 0 && (
        <p className="text-[11px] text-zinc-500 text-center">
          Upload a video in the Videos tab first to create a stream
        </p>
      )}
    </form>
  );
}