import express from 'express';
import cors from 'cors';
import { readdirSync, statSync, readFileSync } from 'fs';
import { join, extname } from 'path';
import { networkInterfaces } from 'os';
import { fileURLToPath } from 'url';

const __dirname = join(fileURLToPath(import.meta.url), '..');
const SERVER_DIR = join(__dirname, '..', 'server');

// ============================================================
// 3 dedicated media subdirectories
// ============================================================
const IMAGES_DIR = join(SERVER_DIR, 'background_images');
const VIDEOS_DIR = join(SERVER_DIR, 'background_videos');
const MUSIC_DIR  = join(SERVER_DIR, 'background_music');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json({ limit: '1mb' }));

// ============================================================
// Auto-scan media files in 3 dedicated subdirectories
// Each directory uses its own strict extension filter
// ============================================================

// Accepted image formats
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
// Accepted audio formats
const AUDIO_EXT = new Set(['.mp3', '.wav', '.m4a', '.ogg']);
// Accepted video formats (wallpaper backgrounds)
const VIDEO_EXT = new Set(['.mp4']);

function scanDir(dirPath, validExts) {
  const files = [];
  try {
    const entries = readdirSync(dirPath);
    for (const entry of entries) {
      const entryPath = join(dirPath, entry);
      try {
        if (statSync(entryPath).isFile()) {
          const ext = extname(entry).toLowerCase();
          if (validExts.has(ext)) {
            files.push(entry);
          }
        }
      } catch {
        // Skip entries that can't be stat'ed
      }
    }
  } catch {
    // Directory doesn't exist yet — silently ignore
  }
  return files.sort();
}

function scanMedia() {
  return {
    images: scanDir(IMAGES_DIR, IMAGE_EXT),
    audio:  scanDir(MUSIC_DIR,  AUDIO_EXT),
    video:  scanDir(VIDEOS_DIR, VIDEO_EXT)
  };
}

// Periodic rescan — every 10 seconds (useful while developing)
let cachedMedia = scanMedia();
setInterval(() => { cachedMedia = scanMedia(); }, 10_000);

// ============================================================
// Settings API — read setting.json from server/
// ============================================================

let cachedSettings = null;
let settingsCacheTime = 0;
const SETTINGS_CACHE_TTL = 5000; // 5 seconds

function loadSettings() {
  const now = Date.now();
  if (cachedSettings && (now - settingsCacheTime) < SETTINGS_CACHE_TTL) {
    return cachedSettings;
  }
  try {
    const raw = readFileSync(join(SERVER_DIR, 'setting.json'), 'utf-8');
    cachedSettings = JSON.parse(raw);
    settingsCacheTime = now;
  } catch {
    cachedSettings = { slogan: 'Khám phá vẻ đẹp của điện ảnh' };
  }
  return cachedSettings;
}

app.get('/api/setting', (_req, res) => {
  res.json(loadSettings());
});

// Legacy lyrics data
const lyricsData = {
  lines: [
    {
      id: "L1",
      start_time: 0,
      end_time: 4,
      words: [
        { word: "Ánh", start_time: 0, end_time: 0.8, tags: ["fadeIn"] },
        { word: "sáng", start_time: 0.8, end_time: 1.6, tags: ["glow"] },
        { word: "neon", start_time: 1.6, end_time: 2.5, tags: ["electric"] },
        { word: "trong", start_time: 2.5, end_time: 3.2, tags: ["fadeIn"] },
        { word: "đêm", start_time: 3.2, end_time: 4.0, tags: ["glow"] }
      ]
    }
  ]
};

app.get('/api/lyrics', (_req, res) => {
  res.json(lyricsData);
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ============================================================
// Media API endpoints — separate routes for each type
// ============================================================

// Legacy combined endpoint (backward compatible)
app.get('/api/media', (_req, res) => {
  try {
    res.json(cachedMedia);
  } catch (err) {
    res.status(500).json({ error: 'Failed to scan media directory' });
  }
});

// Dedicated endpoints for each media type
app.get('/api/images', (_req, res) => {
  res.json({ images: cachedMedia.images });
});

app.get('/api/videos', (_req, res) => {
  res.json({ videos: cachedMedia.video });
});

app.get('/api/music', (_req, res) => {
  res.json({ music: cachedMedia.audio });
});

// ============================================================
// Serve static files from the 3 media subdirectories
// Each is mounted under /server/<subdir>/ so frontend can
// reference files by type, e.g. /server/background_images/photo.jpg
// ============================================================

app.use('/server/background_images', express.static(IMAGES_DIR, {
  maxAge: '1h',
  setHeaders: (res, filePath) => {
    const ext = extname(filePath).toLowerCase();
    if (IMAGE_EXT.has(ext)) {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  }
}));

app.use('/server/background_videos', express.static(VIDEOS_DIR, {
  maxAge: '1h',
  setHeaders: (res, filePath) => {
    const ext = extname(filePath).toLowerCase();
    if (VIDEO_EXT.has(ext)) {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  }
}));

app.use('/server/background_music', express.static(MUSIC_DIR, {
  maxAge: '1h',
  setHeaders: (res, filePath) => {
    const ext = extname(filePath).toLowerCase();
    if (AUDIO_EXT.has(ext)) {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  }
}));

// ============================================================
// Serve built frontend (from Vite build)
// ============================================================

const DIST_DIR = join(__dirname, '..', 'dist');

app.get('/', (_req, res) => {
  const indexPath = join(DIST_DIR, 'index.html');
  try {
    if (statSync(indexPath).isFile()) {
      return res.sendFile(indexPath);
    }
  } catch {}

  // No build yet — show helpful dev status page
  res.send(`
    <!DOCTYPE html>
    <html lang="vi">
    <head><meta charset="UTF-8"><title>Cinematic Experience — Server</title>
    <style>
      body{margin:0;font-family:system-ui,sans-serif;background:#0a0a0f;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}
      .card{padding:3rem 2rem;max-width:520px}
      h1{font-size:2rem;font-weight:800;background:linear-gradient(135deg,#ff6ec7,#7b68ee,#00d4ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
      .sub{color:rgba(255,255,255,0.4);margin-top:0.5rem;font-size:0.9rem}
      .status{display:inline-block;margin-top:1.5rem;padding:0.4rem 1.2rem;border-radius:40px;background:rgba(107,255,180,0.1);border:1px solid rgba(107,255,180,0.2);color:#6bffb4;font-size:0.8rem}
      .links{display:flex;gap:1.2rem;justify-content:center;margin-top:2rem;flex-wrap:wrap}
      .links a{color:#7b68ee;text-decoration:none;font-size:0.8rem;padding:0.3rem 0.8rem;border:1px solid rgba(123,104,238,0.2);border-radius:20px;transition:all 0.3s}
      .links a:hover{border-color:#7b68ee;background:rgba(123,104,238,0.1)}
      .hint{color:rgba(255,255,255,0.2);font-size:0.75rem;margin-top:2.5rem}
      .hint code{background:rgba(255,255,255,0.06);padding:0.2rem 0.5rem;border-radius:4px}
    </style>
    </head><body>
      <div class="card">
        <h1>🎬 Lyric Cinematic</h1>
        <p class="sub">Cinematic Background Experience</p>
        <div class="status">✓ Server API đang chạy — cổng ${PORT}</div>
        <div class="links">
          <a href="/api/health">/api/health</a>
          <a href="/api/media">/api/media</a>
          <a href="/api/lyrics">/api/lyrics</a>
        </div>
        <p class="hint">
          Frontend dev server: <a href="http://localhost:5173" style="color:#7b68ee">http://localhost:5173</a><br><br>
          Chạy <code>npm run build</code> để build frontend,<br>
          hoặc dùng <code>npm run dev</code> để chạy cả server + Vite
        </p>
      </div>
    </body></html>
  `);
});

// Serve built frontend static assets (CSS, JS, etc.)
// Must be AFTER API routes to avoid conflicts
app.use(express.static(DIST_DIR, {
  maxAge: process.env.NODE_ENV === 'production' ? '1y' : '0',
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// SPA fallback — for any unmatched GET request, serve index.html
// This ensures the frontend app is always served, even for deep links
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
  const indexPath = join(DIST_DIR, 'index.html');
  try {
    if (statSync(indexPath).isFile()) {
      return res.sendFile(indexPath);
    }
  } catch {}
  next();
});

// 404 handler (only for unmatched API routes)
app.use((_req, res) => {
  // If the request likely expected an API response, return JSON
  if (_req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  // For everything else, try to serve the status/dev page
  res.status(404).send(`
    <!DOCTYPE html>
    <html lang="vi">
    <head><meta charset="UTF-8"><title>Cinematic Experience</title>
    <style>
      body{margin:0;font-family:system-ui,sans-serif;background:#0a0a0f;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}
      .card{padding:2rem;max-width:480px}
      h1{font-size:1.8rem;font-weight:800;background:linear-gradient(135deg,#ff6ec7,#7b68ee,#00d4ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
      .sub{color:rgba(255,255,255,0.4);margin-top:0.5rem;font-size:0.85rem}
      .hint{color:rgba(255,255,255,0.2);font-size:0.75rem;margin-top:2rem}
      .hint code{background:rgba(255,255,255,0.06);padding:0.2rem 0.5rem;border-radius:4px}
      .btn{display:inline-block;margin-top:1.5rem;padding:0.5rem 1.5rem;border-radius:40px;background:rgba(123,104,238,0.15);border:1px solid rgba(123,104,238,0.3);color:#7b68ee;text-decoration:none;font-size:0.85rem}
    </style>
    </head><body>
      <div class="card">
        <h1>🎬 Cinematic Experience</h1>
        <p class="sub">Chạy <code>npm run build</code> để build frontend,<br>sau đó truy cập lại trang chủ.</p>
        <a class="btn" href="/">Về trang chủ</a>
        <p class="hint">Server API đang chạy tại cổng ${PORT}</p>
      </div>
    </body></html>
  `);
});

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('[Error]', err.message || err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message || 'Internal server error'
  });
});

function getLocalIP() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Skip internal/loopback and non-IPv4
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return null;
}

const server = app.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  const localUrl = localIP ? `http://${localIP}:${PORT}` : `http://localhost:${PORT}`;
  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║     🎬 LYRIC CINEMATIC EXPERIENCE       ║`);
  console.log(`╠══════════════════════════════════════════╣`);
  console.log(`║  Local:    http://localhost:${PORT}`);
  if (localIP) {
    console.log(`║  Network:  http://${localIP}:${PORT}`);
  }
  console.log(`╚══════════════════════════════════════════╝`);
  if (localIP) {
    console.log(`\n📱 Mở trình duyệt trên điện thoại (cùng mạng Wi-Fi)`);
    console.log(`   và gõ địa chỉ: ${localUrl}\n`);
  }
});

// Graceful shutdown
const shutdown = (signal, exitCode = 0) => {
  console.log(`\n${signal} received — shutting down gracefully...`);
  server.close(() => {
    console.log('✓ Server closed');
    process.exit(exitCode);
  });
  setTimeout(() => {
    console.error('✗ Forced shutdown after timeout');
    process.exit(1);
  }, 5000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]', err);
  shutdown('uncaughtException', 1);
});