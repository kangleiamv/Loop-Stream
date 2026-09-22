# ⚡ LOOP STREAM by CMAISNAM

<div align="center">

![LOOP STREAM Banner](https://raw.githubusercontent.com/CMAISNAM/loopstream/main/public/images/banner.png)

### Professional 24/7 Multi-Destination Live Streaming Station & RTMP Ingest Relay Engine

[![License: MIT](https://img.shields.io/badge/License-MIT-white.svg?style=for-the-badge&logo=opensourceinitiative&logoColor=black)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-14-black.svg?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-black.svg?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![FFmpeg](https://img.shields.io/badge/FFmpeg-6.0+-black.svg?style=for-the-badge&logo=ffmpeg&logoColor=white)](https://ffmpeg.org/)
[![RTMP](https://img.shields.io/badge/RTMP-Port_1935-white.svg?style=for-the-badge&logo=livechat&logoColor=black)](#-rtmp-ingest-receiver)
[![Uptime](https://img.shields.io/badge/Broadcast-24%2F7_Continuous-white.svg?style=for-the-badge&logo=clock&logoColor=black)](#-features)

[Features](#-key-features) • [Architecture](#-architecture) • [Quick Start](#-quick-start) • [OBS Setup](#-obs-studio-setup) • [Production Deployment](#-production-deployment-with-pm2) • [License](#-license)

</div>

---

## 📖 Overview

**LOOP STREAM by CMAISNAM** is a high-performance, self-hosted streaming application designed for broadcasters, creators, and media enterprises. It enables **continuous 24/7 multi-platform live streaming** to YouTube, Twitch, Facebook Live, Kick, Instagram, TikTok, Twitter/X, and custom RTMP destinations simultaneously.

Engineered with a **Single-Encode Pipeline**, LOOP STREAM transcodes incoming media once and relays it to multiple destinations without duplicate CPU/GPU overhead. Built with zero-drop broadcast redundancy, you can **hot-swap videos on the fly** or receive incoming feeds from **OBS Studio / vMix with automated failover backup loops**.

---

## ✨ Key Features

- 🔄 **24/7 Continuous Non-Stop Looping**  
  Stream stored video files indefinitely in an endless loop with seamless PTS/DTS timeline synchronization and zero buffer pauses.
- ⚡ **Zero-Drop Hot-Swap Video Switching**  
  Switch the playing video in an active live broadcast in real time without stopping the stream or disconnecting viewers on YouTube/Twitch.
- 📡 **Built-in RTMP Ingest Receiver (Port 1935)**  
  Broadcast directly from OBS Studio, vMix, Prism Live, or mobile/hardware encoders straight into LOOP STREAM (`rtmp://<server-ip>:1935/live/<streamKey>`).
- 🛡️ **Automated Failover & Backup Loop Logic**  
  If your OBS Studio or live ingest connection drops, the station instantly switches the live broadcast to a designated backup loop video. Once OBS reconnects, it seamlessly hot-swaps right back to the live feed!
- 🌐 **Multi-Platform Simulcast (Single-Encode)**  
  Broadcast simultaneously to YouTube, Twitch, Facebook, Kick, Instagram, TikTok, X, and Custom RTMP targets from a single encode pass.
- 🎨 **Ultra-Modern Monochrome Glassmorphism UI**  
  High-contrast black & white design system featuring backdrop blur effects, responsive cards, interactive modals, and real-time status indicators.
- 📊 **Hardware & Broadcast Telemetry**  
  Real-time server CPU, RAM, disk utilization, active FFmpeg process counts, live output FPS, and network bitrate meters.
- 📁 **Complete Video Management**  
  Upload, organize, preview, and delete video assets with automated thumbnail generation and metadata detection.

---

## 🏗️ Architecture

```mermaid
flowchart TD
    subgraph Inputs["1. Broadcast Source Options"]
        A["📁 Stored Video Library (MP4/MKV)"]
        B["📡 OBS Studio / vMix Ingest (Port 1935)"]
        C["🌐 External Pull URL (RTMP/RTSP/HLS)"]
    end

    subgraph Core["2. LOOP STREAM Engine"]
        D["Node-Media-Server (RTMP Ingest Port 1935)"]
        E["Next.js Web Controller (Port 3000)"]
        F["FFmpeg 6.x Transcoding & Hot-Swap Pipeline"]
        G{"Auto-Failover Logic"}
        
        B --> D
        D -->|Webhook Trigger| E
        E -->|Hot-Swap Signal| F
        A --> F
        C --> F
        D -.->|Stream Drops| G
        G -.->|Switch to Backup Video| F
    end

    subgraph Outputs["3. Multi-Platform Simulcast Destinations"]
        O1["▶️ YouTube Live"]
        O2["👾 Twitch"]
        O3["📘 Facebook Live"]
        O4["🟩 Kick"]
        O5["📸 Instagram Live"]
        O6["🎵 TikTok Live"]
        O7["✖️ Twitter / X"]
        O8["🔗 Custom RTMP"]
        
        F --> O1
        F --> O2
        F --> O3
        F --> O4
        F --> O5
        F --> O6
        F --> O7
        F --> O8
    end
```

---

## 📋 System Requirements

| Resource | Minimum | Recommended (Multi-Stream) |
|---|---|---|
| **OS** | Linux (Ubuntu 20.04/22.04/24.04), Debian, macOS | Ubuntu 22.04 LTS (x86_64) |
| **CPU** | 2 Cores | 4+ Cores (for 1080p simulcast) |
| **RAM** | 2 GB | 4 GB - 8 GB |
| **Storage** | 20 GB SSD | 100+ GB SSD (for video storage) |
| **Bandwidth** | 5 Mbps upload | 25+ Mbps upload per concurrent stream |
| **Software** | Node.js 18.x+, FFmpeg 4.4+ | Node.js 18.x/20.x, FFmpeg 6.x |

---

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/CMAISNAM/loopstream.git
cd loopstream
```

### 2. Install System Dependencies (Ubuntu / Debian)

```bash
sudo apt update
sudo apt install -y nodejs npm ffmpeg build-essential python3
```

Verify installations:
```bash
node -v      # v18.x or higher
ffmpeg -version
```

### 3. Install NPM Packages

```bash
npm install
```

### 4. Configure Environment Variables

Create `.env.local` based on `.env.example`:

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
# Server Port
PORT=3000
NODE_ENV=production

# Security & Session
SESSION_SECRET=replace_with_a_long_random_secret_string_32_chars_min

# Admin Credentials
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=$2a$10$bnBPpvGuYqqJ1bezIh1the1T87myl/lh0nNIrDNvWF.D02QsoVc46 # Default: admin123

# Database & File Storage
DATABASE_PATH=./data/streams.db
UPLOAD_DIR=./public/uploads
MAX_FILE_SIZE=2147483648
```

> **Tip**: To generate a secure bcrypt password hash for your custom password, run:
> ```bash
> node -e "const bcrypt = require('bcryptjs'); console.log(bcrypt.hashSync('YourStrongPassword', 10));"
> ```

### 5. Initialize the SQLite Database

```bash
node scripts/setup-db.js
```

### 6. Build & Run

**Development Mode:**
```bash
npm run dev
```

**Production Build:**
```bash
npm run build
npm start
```

Access the dashboard at: `http://localhost:3000` (Default credentials: `admin` / `admin123`).

---

## 🛠️ Production Deployment with PM2

For robust 24/7 background operation with automatic restarts and log rotation, use the included PM2 configuration.

### 1. Install PM2 Globally

```bash
sudo npm install -g pm2
```

### 2. Create Log Directories

```bash
mkdir -p logs data public/uploads
```

### 3. Build Next.js

```bash
npm run build
```

### 4. Launch Services with PM2

The `ecosystem.config.js` manages both the **Web Application** and the **RTMP Ingest Receiver**:

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 5. Check Service Status

```bash
pm2 list
pm2 logs
```

Output:
```
┌────┬────────────────────┬──────────┬──────┬───────────┬──────────┬──────────┐
│ id │ name               │ mode     │ ↺    │ status    │ cpu      │ memory   │
├────┼────────────────────┼──────────┼──────┼───────────┼──────────┼──────────┤
│ 1  │ loopstream-rtmp    │ fork     │ 0    │ online    │ 0%       │ 62.0mb   │
│ 0  │ qc-live            │ fork     │ 0    │ online    │ 0%       │ 98.0mb   │
└────┴────────────────────┴──────────┴──────┴───────────┴──────────┴──────────┘
```

---

## 📡 OBS Studio Setup Guide

Broadcast directly from OBS Studio to LOOP STREAM and relay out to all platforms:

1. Open **OBS Studio** → **Settings** → **Stream**.
2. **Service**: Select `Custom...`
3. **Server**: `rtmp://<YOUR_SERVER_IP>:1935/live`
4. **Stream Key**: Enter the Stream Key configured for your stream (e.g., `obs_channel_1` or generate one in `/rtmp`).
5. **Video Settings in OBS**:
   - Resolution: `1920x1080` or `1280x720`
   - Output Mode: `Advanced`
   - Rate Control: `CBR`
   - Bitrate: `3500 - 6000 Kbps`
   - Keyframe Interval: `2 seconds` (Recommended for YouTube/Twitch)
   - Profile: `high`
   - Tune: `zerolatency`
6. Click **Start Streaming** in OBS Studio.

> ⚡ **Zero-Drop Failover**: When OBS disconnects, LOOP STREAM automatically switches the broadcast to your configured fallback video without dropping the live stream on YouTube or Twitch!

---

## 🌐 Nginx Reverse Proxy & SSL Configuration

To access the panel over HTTPS with a custom domain, configure Nginx:

```nginx
# /etc/nginx/sites-available/loopstream
server {
    listen 80;
    server_name stream.yourdomain.com;

    # Redirect HTTP to HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name stream.yourdomain.com;

    # SSL Certificates (managed by Certbot)
    ssl_certificate /etc/letsencrypt/live/stream.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/stream.yourdomain.com/privkey.pem;

    # Client upload limit for large video files
    client_max_body_size 2G;

    # Next.js Web Panel
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # HTTP-FLV Live Preview Stream
    location /live {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_buffering off;
    }
}
```

Enable site & get SSL certificate:
```bash
sudo ln -s /etc/nginx/sites-available/loopstream /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d stream.yourdomain.com
```

### Firewall Setup (UFW)

```bash
sudo ufw allow 80/tcp     # HTTP
sudo ufw allow 443/tcp    # HTTPS
sudo ufw allow 1935/tcp   # RTMP Ingest (OBS / vMix)
sudo ufw allow 8000/tcp   # HTTP-FLV Preview (optional)
sudo ufw enable
```

---

## 🎯 Multi-Platform Destination Guide

Enter one or more RTMP destination URLs separated by newlines in the **Destinations** field:

### 1. YouTube Live
* **RTMP URL**: `rtmp://a.rtmp.youtube.com/live2/<STREAM_KEY>`
* **Backup URL**: `rtmp://b.rtmp.youtube.com/live2?backup=1/<STREAM_KEY>`

### 2. Twitch
* **RTMP URL**: `rtmp://live.twitch.tv/app/<STREAM_KEY>`

### 3. Facebook Live
* **RTMP URL**: `rtmps://live-api-s.facebook.com:443/rtmp/<STREAM_KEY>`

### 4. Kick
* **RTMP URL**: `rtmps://fa723fc1b171.global-contribute.live-video.net/app/<STREAM_KEY>`

### 5. Instagram Live / TikTok Live
* Use your stream key provider (YellowDuck, Streamlabs, etc.):
* **RTMP URL**: `rtmps://live-upload.instagram.com:443/rtmp/<STREAM_KEY>`

---

## ⚡ Zero-Drop Hot-Swap Video Switching

Need to change the playing video during a 24/7 stream without terminating the broadcast?

1. Navigate to **Streams** in the navigation bar.
2. On any running stream card, click **⚡ Switch Video**.
3. Select a new video from your library.
4. Click **Apply Switch Now**.
5. The station automatically swaps the video input buffer in real-time. Viewers on YouTube and Twitch experience zero buffering and no stream termination!

---

## 📁 Project Structure

```
QC-Live/
├── components/           # UI Components (Monochrome Glassmorphism)
│   ├── EditStreamModal.tsx
│   ├── Layout.tsx
│   ├── PlatformIcon.tsx
│   ├── StreamCard.tsx
│   ├── StreamForm.tsx
│   ├── SwitchVideoModal.tsx
│   ├── VideoLibrary.tsx
│   ├── VideoPreview.tsx
│   └── VideoUpload.tsx
├── lib/                  # Core Business Logic
│   ├── auth.ts           # Authentication & session token verification
│   ├── database.ts       # SQLite3 database connection & schema
│   ├── ffmpeg.ts         # Broadcast transcoding & zero-drop hot-swap engine
│   ├── platforms.ts      # Multi-platform simulcast presets & icons
│   └── streamState.ts    # In-memory stream lifecycle registry
├── pages/                # Next.js Pages & API Endpoints
│   ├── api/
│   │   ├── auth/         # Login, logout, session verification
│   │   ├── rtmp/         # Webhooks, receiver status, key generator
│   │   ├── streams/      # Create, start, stop, switch-video, delete
│   │   ├── system/       # CPU, RAM, disk, and process telemetry
│   │   └── videos/       # Upload, list, delete, stream
│   ├── dashboard/        # Metrics, simulcast matrix, system health
│   ├── rtmp/             # RTMP Ingest console & OBS credentials
│   ├── streams/          # Stream management & multi-card monitor
│   └── videos/           # Media asset library & video uploader
├── public/               # Static assets & uploads directory
├── scripts/
│   ├── rtmp-service.js   # Standalone NodeMediaServer RTMP/HTTP-FLV daemon
│   └── setup-db.js       # SQLite database initialization
├── ecosystem.config.js   # Production PM2 multi-process configuration
└── styles/globals.css    # Tailwind CSS & glassmorphism theme tokens
```

---

## ❓ Frequently Asked Questions

<details>
<summary><b>Can I stream 24/7 without a GPU?</b></summary>
Yes! The FFmpeg pipeline uses the ultra-optimized <code>libx264</code> software encoder with custom tuning presets. A modern 2 to 4-core cloud VPS easily handles 720p or 1080p continuous 24/7 streaming.
</details>

<details>
<summary><b>What happens if my VPS reboots?</b></summary>
Because PM2 is configured with <code>pm2 save</code> and <code>pm2 startup</code>, both the Web Panel and RTMP Receiver will automatically launch on server boot. Streams with <code>Auto-Start</code> enabled will resume broadcasting automatically.
</details>

<details>
<summary><b>Does switching videos break YouTube monetization or viewer count?</b></summary>
No! Because the RTMP stream pipe to YouTube never drops, YouTube treats the switch as continuous live video. Chat, concurrent viewer counters, and live recording remain completely intact.
</details>

<details>
<summary><b>Can I broadcast to vertical platforms like TikTok and Instagram?</b></summary>
Yes! LOOP STREAM includes vertical resolution presets (720x1280 and 1080x1920) specifically designed for TikTok, Instagram Reels, and YouTube Shorts live formats.
</details>

---

## 🤝 Contributing

Contributions, bug reports, and feature suggestions are welcome!

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/NewFeature`)
3. Commit your changes (`git commit -m 'Add NewFeature'`)
4. Push to the branch (`git push origin feature/NewFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

---

## 👨‍💻 Author & Credits

Designed and engineered with ❤️ by **CMAISNAM**  
* GitHub: [@CMAISNAM](https://github.com/CMAISNAM)  
* Project: **LOOP STREAM by CMAISNAM**

---

<div align="center">
  <b>LOOP STREAM by CMAISNAM</b> • Continuous 24/7 Multi-Stream & Relay Station • © 2026 All Rights Reserved
</div>
