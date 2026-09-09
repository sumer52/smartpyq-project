import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Fail the production build when the backend origin is not configured.
    {
      name: 'require-backend-url',
      apply: 'build',
      configResolved() {
        // Vercel sets VERCEL=1 in its build environment; fail THERE when the
        // backend origin is missing. Local builds only warn.
        if (!process.env.VITE_BACKEND_URL) {
          const msg =
            '[smartpyq] VITE_BACKEND_URL is not set.\n' +
            'Set it to the Render origin (e.g. https://smartpyq-backend.onrender.com)\n' +
            'in Vercel → Settings → Environment Variables, then redeploy.';
          if (process.env.VERCEL) {
            throw new Error(msg);
          }
          console.warn(msg + '\n(local build continuing with localhost fallback)');
        }
      },
    },
  ],
  server: {
    port: 5173,
    open: true,
    host: true,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false, // production source maps disabled (no private error-monitoring upload)
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          router: ['react-router-dom'],
          motion: ['framer-motion']
        }
      }
    }
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', 'framer-motion']
  }
})