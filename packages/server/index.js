import express from 'express'
import cors from 'cors'

const app = express()
const PORT = process.env.PORT || 3000
const API_KEY = process.env.ANTHROPIC_API_KEY
const CLAUDE_API = 'https://api.anthropic.com/v1/messages'

// 只允许来自 web app 域名的请求
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean)

app.use(cors({
  origin: (origin, callback) => {
    // 允许无 origin（如 curl 测试）或在白名单内的域名
    if (!origin || ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
}))

app.use(express.json({ limit: '2mb' }))

app.get('/health', (_req, res) => res.json({ ok: true }))

app.post('/v1/messages', async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({ error: { message: 'ANTHROPIC_API_KEY not configured' } })
  }

  try {
    const upstream = await fetch(CLAUDE_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    })

    const data = await upstream.json()
    res.status(upstream.status).json(data)
  } catch (err) {
    res.status(502).json({ error: { message: String(err) } })
  }
})

app.listen(PORT, () => {
  console.log(`Proxy listening on port ${PORT}`)
})
