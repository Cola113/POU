import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { actionMiddleware, storyMiddleware } from './server/story-api'

function storyApiPlugin(): Plugin {
  return {
    name: 'story-api',
    configureServer(server) {
      server.middlewares.use('/api/story', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('Allow', 'POST')
          res.end('Method Not Allowed')
          return
        }

        storyMiddleware(req, res).catch(err => {
          console.error('[story-api] Unhandled error:', err)
          if (!res.headersSent) {
            res.statusCode = 500
          }
          res.end('Story API failed')
        })
      })
      server.middlewares.use('/api/action', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('Allow', 'POST')
          res.end('Method Not Allowed')
          return
        }

        actionMiddleware(req, res).catch(err => {
          console.error('[action-api] Unhandled error:', err)
          if (!res.headersSent) {
            res.statusCode = 500
          }
          res.end('Action API failed')
        })
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) process.env[key] = value
  }

  return {
    plugins: [
      react(),
      tailwindcss(),
      storyApiPlugin(),
    ],
  }
})
