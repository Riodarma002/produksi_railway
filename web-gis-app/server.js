// ─── Production Server for Railway ─────────────────────────────────────────
// Menggabungkan:
//   1. Wialon API Proxy  (pengganti Vercel Serverless Functions)
//   2. Static file server (serve hasil Vite build di folder dist/)
//   3. SPA fallback       (semua route → dist/index.html)
// ────────────────────────────────────────────────────────────────────────────

import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3000

// ─── Middleware ─────────────────────────────────────────────────────────────
app.use(cors())

// Parse URL-encoded body (untuk POST dari frontend)
app.use(express.urlencoded({ extended: true }))
app.use(express.json())

// ─── Proxy 1: /api/proxy ───────────────────────────────────────────────────
// Frontend POST ke /api/proxy?endpoint=wialon/ajax.html
// Diteruskan ke https://hst-api.wialon.eu/wialon/ajax.html
app.all('/api/proxy', async (req, res) => {
  const endpoint = req.query.endpoint || 'wialon/ajax.html'
  const upstreamUrl = `https://hst-api.wialon.eu/${endpoint}`

  // Forward query params lain (misal sid) ke upstream
  const queryParams = { ...req.query }
  delete queryParams.endpoint
  const queryString = new URLSearchParams(queryParams).toString()
  const fullUrl = queryString ? `${upstreamUrl}?${queryString}` : upstreamUrl

  try {
    const options = {
      method: req.method,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0',
      },
    }

    // Forward body untuk POST request
    if (req.method === 'POST') {
      if (req.body && typeof req.body === 'object') {
        options.body = new URLSearchParams(req.body).toString()
      } else if (typeof req.body === 'string') {
        options.body = req.body
      }
    }

    const upstream = await fetch(fullUrl, options)
    const text = await upstream.text()

    res.set('Content-Type', 'application/json')
    res.status(upstream.status).send(text)
  } catch (err) {
    console.error('[proxy] error:', err.message)
    res.status(500).json({ error: 'Proxy error', message: err.message })
  }
})

// ─── Proxy 2: /api/wialon/* ────────────────────────────────────────────────
// Catch-all: /api/wialon/wialon/ajax.html → https://hst-api.wialon.eu/wialon/ajax.html
// Express 5 (path-to-regexp v8) tidak support wildcard string, gunakan regex
app.all(/^\/api\/wialon\//, async (req, res) => {
  // Strip prefix /api/wialon dari URL, teruskan sisanya ke Wialon
  const stripped = req.originalUrl.replace(/^\/api\/wialon/, '') || '/'
  const upstreamUrl = `https://hst-api.wialon.eu${stripped}`

  try {
    const options = {
      method: req.method,
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0',
      },
    }

    // Forward body untuk non-GET request
    if (req.method !== 'GET') {
      if (req.body && typeof req.body === 'object') {
        options.body = new URLSearchParams(req.body).toString()
      } else if (typeof req.body === 'string') {
        options.body = req.body
      }
    }

    const upstream = await fetch(upstreamUrl, options)
    const text = await upstream.text()

    res.set('Content-Type', 'application/json')
    res.status(upstream.status).send(text)
  } catch (err) {
    console.error('[wialon proxy] error:', err.message)
    res.status(500).json({ error: 'Proxy error', message: err.message })
  }
})

// ─── Static Files (Vite build output) ──────────────────────────────────────
const distPath = path.join(__dirname, 'dist')
app.use(express.static(distPath))

// ─── SPA Fallback ──────────────────────────────────────────────────────────
// Semua route yang tidak match → kirim index.html (React Router / client-side routing)
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

// ─── Start Server ──────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n===============================================`)
  console.log(`🚀  Web GIS Server running on port ${PORT}`)
  console.log(`📍  http://localhost:${PORT}`)
  console.log(`===============================================\n`)
})
