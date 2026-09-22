import { useState, useEffect } from 'react';
import { getSession } from '@/lib/auth';
import { GetServerSidePropsContext } from 'next';
import axios from 'axios';
import toast from 'react-hot-toast';
import Layout from '@/components/Layout';
import StreamCard from '@/components/StreamCard';
import StreamForm from '@/components/StreamForm';

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
}

export default function StreamsPage() {
  const [streams, setStreams] = useState<Stream[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchStreams = async () => {
    try {
      const response = await axios.get('/api/streams/list');
      setStreams(response.data.streams);
    } catch (error) {
      console.error('Failed to fetch streams:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStreams();
    const interval = setInterval(fetchStreams, 5000);
    return () => clearInterval(interval);
  }, []);

  const activeCount = streams.filter((s) => s.status === 'running').length;

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header Title & Actions */}
        <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
              Stream Management
              {activeCount > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white text-black shadow-[0_0_15px_rgba(255,255,255,0.4)]">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  {activeCount} Broadcasting
                </span>
              )}
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              Create, configure, and hot-swap 24/7 multi-platform live streams
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={async () => {
                try {
                  await axios.post('/api/streams/sync-status', {});
                  toast.success('Stream status synchronized');
                  fetchStreams();
                } catch (error) {
                  toast.error('Failed to sync status');
                }
              }}
              className="px-3.5 py-2 bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 hover:text-white rounded-lg text-xs font-medium border border-white/10 transition-all backdrop-blur-md"
              title="Sync database status with actual running streams"
            >
              Sync Status
            </button>

            <button
              onClick={async () => {
                try {
                  const response = await axios.post('/api/streams/cleanup', {});
                  toast.success(response.data.message);
                  fetchStreams();
                } catch (error) {
                  toast.error('Failed to cleanup duplicates');
                }
              }}
              className="px-3.5 py-2 bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 hover:text-white rounded-lg text-xs font-medium border border-white/10 transition-all backdrop-blur-md"
            >
              Clean Duplicates
            </button>

            <button
              onClick={async () => {
                if (confirm('Force stop ALL streams? This will kill all FFmpeg processes immediately.')) {
                  try {
                    await axios.post('/api/streams/force-stop', {});
                    toast.success('All streams stopped');
                    fetchStreams();
                  } catch (error) {
                    toast.error('Failed to force stop');
                  }
                }
              }}
              className="px-3.5 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs font-medium border border-red-500/25 transition-all backdrop-blur-md"
            >
              Force Stop All
            </button>
          </div>
        </div>

        {/* Form and Streams Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Create Stream Card */}
          <div className="lg:col-span-5">
            <div className="backdrop-blur-2xl bg-white/[0.025] border border-white/10 rounded-2xl p-6 shadow-[0_12px_40px_rgba(0,0,0,0.6)]">
              <div className="flex items-center justify-between mb-5 pb-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-white text-black flex items-center justify-center font-bold text-xs shadow-[0_0_15px_rgba(255,255,255,0.3)]">
                    +
                  </div>
                  <h2 className="text-lg font-bold text-white tracking-tight">Create Stream</h2>
                </div>
                <span className="text-[11px] text-zinc-400 font-mono">Multi-Platform</span>
              </div>
              <StreamForm onSuccess={fetchStreams} />
            </div>
          </div>

          {/* Active / Created Streams */}
          <div className="lg:col-span-7">
            <div className="backdrop-blur-2xl bg-white/[0.025] border border-white/10 rounded-2xl p-6 shadow-[0_12px_40px_rgba(0,0,0,0.6)]">
              <div className="flex items-center justify-between mb-5 pb-3 border-b border-white/10">
                <div className="flex items-center gap-2.5">
                  <h2 className="text-lg font-bold text-white tracking-tight">Configured Streams</h2>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-white/10 border border-white/15 text-white">
                    {streams.length}
                  </span>
                </div>
                <span className="text-[11px] text-zinc-400">Live Auto-Update</span>
              </div>

              {isLoading ? (
                <div className="py-16 text-center text-zinc-500 text-sm">
                  <div className="inline-block animate-spin w-5 h-5 border-2 border-white/20 border-t-white rounded-full mb-3" />
                  <div>Loading configured streams...</div>
                </div>
              ) : streams.length === 0 ? (
                <div className="py-16 text-center text-zinc-400 text-xs">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-center text-zinc-500">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                  No streams created yet. Use the form on the left to set up your first stream.
                </div>
              ) : (
                <div className="space-y-4">
                  {streams.map((stream) => (
                    <StreamCard key={stream.id} stream={stream} onUpdate={fetchStreams} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}