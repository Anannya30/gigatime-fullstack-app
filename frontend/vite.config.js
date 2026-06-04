import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // When the Django backend is wired up, proxy /api to it during dev:
    // proxy: { '/api': { target: 'http://localhost:8000', changeOrigin: true } },
  },
})
