import { createHmac } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const json = (res, status, body) => {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  return res.status(status).json(body)
}

function getClientIp(req) {
  const realIp = req.headers['x-real-ip']
  if (typeof realIp === 'string' && realIp.trim()) return realIp.trim()

  const forwardedFor = req.headers['x-forwarded-for']
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',').at(-1).trim()
  }

  return null
}

function hashRateLimitKey(secret, value) {
  return createHmac('sha256', secret).update(value).digest('hex')
}

export function normalizeSupabaseUrl(configuredUrl) {
  return configuredUrl.trim().replace(/\/+$/, '').replace(/\/rest\/v1$/i, '')
}

function validBooking(body) {
  const validDate = (value) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const parsed = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
  }

  return body
    && typeof body === 'object'
    && typeof body.customer_name === 'string'
    && body.customer_name.trim().length >= 2
    && body.customer_name.trim().length <= 120
    && typeof body.customer_email === 'string'
    && body.customer_email.trim().length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.customer_email.trim())
    && typeof body.customer_phone === 'string'
    && /^(\+?62|0)[0-9 -]{8,15}$/.test(body.customer_phone.trim())
    && typeof body.car_id === 'string'
    && body.car_id.trim().length > 0
    && body.car_id.length <= 100
    && typeof body.service_name === 'string'
    && body.service_name.trim().length > 0
    && body.service_name.length <= 120
    && validDate(body.pickup_date)
    && validDate(body.return_date)
    && body.return_date >= body.pickup_date
    && (body.pickup_address == null
      || (typeof body.pickup_address === 'string' && body.pickup_address.length <= 500))
    && typeof body.captcha_token === 'string'
    && body.captcha_token.length > 0
    && body.captcha_token.length <= 4096
}

function allowedOrigin(req, configuredOrigins) {
  const requestOrigin = req.headers.origin
  if (typeof requestOrigin !== 'string') return false

  let normalizedOrigin
  try {
    normalizedOrigin = new URL(requestOrigin).origin
  } catch {
    return false
  }

  return configuredOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .some((origin) => {
      try {
        return new URL(origin).origin === normalizedOrigin
      } catch {
        return false
      }
    })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return json(res, 405, { error: 'Metode permintaan tidak didukung.' })
  }

  const {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    TURNSTILE_SECRET_KEY,
    RATE_LIMIT_HASH_SECRET,
    ALLOWED_ORIGINS,
  } = process.env

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !TURNSTILE_SECRET_KEY
    || !RATE_LIMIT_HASH_SECRET || RATE_LIMIT_HASH_SECRET.length < 32 || !ALLOWED_ORIGINS) {
    return json(res, 503, { error: 'Layanan booking belum dikonfigurasi sepenuhnya.' })
  }

  const contentLength = Number(req.headers['content-length'] || 0)
  if (contentLength > 16_000 || JSON.stringify(req.body ?? {}).length > 16_000 || !validBooking(req.body)) {
    return json(res, 400, { error: 'Data booking tidak valid atau terlalu besar.' })
  }

  if (!allowedOrigin(req, ALLOWED_ORIGINS)) {
    return json(res, 403, { error: 'Asal permintaan tidak diizinkan.' })
  }

  const clientIp = getClientIp(req)
  if (!clientIp) {
    return json(res, 400, { error: 'Permintaan tidak dapat diverifikasi. Silakan coba kembali.' })
  }

  let supabase
  let rateAllowed
  let rateError
  try {
    supabase = createClient(normalizeSupabaseUrl(SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const result = await supabase.rpc('consume_booking_rate_limit', {
      p_ip_hash: hashRateLimitKey(RATE_LIMIT_HASH_SECRET, clientIp),
      p_email_hash: hashRateLimitKey(RATE_LIMIT_HASH_SECRET, req.body.customer_email.trim().toLowerCase()),
    })
    rateAllowed = result.data
    rateError = result.error
  } catch (error) {
    console.error('Booking rate limit request failed.', error instanceof Error ? error.name : 'unknown')
    return json(res, 503, { error: 'Pemeriksaan keamanan booking gagal. Silakan coba kembali.' })
  }

  if (rateError) {
    console.error('Booking rate limit check failed.', rateError.code || 'unknown')
    return json(res, 503, { error: 'Pemeriksaan keamanan booking gagal. Silakan coba kembali.' })
  }
  if (!rateAllowed) {
    return json(res, 429, { error: 'Terlalu banyak percobaan booking. Silakan tunggu beberapa menit.' })
  }

  const captchaBody = new URLSearchParams({
    secret: TURNSTILE_SECRET_KEY,
    response: req.body.captcha_token,
    remoteip: clientIp,
  })
  let captchaResult
  try {
    const captchaResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: captchaBody,
      signal: AbortSignal.timeout(5000),
    })
    if (!captchaResponse.ok) {
      return json(res, 503, { error: 'Verifikasi keamanan sedang tidak tersedia. Silakan coba kembali.' })
    }
    captchaResult = await captchaResponse.json()
  } catch {
    return json(res, 503, { error: 'Verifikasi keamanan gagal dijangkau. Silakan coba kembali.' })
  }

  const expectedHostname = new URL(req.headers.origin).hostname
  if (!captchaResult.success
    || captchaResult.hostname !== expectedHostname
    || captchaResult.action !== 'booking') {
    return json(res, 400, { error: 'Verifikasi keamanan gagal. Silakan selesaikan pemeriksaan lagi.' })
  }

  let bookingError
  try {
    const result = await supabase.rpc('create_public_booking', {
      p_customer_name: req.body.customer_name.trim(),
      p_customer_email: req.body.customer_email.trim().toLowerCase(),
      p_customer_phone: req.body.customer_phone.trim(),
      p_car_id: req.body.car_id.trim(),
      p_service_name: req.body.service_name.trim(),
      p_pickup_date: req.body.pickup_date,
      p_return_date: req.body.return_date,
      p_pickup_address: req.body.pickup_address?.trim() || null,
    })
    bookingError = result.error
  } catch (error) {
    console.error('Booking creation request failed.', error instanceof Error ? error.name : 'unknown')
    return json(res, 503, { error: 'Booking gagal disimpan. Silakan coba kembali.' })
  }

  if (bookingError) {
    if (bookingError.code === '23505') {
      return json(res, 409, { error: 'Booking dengan email, mobil, dan tanggal tersebut sudah pernah dikirim.' })
    }
    if (bookingError.code === 'P0001' || bookingError.code === '23514') {
      return json(res, 409, { error: bookingError.message })
    }
    if (bookingError.code === '22023' || bookingError.code === '22003' || bookingError.code === '22001') {
      return json(res, 400, { error: bookingError.message })
    }
    console.error('Booking creation failed.', bookingError.code || 'unknown')
    return json(res, 500, { error: 'Booking gagal disimpan. Silakan coba kembali.' })
  }

  return json(res, 201, { success: true })
}
