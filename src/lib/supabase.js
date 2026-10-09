import { createClient } from '@supabase/supabase-js'

const configuredUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const url = configuredUrl?.replace(/\/+$/, '').replace(/\/rest\/v1$/i, '')

if (Boolean(url) !== Boolean(anonKey)) {
  throw new Error('Konfigurasi Supabase belum lengkap. Isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY di file .env.')
}

export const isSupabaseConfigured = Boolean(url && anonKey && !url.includes('your-project'))
export const supabase = isSupabaseConfigured ? createClient(url, anonKey) : null
