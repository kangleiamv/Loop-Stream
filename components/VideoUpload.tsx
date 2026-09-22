import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import toast from 'react-hot-toast';

interface VideoUploadProps {
  onUploadComplete: () => void;
}

export default function VideoUpload({ onUploadComplete }: VideoUploadProps) {
  const [activeTab, setActiveTab] = useState<'file' | 'youtube'>('file');

  // File Upload State
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // YouTube Import State
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [isFetchingInfo, setIsFetchingInfo] = useState(false);
  const [videoInfo, setVideoInfo] = useState<any>(null);
  const [customTitle, setCustomTitle] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [errorInfo, setErrorInfo] = useState<{ message: string; requiresCookies?: boolean } | null>(null);

  // Drag and drop handler
  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;

      const file = acceptedFiles[0];
      const formData = new FormData();
      formData.append('file', file);

      setIsUploading(true);
      setUploadProgress(0);

      try {
        await axios.post('/api/videos/upload', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / (progressEvent.total || 1)
            );
            setUploadProgress(percentCompleted);
          },
        });

        toast.success('Video uploaded successfully!');
        onUploadComplete();
      } catch (error: any) {
        toast.error(error.response?.data?.error || 'Failed to upload video');
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
      }
    },
    [onUploadComplete]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'video/*': ['.mp4', '.avi', '.mov', '.mkv', '.webm'],
    },
    maxFiles: 1,
    disabled: isUploading,
  });

  // Fetch YouTube Info
  const handleFetchYoutubeInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!youtubeUrl.trim()) return;

    try {
      setIsFetchingInfo(true);
      setErrorInfo(null);
      setVideoInfo(null);
      const res = await axios.post('/api/videos/youtube/info', { url: youtubeUrl.trim() });
      setVideoInfo(res.data);
      setCustomTitle(res.data.title || '');
      toast.success('YouTube video detected!');
    } catch (err: any) {
      const errMsg = err.response?.data?.error || err.message || 'Failed to fetch YouTube video info';
      setErrorInfo({
        message: errMsg,
        requiresCookies: Boolean(err.response?.data?.requiresCookies),
      });
      toast.error(errMsg);
    } finally {
      setIsFetchingInfo(false);
    }
  };

  // Import YouTube Video
  const handleImportYoutubeVideo = async () => {
    if (!youtubeUrl.trim()) return;

    try {
      setIsImporting(true);
      setErrorInfo(null);
      const res = await axios.post('/api/videos/youtube/import', {
        url: youtubeUrl.trim(),
        customTitle: customTitle.trim() || undefined,
      });

      toast.success('YouTube video imported to library!');
      setYoutubeUrl('');
      setVideoInfo(null);
      setCustomTitle('');
      onUploadComplete();
    } catch (err: any) {
      const errMsg = err.response?.data?.error || err.message || 'Failed to import YouTube video';
      setErrorInfo({
        message: errMsg,
        requiresCookies: Boolean(err.response?.data?.requiresCookies),
      });
      toast.error(errMsg);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Switcher Tabs */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('file')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'file'
              ? 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.25)]'
              : 'text-zinc-400 hover:text-white hover:bg-white/[0.05]'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          Upload Local Video
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('youtube')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'youtube'
              ? 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.25)]'
              : 'text-zinc-400 hover:text-white hover:bg-white/[0.05]'
          }`}
        >
          <svg className="w-4 h-4 text-red-500 fill-current" viewBox="0 0 24 24">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
          </svg>
          Import from YouTube
        </button>
      </div>

      {/* Tab 1: Local File Drag & Drop */}
      {activeTab === 'file' && (
        <div>
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-2xl p-8 sm:p-10 text-center cursor-pointer transition-all duration-300 backdrop-blur-md ${
              isDragActive
                ? 'border-white bg-white/[0.08] shadow-[0_0_30px_rgba(255,255,255,0.15)] scale-[1.01]'
                : 'border-white/15 bg-white/[0.02] hover:border-white/35 hover:bg-white/[0.04]'
            } ${isUploading ? 'pointer-events-none opacity-60' : ''}`}
          >
            <input {...getInputProps()} />

            <div className="flex flex-col items-center justify-center space-y-3">
              <div className="w-12 h-12 rounded-xl bg-white/[0.05] border border-white/15 flex items-center justify-center text-white shadow-[0_0_20px_rgba(255,255,255,0.1)]">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>

              <div className="text-center">
                <p className="text-sm font-semibold text-white">
                  {isDragActive ? 'Drop your video file here' : 'Drag & drop a video file, or click to browse'}
                </p>
                <p className="text-xs text-zinc-400 mt-1">
                  Supports MP4, MOV, MKV, WebM (up to 2GB)
                </p>
              </div>
            </div>
          </div>

          {isUploading && (
            <div className="mt-4 p-4 rounded-xl bg-white/[0.03] border border-white/10 backdrop-blur-md">
              <div className="flex justify-between text-xs text-zinc-300 font-medium mb-1.5">
                <span>Uploading media to server...</span>
                <span className="font-bold text-white">{uploadProgress}%</span>
              </div>
              <div className="w-full bg-white/[0.08] rounded-full h-2 overflow-hidden">
                <div
                  className="bg-white h-2 rounded-full transition-all duration-200 shadow-[0_0_12px_rgba(255,255,255,0.8)]"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: YouTube Video Import */}
      {activeTab === 'youtube' && (
        <div className="backdrop-blur-xl bg-white/[0.025] border border-white/10 rounded-2xl p-6 shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
          <form onSubmit={handleFetchYoutubeInfo} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2">
                YouTube Video or Shorts Link
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
                  value={youtubeUrl}
                  onChange={(e) => {
                    setYoutubeUrl(e.target.value);
                    if (errorInfo) setErrorInfo(null);
                  }}
                  disabled={isFetchingInfo || isImporting}
                  className="flex-1 px-4 py-2.5 bg-white/[0.04] border border-white/10 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-white transition-all font-mono"
                />
                <button
                  type="submit"
                  disabled={isFetchingInfo || !youtubeUrl.trim() || isImporting}
                  className="px-5 py-2.5 bg-white text-black font-semibold text-xs rounded-xl hover:bg-zinc-200 transition-all shadow-[0_0_15px_rgba(255,255,255,0.2)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isFetchingInfo ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                      Inspecting...
                    </>
                  ) : (
                    <>
                      <span>🔍</span>
                      Inspect Video
                    </>
                  )}
                </button>
              </div>
              <p className="text-[11px] text-zinc-500 mt-1.5">
                Pastes YouTube standard videos, livestreams, or vertical YouTube Shorts.
              </p>
            </div>
          </form>

          {/* YouTube Extraction Error / Cookies Prompt */}
          {errorInfo && (
            <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 backdrop-blur-md space-y-2">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-lg bg-red-500/20 text-red-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex-1 text-xs">
                  <p className="font-semibold text-red-200">{errorInfo.message}</p>
                  {errorInfo.requiresCookies && (
                    <div className="mt-2.5 pt-2.5 border-t border-red-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <span className="text-[11px] text-zinc-300">
                        YouTube bot protection is blocking access. Add your YouTube credentials via <code className="text-white bg-white/10 px-1 py-0.5 rounded">cookies.json</code> in Settings.
                      </span>
                      <Link
                        href="/settings"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-white font-medium rounded-lg text-xs border border-red-500/30 transition-all flex-shrink-0"
                      >
                        <span>Open Settings</span>
                        <span>→</span>
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* YouTube Video Preview & Import Box */}
          {videoInfo && (
            <div className="mt-5 p-4 rounded-xl bg-white/[0.03] border border-white/15 backdrop-blur-md space-y-4 animate-fadeIn">
              <div className="flex flex-col sm:flex-row gap-4 items-start">
                {videoInfo.thumbnail && (
                  <div className="relative w-full sm:w-48 aspect-video rounded-lg overflow-hidden border border-white/10 flex-shrink-0 bg-black">
                    <img
                      src={videoInfo.thumbnail}
                      alt={videoInfo.title}
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-mono text-white">
                      {videoInfo.durationFormatted}
                    </span>
                  </div>
                )}

                <div className="flex-1 space-y-2">
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Video Title (Editable)</label>
                    <input
                      type="text"
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                      disabled={isImporting}
                      className="w-full px-3 py-1.5 bg-white/[0.05] border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-white font-medium"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400 pt-1">
                    <span className="text-zinc-300 font-medium">Channel: {videoInfo.uploader}</span>
                    <span>•</span>
                    <span className="px-2 py-0.5 rounded bg-white/[0.06] text-white text-[11px]">
                      {videoInfo.resolution}
                    </span>
                    <span>•</span>
                    <span className="text-emerald-400 font-medium">Ready for 24/7 Loop</span>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                <span className="text-xs text-zinc-400">
                  {isImporting ? 'Downloading high-resolution MP4 directly to server...' : 'Downloads directly into video library'}
                </span>

                <button
                  type="button"
                  onClick={handleImportYoutubeVideo}
                  disabled={isImporting}
                  className="px-5 py-2.5 bg-white text-black font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-zinc-200 transition-all shadow-[0_0_20px_rgba(255,255,255,0.3)] active:scale-[0.99] disabled:opacity-50 flex items-center gap-2"
                >
                  {isImporting ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                      Importing Video...
                    </>
                  ) : (
                    <>
                      <span>⬇️</span>
                      Import to Video Library
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}