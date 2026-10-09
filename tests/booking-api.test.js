import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import handler, { normalizeSupabaseUrl } from '../api/bookings.js'

const originalFetch = globalThis.fetch
const originalEnvironment = { ...process.env }
let requests
let rateLimitAllowed = true
let captchaResult = { success: true, hostname: 'jalanin.test', action: 'booking' }
let bookingErrorCode

const validBody = () => ({
  customer_name: 'Nama Pelanggan',
  customer_email: 'pelanggan@example.com',
  customer_phone: '081234567890',
  car_id: 'car-1',
  service_name: 'Mobil + sopir',
  pickup_date: '2030-02-01',
  return_date: '2030-02-03',
  pickup_address: null,
  captcha_token: 'verified-token',
})

function makeResponse() {
  return {
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value
    },
    status(code) {
      this.statusCode = code
      return this
    },
    json(body) {
      this.body = body
      return this
    },
  }
}

async function invoke({ body = validBody(), method = 'POST', origin = 'https://jalanin.test' } = {}) {
  const req = {
    method,
    body,
    headers: {
      origin,
      'x-real-ip': '203.0.113.12',
      'content-length': '500',
    },
  }
  const res = makeResponse()
  await handler(req, res)
  return res
}

before(() => {
  Object.assign(process.env, {
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'server-only-test-key',
    TURNSTILE_SECRET_KEY: 'server-only-turnstile-secret',
    RATE_LIMIT_HASH_SECRET: 'a-test-hmac-secret-with-at-least-32-bytes',
    ALLOWED_ORIGINS: 'https://jalanin.test',
  })
  globalThis.fetch = async (input, options = {}) => {
    const url = String(input)
    if (url.endsWith('/rpc/consume_booking_rate_limit')) {
      requests.push({ type: 'rate-limit', body: JSON.parse(options.body) })
      return new Response(JSON.stringify(rateLimitAllowed), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (url.endsWith('/siteverify')) {
      requests.push({ type: 'turnstile', body: options.body })
      return new Response(JSON.stringify(captchaResult), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (url.endsWith('/rpc/create_public_booking')) {
      requests.push({ type: 'create-booking', body: JSON.parse(options.body) })
      return new Response(
        JSON.stringify(bookingErrorCode ? { code: bookingErrorCode, message: 'Duplicate booking.' } : { id: 'booking-id' }),
        {
          status: bookingErrorCode ? 409 : 200,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }
    throw new Error(`Unexpected request: ${url}`)
  }
})

after(() => {
  globalThis.fetch = originalFetch
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnvironment)) delete process.env[key]
  }
  Object.assign(process.env, originalEnvironment)
})

beforeEach(() => {
  requests = []
  rateLimitAllowed = true
  captchaResult = { success: true, hostname: 'jalanin.test', action: 'booking' }
  bookingErrorCode = undefined
})

test('normalizes Supabase REST endpoint URLs before creating RPC clients', () => {
  assert.equal(normalizeSupabaseUrl(' https://project.supabase.co/rest/v1/ '), 'https://project.supabase.co')
  assert.equal(normalizeSupabaseUrl('https://project.supabase.co/'), 'https://project.supabase.co')
})

test('creates bookings through server-only RPC without accepting client price or status', async () => {
  const res = await invoke()

  assert.equal(res.statusCode, 201)
  assert.deepEqual(res.body, { success: true })
  const bookingRequest = requests.find((request) => request.type === 'create-booking')
  assert.ok(bookingRequest)
  assert.equal('total_price' in bookingRequest.body, false)
  assert.equal('status' in bookingRequest.body, false)
  assert.equal('car_name' in bookingRequest.body, false)
  assert.equal(bookingRequest.body.p_customer_email, 'pelanggan@example.com')
})

test('rejects invalid dates before contacting external services', async () => {
  const res = await invoke({ body: { ...validBody(), pickup_date: '2030-02-30' } })

  assert.equal(res.statusCode, 400)
  assert.equal(requests.length, 0)
})

test('rejects origins that are not explicitly allowed', async () => {
  const res = await invoke({ origin: 'https://attacker.test' })

  assert.equal(res.statusCode, 403)
  assert.equal(requests.length, 0)
})

test('blocks further requests when the database rate limit is reached', async () => {
  rateLimitAllowed = false

  const res = await invoke()

  assert.equal(res.statusCode, 429)
  assert.deepEqual(requests.map((request) => request.type), ['rate-limit'])
})

test('rejects Turnstile tokens issued for another hostname', async () => {
  captchaResult = { success: true, hostname: 'attacker.test', action: 'booking' }

  const res = await invoke()

  assert.equal(res.statusCode, 400)
  assert.equal(requests.some((request) => request.type === 'create-booking'), false)
})

test('returns conflict when the database rejects a duplicate booking', async () => {
  bookingErrorCode = '23505'

  const res = await invoke()

  assert.equal(res.statusCode, 409)
  assert.match(res.body.error, /sudah pernah dikirim/)
})
