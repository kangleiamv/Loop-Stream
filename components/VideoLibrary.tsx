import { useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { Video } from '@/types/video';
import VideoPreview from './VideoPreview';

interface VideoLibraryProps {
  videos: Video[];
  onRefresh: () => void;
}

export default function VideoLibrary({ videos, onRefresh }: VideoLibraryProps) {
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [previewVideo, setPreviewVideo] = useState<Video | null>(null);

  const totalSize = videos.reduce((acc, video) => acc + (video.file_size || 0), 0);
  const totalVideos = videos.length;

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  };

  const handleDelete = async (video: Video) => {
    if (!confirm(`Are you sure you want to delete "${video.original_name}"?`)) {
      return;
    }

    setDeletingId(video.id);

    try {
      await axios.delete(`/api/videos/${video.id}/delete`);
      toast.success('Video deleted successfully');
      onRefresh();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete video');
    } finally {
      setDeletingId(null);
    }
  };

  if (videos.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-500 text-xs">
        No videos uploaded yet. Upload an MP4 video above to get started.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 text-xs text-zinc-400 flex items-center gap-2">
        <span className="font-semibold text-white">{totalVideos} {totalVideos === 1 ? 'file' : 'files'}</span>
        <span>•</span>
        <span>Total storage: {formatFileSize(totalSize)}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {videos.map((video) => (
          <div
            key={video.id}
            className="backdrop-blur-xl bg-white/[0.025] border border-white/10 hover:border-white/20 rounded-2xl p-4 space-y-3 transition-all duration-300 shadow-[0_8px_30px_rgba(0,0,0,0.5)] group"
          >
            {/* Thumbnail / Video Box */}
            <div
              className="aspect-video bg-white/[0.04] border border-white/10 rounded-xl overflow-hidden cursor-pointer hover:opacity-90 transition-opacity relative group/thumb"
              onClick={() => setPreviewVideo(video)}
            >
              {video.thumbnail_path && video.filename ? (
                <img
                  src={`/api/thumbnails/${video.filename.replace(/\.[^/.]+$/, '')}_thumb.jpg`}
                  alt={video.original_name || 'Video'}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : null}
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 group-hover/thumb:bg-black/60 transition-colors">
                <div className="w-10 h-10 rounded-full bg-white/90 text-black flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.4)] group-hover/thumb:scale-110 transition-transform">
                  <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Video Details */}
            <div>
              <h3
                className="text-xs font-bold text-white truncate tracking-tight"
                title={video.original_name}
              >
                {video.original_name}
              </h3>
              <div className="text-[11px] text-zinc-400 space-y-0.5 mt-1">
                <p>{formatFileSize(video.file_size)}</p>
                <p>{dayjs(video.created_at).format('MMM D, YYYY • h:mm A')}</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setPreviewVideo(video)}
                className="flex-1 py-1.5 px-3 text-xs font-semibold bg-white text-black hover:bg-neutral-200 rounded-lg shadow-[0_0_15px_rgba(255,255,255,0.15)] transition-all"
              >
                Preview
              </button>
              <button
                onClick={() => handleDelete(video)}
                disabled={deletingId === video.id}
                className="py-1.5 px-3 text-xs font-medium bg-white/[0.04] hover:bg-red-500/15 text-zinc-400 hover:text-red-400 border border-white/10 rounded-lg transition-all disabled:opacity-40"
              >
                {deletingId === video.id ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {previewVideo && (
        <VideoPreview video={previewVideo} onClose={() => setPreviewVideo(null)} />
      )}
    </div>
  );
}