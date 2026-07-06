import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Tell Vite's HMR client to connect directly to Vite (5173) rather than
    // the Wrangler proxy (8788). Without this, the browser sends a WebSocket
    // upgrade through Wrangler, which Miniflare's loopback can't handle.
    hmr: { port: 5173, clientPort: 5173, host: 'localhost' },
  },
})
