/**
 * ============================================================
 * Build Script — Cloudflare Pages Deployment
 *
 * This script runs after `vite build` to:
 * 1. Scan media directories (background_images, background_music, background_videos)
 * 2. Generate API JSON files into dist/api/
 * 3. Copy media files into dist/server/ for Cloudflare Pages serving
 * 4. Copy server/setting.json into dist/api/
 * ============================================================
 */

import { readdirSync, statSync, copyFileSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { join, extname, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SERVER_DIR = join(ROOT, 'server');
const DIST_DIR = join(ROOT, 'dist');

// ============================================================
// 1. Configuration — Accepted file extensions
// ============================================================
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const AUDIO_EXT = new Set(['.mp3', '.wav', '.m4a', '.ogg']);
const VIDEO_EXT = new Set(['.mp4']);

// ============================================================
// 2. Helper: Scan directory for files with valid extensions
// ============================================================
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
        // Skip files that can't be stat'ed
      }
    }
  } catch {
    // Directory doesn't exist — silently ignore
    console.warn(`⚠ Directory not found: ${dirPath}`);
  }
  return files.sort();
}

// ============================================================
// 3. Helper: Copy entire directory recursively
// ============================================================
function copyDir(srcDir, destDir) {
  try {
    const entries = readdirSync(srcDir);
    mkdirSync(destDir, { recursive: true });

    for (const entry of entries) {
      // Skip hidden files (starts with dot)
      if (entry.startsWith('.')) continue;
      const srcPath = join(srcDir, entry);
      const destPath = join(destDir, entry);
      try {
        if (statSync(srcPath).isFile()) {
          copyFileSync(srcPath, destPath);
          console.log(`  ✓ Copied: ${entry}`);
        }
      } catch (err) {
        console.warn(`  ✗ Failed to copy: ${entry} — ${err.message}`);
      }
    }
  } catch (err) {
    console.warn(`⚠ Could not copy directory ${srcDir}: ${err.message}`);
  }
}

// ============================================================
// 4. Helper: Write JSON file to dist/api/
// ============================================================
function writeApiJSON(filename, data) {
  const apiDir = join(DIST_DIR, 'api');
  mkdirSync(apiDir, { recursive: true });
  writeFileSync(join(apiDir, filename), JSON.stringify(data, null, 2), 'utf-8');
  console.log(`  ✓ Generated: api/${filename}`);
}

// ============================================================
// 5. MAIN — Run build steps
// ============================================================
console.log('\n╔══════════════════════════════════════════╗');
console.log('║     BUILD MEDIA — Cloudflare Pages       ║');
console.log('╚══════════════════════════════════════════╝\n');

// Step 1: Scan media directories
console.log('📂 Scanning media directories...');
const images = scanDir(join(SERVER_DIR, 'background_images'), IMAGE_EXT);
const music  = scanDir(join(SERVER_DIR, 'background_music'), AUDIO_EXT);
const video  = scanDir(join(SERVER_DIR, 'background_videos'), VIDEO_EXT);

console.log(`  Images: ${images.length} files`);
console.log(`  Music:  ${music.length} files`);
console.log(`  Videos: ${video.length} files`);

// Step 2: Generate API JSON files
console.log('\n📝 Generating API data...');
writeApiJSON('images.json', { images });
writeApiJSON('music.json', { music });
writeApiJSON('videos.json', { videos: video });
writeApiJSON('media.json', { images, audio: music, video });

// Step 3: Copy server/setting.json
console.log('\n📋 Copying settings...');
const settingSrc = join(SERVER_DIR, 'setting.json');
const settingDest = join(DIST_DIR, 'api', 'setting.json');
if (existsSync(settingSrc)) {
  mkdirSync(join(DIST_DIR, 'api'), { recursive: true });
  copyFileSync(settingSrc, settingDest);
  console.log('  ✓ Copied: api/setting.json');
} else {
  // Write default settings
  writeApiJSON('setting.json', { slogan: 'Khám phá vẻ đẹp của điện ảnh' });
  console.log('  ⚠ setting.json not found — created default');
}

// Step 4: Generate lyrics data (hardcoded, same as server/index.js)
writeApiJSON('lyrics.json', {
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
});
console.log('  ✓ Generated: api/lyrics.json');

// Step 5: Generate health data
writeApiJSON('health.json', {
  status: 'ok',
  platform: 'cloudflare-pages',
  deployed_at: new Date().toISOString()
});
console.log('  ✓ Generated: api/health.json');

// Step 6: Copy media files to dist/server/
console.log('\n📦 Copying media files to dist/server/...');

const mediaDirs = [
  { name: 'background_images', src: join(SERVER_DIR, 'background_images') },
  { name: 'background_music', src: join(SERVER_DIR, 'background_music') },
  { name: 'background_videos', src: join(SERVER_DIR, 'background_videos') }
];

for (const dir of mediaDirs) {
  const dest = join(DIST_DIR, 'server', dir.name);
  console.log(`  Copying ${dir.name}/...`);
  copyDir(dir.src, dest);
}

console.log('\n✅ Build media complete!\n');
