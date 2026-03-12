import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// For GitHub Pages: set base to your repo name
// e.g., if deploying to https://username.github.io/old-toronto/
// change '/old-toronto/' to match your repo name
export default defineConfig({
  plugins: [react()],
  base: '/old-toronto/',
})
