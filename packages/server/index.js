import express from 'express'
import cors from 'cors'

const app = express()
const PORT = process.env.PORT || 8080
const API_KEY = process.env.ANTHROPIC_API_KEY
const CLAUDE_API = 'https://api.anthropic.com/v1/messages'

app.use(cors())

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
