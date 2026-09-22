export type PlatformId = 
  | 'youtube' 
  | 'twitch' 
  | 'facebook' 
  | 'kick' 
  | 'instagram' 
  | 'tiktok' 
  | 'twitter' 
  | 'custom';

export interface PlatformConfig {
  id: PlatformId;
  name: string;
  badgeBg: string;
  badgeText: string;
  defaultServer: string;
  backupServer?: string;
  keyPlaceholder: string;
  guide: string;
  formatUrl: (server: string, key: string) => string;
}

export const PLATFORMS: Record<PlatformId, PlatformConfig> = {
  youtube: {
    id: 'youtube',
    name: 'YouTube Live',
    badgeBg: 'bg-white/[0.05] border-white/15 text-white backdrop-blur-xs',
    badgeText: 'YouTube',
    defaultServer: 'rtmp://a.rtmp.youtube.com/live2',
    backupServer: 'rtmp://b.rtmp.youtube.com/live2?backup=1',
    keyPlaceholder: 'xxxx-xxxx-xxxx-xxxx',
    guide: 'YouTube Studio → Go Live → Stream Key',
    formatUrl: (server, key) => `${server.replace(/\/+$/, '')}/${key.trim()}`,
  },
  twitch: {
    id: 'twitch',
    name: 'Twitch',
    badgeBg: 'bg-white/[0.05] border-white/15 text-white backdrop-blur-xs',
    badgeText: 'Twitch',
    defaultServer: 'rtmp://live.twitch.tv/app',
    keyPlaceholder: 'live_xxxxxxxx_xxxxxxxxxxxx',
    guide: 'Twitch Dashboard → Settings → Stream → Primary Stream Key',
    formatUrl: (server, key) => `${server.replace(/\/+$/, '')}/${key.trim()}`,
  },
  facebook: {
    id: 'facebook',
    name: 'Facebook Live',
    badgeBg: 'bg-white/[0.05] border-white/15 text-white backdrop-blur-xs',
    badgeText: 'Facebook',
    defaultServer: 'rtmps://live-api-s.facebook.com:443/rtmp/',
    keyPlaceholder: 'FB-xxxxxxxxxxxx',
    guide: 'Facebook Live Producer → Stream Setup → Stream Key',
    formatUrl: (server, key) => {
      const s = server.endsWith('/') ? server : `${server}/`;
      return `${s}${key.trim()}`;
    },
  },
  kick: {
    id: 'kick',
    name: 'Kick',
    badgeBg: 'bg-white/[0.05] border-white/15 text-white backdrop-blur-xs',
    badgeText: 'Kick',
    defaultServer: 'rtmps://fa723fc1b171.global-contribute.live-video.net/app/',
    keyPlaceholder: 'sk_us-west-2_xxxxxxxx',
    guide: 'Kick Creator Dashboard → Settings → Stream URL & Key',
    formatUrl: (server, key) => {
      const s = server.endsWith('/') ? server : `${server}/`;
      return `${s}${key.trim()}`;
    },
  },
  instagram: {
    id: 'instagram',
    name: 'Instagram Live',
    badgeBg: 'bg-white/[0.05] border-white/15 text-white backdrop-blur-xs',
    badgeText: 'Instagram',
    defaultServer: 'rtmps://live-upload.instagram.com:443/rtmp/',
    keyPlaceholder: '179xxxxxxxx?s_bl=1&s_ps=1...',
    guide: 'Instagram Live Producer (or YellowDuck / Streamon)',
    formatUrl: (server, key) => {
      const s = server.endsWith('/') ? server : `${server}/`;
      return `${s}${key.trim()}`;
    },
  },
  tiktok: {
    id: 'tiktok',
    name: 'TikTok Live',
    badgeBg: 'bg-white/[0.05] border-white/15 text-white backdrop-blur-xs',
    badgeText: 'TikTok',
    defaultServer: 'rtmp://push-rtmp-l1.tiktokcdn.com/live',
    keyPlaceholder: 'stream-xxxxxxxx',
    guide: 'TikTok Live Studio / Creator Center → Stream Key',
    formatUrl: (server, key) => `${server.replace(/\/+$/, '')}/${key.trim()}`,
  },
  twitter: {
    id: 'twitter',
    name: 'X (Twitter)',
    badgeBg: 'bg-white/[0.05] border-white/15 text-white backdrop-blur-xs',
    badgeText: 'X / Twitter',
    defaultServer: 'rtmp://va.pscp.tv:80/x/',
    keyPlaceholder: 'xxxxxxxx',
    guide: 'X Media Studio → Broadcasts → Create Broadcast',
    formatUrl: (server, key) => {
      const s = server.endsWith('/') ? server : `${server}/`;
      return `${s}${key.trim()}`;
    },
  },
  custom: {
    id: 'custom',
    name: 'Custom RTMP',
    badgeBg: 'bg-white/[0.05] border-white/15 text-white backdrop-blur-xs',
    badgeText: 'Custom RTMP',
    defaultServer: '',
    keyPlaceholder: '',
    guide: 'Enter direct RTMP / RTMPS URL with stream key',
    formatUrl: (server) => server.trim(),
  },
};

export function detectPlatform(url: string): PlatformId {
  const lower = url.toLowerCase();
  if (lower.includes('youtube.com')) return 'youtube';
  if (lower.includes('twitch.tv')) return 'twitch';
  if (lower.includes('facebook.com') || lower.includes('fb.com')) return 'facebook';
  if (lower.includes('kick.com') || lower.includes('global-contribute.live-video.net')) return 'kick';
  if (lower.includes('instagram.com')) return 'instagram';
  if (lower.includes('tiktokcdn.com') || lower.includes('tiktok.com')) return 'tiktok';
  if (lower.includes('pscp.tv') || lower.includes('twitter.com') || lower.includes('periscope')) return 'twitter';
  return 'custom';
}

export function parseStreamUrls(rtmpUrlString: string): string[] {
  if (!rtmpUrlString) return [];
  return rtmpUrlString
    .split(/[\n,;|]+/)
    .map((u) => u.trim())
    .filter(Boolean);
}

export function maskStreamUrl(url: string): string {
  try {
    const parts = url.split('/');
    if (parts.length <= 3) return url;
    const key = parts[parts.length - 1];
    if (key.length <= 6) return url;
    const maskedKey = `${key.slice(0, 4)}...${key.slice(-3)}`;
    parts[parts.length - 1] = maskedKey;
    return parts.join('/');
  } catch {
    return url;
  }
}
