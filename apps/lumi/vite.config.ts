import { defineConfig } from 'vite';
// Builds straight into the site's /demo/ folder. Relative base so it works under
// https://<user>.github.io/<repo>/demo/ and when the folder is opened locally.
export default defineConfig({
  base: './',
  build: {
    outDir: '../../demo',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    modulePreload: false,
    chunkSizeWarningLimit: 1000,
    rollupOptions: { output: { codeSplitting: false, entryFileNames: 'assets/app.js', assetFileNames: 'assets/[name][extname]' } },
  },
});
