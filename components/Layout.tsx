import { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import axios from 'axios';
import toast from 'react-hot-toast';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await axios.post('/api/auth/logout');
      toast.success('Logged out successfully');
      router.push('/auth/login');
    } catch (error) {
      toast.error('Failed to logout');
    }
  };

  const navItems = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/streams', label: 'Streams' },
    { href: '/videos', label: 'Videos' },
    { href: '/rtmp', label: 'RTMP Ingest' },
  ];

  return (
    <div className="min-h-screen bg-black text-white flex flex-col relative selection:bg-white selection:text-black">
      {/* Ambient background blur elements for glassmorphism depth */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-white/[0.04] rounded-full blur-[140px]" />
        <div className="absolute top-1/3 -right-48 w-[450px] h-[450px] bg-white/[0.02] rounded-full blur-[160px]" />
        <div className="absolute -bottom-32 -left-32 w-[500px] h-[400px] bg-white/[0.02] rounded-full blur-[150px]" />
      </div>

      {/* Floating Frosted Glass Header */}
      <header className="sticky top-0 z-40 backdrop-blur-2xl bg-black/60 border-b border-white/10 shadow-[0_4px_30px_rgba(0,0,0,0.6)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Brand */}
            <div className="flex items-center gap-8">
              <Link href="/dashboard" className="flex items-center gap-2.5 group">
                <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-black font-extrabold text-sm shadow-[0_0_20px_rgba(255,255,255,0.3)] group-hover:scale-105 transition-transform">
                  LS
                </div>
                <div className="flex flex-col">
                  <span className="text-base font-bold tracking-wider text-white flex items-center gap-1.5">
                    LOOP STREAM
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  </span>
                  <span className="text-[10px] tracking-widest text-zinc-400 uppercase font-mono">
                    by CMAISNAM
                  </span>
                </div>
              </Link>

              {/* Navigation Tabs */}
              <nav className="hidden md:flex items-center gap-1 bg-white/[0.03] p-1 rounded-full border border-white/10 backdrop-blur-md">
                {navItems.map((item) => {
                  const isActive = router.pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-all duration-200 ${
                        isActive
                          ? 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.25)]'
                          : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* Header Right Actions */}
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.04] border border-white/10 backdrop-blur-md text-[11px] text-zinc-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                <span>Simulcast Engine</span>
              </div>

              <button
                onClick={handleLogout}
                className="px-3.5 py-1.5 text-xs font-medium text-zinc-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.1] border border-white/10 rounded-full transition-all backdrop-blur-md"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 relative z-10">{children}</main>

      {/* Frosted Glass Footer */}
      <footer className="relative z-10 backdrop-blur-xl bg-black/60 border-t border-white/10 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-xs">
            <div className="flex items-center gap-3 text-zinc-400">
              <span className="font-semibold text-white">LOOP STREAM by CMAISNAM</span>
              <span>•</span>
              <span>Continuous 24/7 Multi-Stream Station</span>
            </div>
            <div className="flex items-center gap-4 text-zinc-400">
              <span>© {new Date().getFullYear()} All rights reserved</span>
              <span>•</span>
              <a
                href="https://github.com/CMAISNAM"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-300 hover:text-white underline underline-offset-2 transition-colors"
              >
                CMAISNAM
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}