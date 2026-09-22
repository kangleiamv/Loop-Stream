import { useState } from 'react';
import { Video } from '@/types/video';

interface VideoPreviewProps {
  video: Video;
  onClose: () => void;
}

export default function VideoPreview({ video, onClose }: VideoPreviewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const videoUrl = `/api/serve-video/${video.filename}`;

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-2xl flex items-center justify-center z-50 p-4 selection:bg-white selection:text-black animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="backdrop-blur-3xl bg-zinc-950/90 border border-white/15 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-[0_25px_70px_rgba(0,0,0,0.95)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-white/10 flex justify-between items-center">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <h3 className="text-sm font-bold text-white truncate">{video.original_name}</h3>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-white/[0.08] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="relative bg-black aspect-video flex items-center justify-center">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-10">
              <div className="text-xs text-zinc-400 flex items-center gap-2">
                <div className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
                <span>Loading media stream...</span>
              </div>
            </div>
          )}
          <video
            src={videoUrl}
            controls
            autoPlay
            className="w-full h-full object-contain"
            onLoadedData={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false);
              console.error('Failed to load video:', videoUrl);
            }}
          >
            Your browser does not support the video tag.
          </video>
        </div>

        <div className="p-4 border-t border-white/10 flex justify-between items-center text-xs text-zinc-400">
          <div>
            Size: <span className="text-white font-medium">{((video.file_size || 0) / 1024 / 1024).toFixed(2)} MB</span>
          </div>
          <div>
            Uploaded: <span className="text-zinc-300">{video.created_at ? new Date(video.created_at).toLocaleString() : 'N/A'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}