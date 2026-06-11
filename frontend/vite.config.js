import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy API + WebSocket traffic to the Dockerized Django backend (NGINX on :80).
    proxy: {
      '/api': 'http://localhost',
      '/ws': { target: 'ws://localhost', ws: true },
    },
  },
})
