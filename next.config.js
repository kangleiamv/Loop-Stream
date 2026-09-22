/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(process.env.BUILD_STANDALONE === 'true' ? { output: 'standalone' } : {}),
  poweredByHeader: false,
  compress: true,
  images: {
    unoptimized: true,
  },
  experimental: {
    serverComponentsExternalPackages: ['sqlite3', 'fluent-ffmpeg'],
  },
  async rewrites() {
    return [
      {
        source: '/uploads/:path*',
        destination: '/api/serve-video/:path*',
      },
    ];
  },
}

module.exports = nextConfig