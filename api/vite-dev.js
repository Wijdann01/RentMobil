import handler from './bookings.js'

const BODY_LIMIT = 16_000

function sendError(res, status, error) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify({ error }))
}

function readJsonBody(req, res) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let tooLarge = false

    req.on('data', (chunk) => {
      if (tooLarge) return
      size += chunk.length
      if (size > BODY_LIMIT) {
        tooLarge = true
        sendError(res, 413, 'Data booking terlalu besar.')
        req.resume()
        reject(new Error('Request body exceeds the local booking API limit.'))
        return
      }
      chunks.push(chunk)
    })

    req.on('end', () => {
      if (res.writableEnded) return
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        sendError(res, 400, 'Format data booking tidak valid.')
        reject(new Error('Request body is not valid JSON.'))
      }
    })

    req.on('error', reject)
  })
}

export function bookingApiDevPlugin() {
  return {
    name: 'jalanin-local-booking-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/bookings', async (req, res) => {
        res.status = (status) => {
          res.statusCode = status
          return res
        }
        res.json = (body) => {
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify(body))
          return res
        }

        try {
          if (req.method !== 'POST') {
            await handler(req, res)
            return
          }
          req.body = await readJsonBody(req, res)
          if (!req.headers['x-real-ip']) req.headers['x-real-ip'] = '127.0.0.1'
          await handler(req, res)
        } catch (error) {
          if (!res.writableEnded) {
            console.error(
              'Local booking API request failed.',
              error instanceof Error ? error.message : 'unknown error',
            )
            sendError(res, 400, 'Data booking tidak dapat diproses.')
          }
        }
      })
    },
  }
}
