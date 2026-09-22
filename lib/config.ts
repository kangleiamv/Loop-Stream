// Hardcoded configuration as fallback when env vars don't load
export const config = {
  auth: {
    username: process.env.ADMIN_USERNAME || process.env.AUTH_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD_HASH || process.env.AUTH_PASSWORD || '$2a$10$bnBPpvGuYqqJ1bezIh1the1T87myl/lh0nNIrDNvWF.D02QsoVc46',
  },
  session: {
    secret: process.env.SESSION_SECRET || 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
  },
  storage: {
    uploadDir: process.env.UPLOAD_DIR || './public/uploads',
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '2147483648'),
  },
  database: {
    path: process.env.DATABASE_PATH || './data/streams.db',
  },
  app: {
    name: process.env.NEXT_PUBLIC_APP_NAME || 'Personal Streaming App',
    port: parseInt(process.env.PORT || '3000'),
  },
};