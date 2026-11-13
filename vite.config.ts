import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Lokal utviklingsproxy for Node 24 (uten SWA CLI): /api → managed functions på 7071.
    // AI-kall går direkte til 7072 via VITE_AI_API_BASE. Påvirker kun `npm run dev` — i prod
    // (SWA) er /api same-origin, og under `swa start` (Node 22) håndterer plattformen /api.
    proxy: {
      '/api': 'http://localhost:7071',
    },
  },
})
