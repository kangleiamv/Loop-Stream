import { useState } from 'react';
import { useRouter } from 'next/router';
import { GetServerSidePropsContext } from 'next';
import { getSession } from '@/lib/auth';
import axios from 'axios';
import toast from 'react-hot-toast';

export const getServerSideProps = async (context: GetServerSidePropsContext) => {
  const session = await getSession(context.req, context.res);
  
  if (session.user?.isLoggedIn) {
    return {
      redirect: {
        destination: '/dashboard',
        permanent: false,
      },
    };
  }

  return {
    props: {},
  };
};

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await axios.post('/api/auth/login', { username, password });
      toast.success('Login successful!');
      window.location.href = '/dashboard';
    } catch (error) {
      toast.error('Invalid credentials');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white relative px-4 overflow-hidden selection:bg-white selection:text-black">
      {/* Ambient background blur spotlights */}
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-white/[0.05] rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute -bottom-32 right-1/4 w-[450px] h-[350px] bg-white/[0.03] rounded-full blur-[160px] pointer-events-none" />

      {/* Frosted Glass Login Card */}
      <div className="relative z-10 max-w-md w-full backdrop-blur-2xl bg-white/[0.03] border border-white/10 p-8 sm:p-10 rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.9)]">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-white text-black font-extrabold text-xl shadow-[0_0_25px_rgba(255,255,255,0.3)] mb-4">
            LS
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">LOOP STREAM</h1>
          <p className="text-xs text-zinc-400 mt-1">by CMAISNAM • Sign in to control your live streams</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5 uppercase tracking-wider">
              Username
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              className="w-full px-3.5 py-2.5 bg-white/[0.04] backdrop-blur-md border border-white/10 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-white focus:bg-white/[0.07] focus:ring-1 focus:ring-white/40 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5 uppercase tracking-wider">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 bg-white/[0.04] backdrop-blur-md border border-white/10 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-white focus:bg-white/[0.07] focus:ring-1 focus:ring-white/40 transition-all"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 bg-white text-black font-semibold text-sm rounded-lg hover:bg-neutral-200 transition-all shadow-[0_0_25px_rgba(255,255,255,0.2)] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-black" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Signing In...</span>
                </>
              ) : (
                <span>Sign In</span>
              )}
            </button>
          </div>
        </form>

        <div className="mt-8 pt-6 border-t border-white/10 text-center text-xs text-zinc-500">
          Professional Multi-Platform 24/7 Broadcaster
        </div>
      </div>
    </div>
  );
}