/* Super ERP — Android app build. The ERP website's own print code (frontend/src/pages/beta/*Print*) is reused so the
 * PDFs are the same as on the desktop; its print preview (printKit) is swapped for a phone viewer (src/printShim.js). */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  base: './',
  plugins: [react({ include: /\.(jsx|js)$/ })],
  resolve: {
    alias: [{ find: /^\.\/printKit$/, replacement: path.resolve(__dirname, 'src/printShim.js') }],
    dedupe: ['react', 'react-dom', 'axios', 'react-router-dom', 'qrcode'],
  },
  esbuild: { loader: 'jsx', include: /.*\.jsx?$/, exclude: [] },
  optimizeDeps: { esbuildOptions: { loader: { '.js': 'jsx' } } },
  define: { 'process.env': {} },
  server: { fs: { allow: ['..'] } },
  build: { outDir: 'dist', chunkSizeWarningLimit: 4000 },
});
