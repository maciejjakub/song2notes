import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Backend route prefixes the dev server proxies to FastAPI. Keeping API calls
// same-origin (see API_BASE = '' in src/api.ts) means no CORS and no hardcoded
// host — so the app is reachable from other devices on the LAN (e.g. a phone).
const API_PREFIXES = ['/config', '/analyze', '/jobs', '/download', '/youtube']

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // listen on 0.0.0.0 so other devices on the Wi-Fi can reach it
    proxy: Object.fromEntries(
      API_PREFIXES.map((prefix) => [
        prefix,
        { target: 'http://127.0.0.1:8000', changeOrigin: true },
      ]),
    ),
  },
})
