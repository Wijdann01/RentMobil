import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { bookingApiDevPlugin } from './api/vite-dev.js'

const serverEnvironmentKeys = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TURNSTILE_SECRET_KEY',
  'RATE_LIMIT_HASH_SECRET',
  'ALLOWED_ORIGINS',
]

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), '')
  for (const key of serverEnvironmentKeys) {
    if (!process.env[key] && environment[key]) process.env[key] = environment[key]
  }

  return {
    plugins: [vue(), tailwindcss(), bookingApiDevPlugin()],
  }
})
