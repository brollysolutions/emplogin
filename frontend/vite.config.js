import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
//
// Two build targets share this config:
//   vite build                -> the web app, served under https://host/login/
//   vite build --mode app     -> the Capacitor Android bundle (npm run build:app)
//
// The app build differs in two ways. Assets must be referenced relatively,
// because the WebView serves them from the APK rather than from /login/; and
// the API base must be absolute, since there is no same-origin server to fall
// back on (see .env.app).
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // base: '/test_login/', // TEST
  base: mode === 'app' ? './' : '/login/',   // APP : PRODUCTION
}))
