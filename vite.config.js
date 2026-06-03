import { defineConfig } from 'vite';

export default defineConfig({
  // Base path: './' for relative paths — works perfectly on Cloudflare Pages
  // and any subdirectory deployment
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      },
      '/server': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Do not inline assets as base64 — keep them as separate files
    // This prevents large media files from bloating the JS bundle
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        // Organize output by type for clean dist structure
        assetFileNames: (assetInfo) => {
          const name = assetInfo.name || '';
          // Media files — keep in assets/ subfolder
          if (/\.(mp3|wav|m4a|ogg|mp4|webm|jpg|jpeg|png|webp|gif|svg|ico)$/i.test(name)) {
            return 'assets/media/[name]-[hash][extname]';
          }
          // CSS files
          if (/\.css$/i.test(name)) {
            return 'assets/[name]-[hash][extname]';
          }
          // All other assets (fonts, etc.)
          return 'assets/[name]-[hash][extname]';
        },
        // JavaScript chunk naming
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js'
      }
    }
  }
});
