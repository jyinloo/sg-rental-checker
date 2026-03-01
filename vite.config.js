import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // Allow REACT_APP_ prefixed env vars (Vite only exposes VITE_ by default)
  envPrefix: ['VITE_', 'REACT_APP_'],

  server: {
    proxy: {
      // Proxy URA API calls to avoid CORS restrictions in the browser.
      // In production you'd route these through your own backend / serverless function.
      '/ura-api': {
        target: 'https://eservice.ura.gov.sg',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/ura-api/, ''),
      },
    },
  },
})
