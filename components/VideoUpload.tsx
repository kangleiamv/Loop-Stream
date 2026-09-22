import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import toast from 'react-hot-toast';

interface VideoUploadProps {
  onUploadComplete: () => void;
}

export default function VideoUpload({ onUploadComplete }: VideoUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

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

  return (
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
  );
}