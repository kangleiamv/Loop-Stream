import { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

interface Video {
  id: number;
  original_name: string;
  filename: string;
  file_size?: number;
  thumbnail_path?: string;
  created_at?: string;
}

interface Stream {
  id: number;
  name: string;
  video_id: number;
  video_name?: string;
  status: 'running' | 'stopped' | 'error';
}

interface SwitchVideoModalProps {
  stream: Stream;
  onClose: () => void;
  onSuccess: () => void;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const idx = Math.min(Math.max(i, 0), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, idx)).toFixed(1))} ${sizes[idx]}`;
}

export default function SwitchVideoModal({ stream, onClose, onSuccess }: SwitchVideoModalProps) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<number>(stream.video_id);
  const [isLoadingVideos, setIsLoadingVideos] = useState(true);
  const [isSwitching, setIsSwitching] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchVideos();
  }, []);

  const fetchVideos = async () => {
    try {
      setIsLoadingVideos(true);
      const response = await axios.get('/api/videos/list');
      setVideos(response.data.videos || []);
    } catch (error) {
      toast.error('Failed to load videos list');
    } finally {
      setIsLoadingVideos(false);
    }
  };

  const handleSwitch = async () => {
    if (selectedVideoId === stream.video_id) {
      toast.error('This video is already selected for this stream');
      return;
    }

    setIsSwitching(true);
    try {
      const response = await axios.post(`/api/streams/${stream.id}/switch-video`, {
        videoId: selectedVideoId,
      });

      toast.success(
        stream.status === 'running'
          ? `⚡ Live video switched to "${response.data.videoName}" without ending stream!`
          : `Video switched to "${response.data.videoName}"`
      );
      onSuccess();
    } catch (error: any) {
      const msg = error.response?.data?.error || 'Failed to switch video';
      toast.error(msg);
    } finally {
      setIsSwitching(false);
    }
  };

  const filteredVideos = videos.filter((v) =>
    v.original_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedVideo = videos.find((v) => v.id === selectedVideoId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-2xl p-4 overflow-y-auto selection:bg-white selection:text-black">
      <div className="backdrop-blur-3xl bg-zinc-950/85 border border-white/15 rounded-2xl shadow-[0_25px_70px_rgba(0,0,0,0.95)] max-w-lg w-full p-6 text-white animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white text-black flex items-center justify-center font-bold text-sm shadow-[0_0_20px_rgba(255,255,255,0.3)]">
              ⚡
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">Switch Video Live</h2>
              <p className="text-xs text-zinc-400">
                Stream: <span className="font-semibold text-white">{stream.name}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSwitching}
            className="text-zinc-400 hover:text-white text-sm p-1.5 rounded-lg hover:bg-white/[0.08] transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Live Status Banner */}
        {stream.status === 'running' ? (
          <div className="mt-4 p-3 rounded-xl bg-white/[0.04] border border-white/15 flex items-center gap-3">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <div className="text-xs">
              <span className="font-semibold text-white">Broadcast is LIVE.</span>{' '}
              <span className="text-zinc-400">
                Hot-swaps the video instantly without dropping the RTMP connection to Twitch, YouTube, Kick, etc.
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-4 p-3 rounded-xl bg-white/[0.03] border border-white/10 text-xs text-zinc-400">
            Select the new video for this stream.
          </div>
        )}

        {/* Search */}
        <div className="mt-4">
          <input
            type="text"
            placeholder="Search videos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3.5 py-2 bg-white/[0.04] backdrop-blur-md border border-white/10 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-white focus:ring-1 focus:ring-white/40 transition-all"
          />
        </div>

        {/* Video List */}
        <div className="mt-3 max-h-60 overflow-y-auto space-y-2 pr-1">
          {isLoadingVideos ? (
            <div className="py-8 text-center text-xs text-zinc-500">
              Loading available videos...
            </div>
          ) : filteredVideos.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-500">
              No videos found. Upload videos from the Videos page.
            </div>
          ) : (
            filteredVideos.map((video) => {
              const isCurrent = video.id === stream.video_id;
              const isSelected = video.id === selectedVideoId;
              return (
                <div
                  key={video.id}
                  onClick={() => !isSwitching && setSelectedVideoId(video.id)}
                  className={`flex items-center justify-between p-3 rounded-xl border text-xs cursor-pointer transition-all duration-200 ${
                    isSelected
                      ? 'border-white bg-white/[0.08] shadow-[0_0_20px_rgba(255,255,255,0.1)] ring-1 ring-white/30'
                      : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05]'
                  }`}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                        isSelected ? 'border-white bg-white' : 'border-zinc-600'
                      }`}
                    >
                      {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-black" />}
                    </div>
                    <div className="truncate">
                      <div className="font-medium text-white truncate flex items-center gap-2">
                        <span className="truncate">{video.original_name}</span>
                        {isCurrent && (
                          <span className="px-1.5 py-0.5 rounded-sm text-[10px] font-semibold bg-white/10 text-white border border-white/20 shrink-0">
                            Currently Live
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-zinc-400 mt-0.5">
                        {video.file_size ? formatBytes(video.file_size) : 'Ready to stream'}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Target Video Highlight */}
        {selectedVideo && selectedVideo.id !== stream.video_id && (
          <div className="mt-4 p-3 rounded-xl bg-white/[0.05] border border-white/15 text-xs flex items-center justify-between">
            <span className="text-zinc-400">Target Switch:</span>
            <span className="font-semibold text-white truncate ml-2 max-w-[250px]">
              {selectedVideo.original_name}
            </span>
          </div>
        )}

        {/* Footer Actions */}
        <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            disabled={isSwitching}
            className="px-4 py-2 text-xs font-medium bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 hover:text-white rounded-lg transition-all border border-white/10"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSwitch}
            disabled={isSwitching || selectedVideoId === stream.video_id}
            className="px-4 py-2 text-xs font-semibold bg-white text-black hover:bg-zinc-200 rounded-lg transition-all shadow-[0_0_20px_rgba(255,255,255,0.25)] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSwitching ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5 text-black" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Switching Video Live...</span>
              </>
            ) : (
              <>
                <span>⚡</span>
                <span>{stream.status === 'running' ? 'Hot-Swap Video Now' : 'Apply Video'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
