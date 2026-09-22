import { useState, useEffect } from 'react';
import { getSession } from '@/lib/auth';
import { GetServerSidePropsContext } from 'next';
import axios from 'axios';
import VideoUpload from '@/components/VideoUpload';
import VideoLibrary from '@/components/VideoLibrary';
import Layout from '@/components/Layout';

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

export default function VideosPage() {
  const [videos, setVideos] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchVideos = async () => {
    try {
      const response = await axios.get('/api/videos/list');
      setVideos(response.data.videos || []);
    } catch (error) {
      console.error('Failed to fetch videos:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchVideos();
  }, []);

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 selection:bg-white selection:text-black">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
            Video Library
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/10 border border-white/20 text-white">
              {videos.length} Files
            </span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Upload MP4 videos for 24/7 looping and live stream hot-swapping
          </p>
        </div>

        <div className="space-y-8">
          {/* Upload Card */}
          <div className="backdrop-blur-2xl bg-white/[0.025] border border-white/10 rounded-2xl p-6 shadow-[0_12px_40px_rgba(0,0,0,0.6)]">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/10">
              <div className="w-7 h-7 rounded-lg bg-white text-black flex items-center justify-center font-bold text-xs shadow-[0_0_15px_rgba(255,255,255,0.3)]">
                ↑
              </div>
              <h2 className="text-lg font-bold text-white tracking-tight">Upload New Media</h2>
            </div>
            <VideoUpload onUploadComplete={fetchVideos} />
          </div>

          {/* Library Card */}
          <div className="backdrop-blur-2xl bg-white/[0.025] border border-white/10 rounded-2xl p-6 shadow-[0_12px_40px_rgba(0,0,0,0.6)]">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/10">
              <h2 className="text-lg font-bold text-white tracking-tight">Uploaded Videos</h2>
              <button
                onClick={fetchVideos}
                className="px-3 py-1 bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 hover:text-white rounded-lg text-xs font-medium border border-white/10 transition-all backdrop-blur-md"
              >
                Refresh List
              </button>
            </div>

            {isLoading ? (
              <div className="py-16 text-center text-zinc-500 text-sm">
                <div className="inline-block animate-spin w-5 h-5 border-2 border-white/20 border-t-white rounded-full mb-3" />
                <div>Loading media repository...</div>
              </div>
            ) : (
              <VideoLibrary videos={videos} onRefresh={fetchVideos} />
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}