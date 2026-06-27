import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { handleAiMarkdownRequest } from './server/aiMarkdown'

function aiMarkdownApi(): Plugin {
    const middleware = (req: Parameters<typeof handleAiMarkdownRequest>[0], res: Parameters<typeof handleAiMarkdownRequest>[1]) => {
        void handleAiMarkdownRequest(req, res).catch((err) => {
            console.error('AI Markdown API failed:', err)
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
                res.end(JSON.stringify({ error: 'AI 服务异常，请稍后重试' }))
            } else {
                res.end()
            }
        })
    }

    return {
        name: 'marka-ai-markdown-api',
        configureServer(server) {
            server.middlewares.use('/api/ai-markdown', middleware)
        },
        configurePreviewServer(server) {
            server.middlewares.use('/api/ai-markdown', middleware)
        },
    }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '')
    process.env.OPENAI_API_KEY ||= env.OPENAI_API_KEY
    process.env.OPENAI_MODEL ||= env.OPENAI_MODEL

    const pagesBasePath = process.env.VITE_PAGES_BASE_PATH
    const base = pagesBasePath != null && pagesBasePath !== '' ? `${pagesBasePath}/` : '/'

    return {
        plugins: [react(), basicSsl(), aiMarkdownApi()],
        base,
    }
})
