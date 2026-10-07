import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiProxy = {
  '/api': {
    target: process.env.VITE_LOCAL_API_TARGET || 'http://localhost:4000',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api/, ''),
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: apiProxy,
  },
  preview: {
    port: 4173,
    proxy: apiProxy,
  },
});
