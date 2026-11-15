import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { createFileClubStore } from './src/server/fileStore'
import { handleClubRequest } from './src/server/ledger'

function clubApi(): Plugin {
  const store = createFileClubStore(resolve('.data/clubs.json'))
  return {
    name: 'club-api',
    configureServer(server) {
      server.middlewares.use('/api/club', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        const chunks: Buffer[] = []
        req.on('data', (chunk: Buffer) => chunks.push(chunk))
        req.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8')
          const body: unknown = raw ? JSON.parse(raw) : null
          handleClubRequest(store, body)
            .then((result) => {
              res.setHeader('content-type', 'application/json')
              res.end(JSON.stringify(result))
            })
            .catch(() => {
              res.statusCode = 500
              res.end(JSON.stringify({ ok: false, reason: 'failed' }))
            })
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), clubApi()],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
})
