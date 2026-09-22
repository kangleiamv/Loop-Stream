module.exports = {
  apps: [{
    name: 'qc-live',
    script: 'node_modules/next/dist/bin/next',
    args: 'start',
    cwd: '/home/ubuntu/loopstream/QC-Live',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      SESSION_SECRET: '55d567de3f13cb74735beed8e000969b32c75776b1feb1924b4727b53805d268',
      ADMIN_USERNAME: 'admin',
      ADMIN_PASSWORD_HASH: '$2a$10$bnBPpvGuYqqJ1bezIh1the1T87myl/lh0nNIrDNvWF.D02QsoVc46',
      AUTH_USERNAME: 'admin',
      AUTH_PASSWORD: '$2a$10$bnBPpvGuYqqJ1bezIh1the1T87myl/lh0nNIrDNvWF.D02QsoVc46',
      DATABASE_PATH: './data/streams.db',
      UPLOAD_DIR: './public/uploads',
      MAX_FILE_SIZE: '2147483648'
    },
    max_memory_restart: '1G',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  },
  {
    name: 'loopstream-rtmp',
    script: 'scripts/rtmp-service.js',
    cwd: '/home/ubuntu/loopstream/QC-Live',
    env: {
      NODE_ENV: 'production',
      RTMP_PORT: 1935,
      HTTP_PORT: 8000,
      NEXT_API_BASE: 'http://127.0.0.1:3000'
    },
    max_memory_restart: '500M',
    error_file: './logs/rtmp-err.log',
    out_file: './logs/rtmp-out.log',
    log_file: './logs/rtmp-combined.log',
    time: true
  },
  {
    name: 'loopstream-watchdog',
    script: 'scripts/watchdog-service.js',
    cwd: '/home/ubuntu/loopstream/QC-Live',
    env: {
      NODE_ENV: 'production',
      NEXT_API_BASE: 'http://127.0.0.1:3000',
      DATABASE_PATH: './data/streams.db',
      LOOPSTREAM_INTERNAL_KEY: 'loopstream-internal-mcp-key'
    },
    max_memory_restart: '300M',
    error_file: './logs/watchdog-err.log',
    out_file: './logs/watchdog-out.log',
    log_file: './logs/watchdog-combined.log',
    time: true
  }]
};
