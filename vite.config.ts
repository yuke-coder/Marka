import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
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
    process.env.AI_MARKDOWN_MODEL ||= env.AI_MARKDOWN_MODEL?.trim()
    process.env.OPENAI_API_KEY ||= env.OPENAI_API_KEY?.trim()
    process.env.OPENAI_MODEL ||= env.OPENAI_MODEL?.trim()
    process.env.OPENAI_PROXY ||= env.OPENAI_PROXY?.trim()
    process.env.ARK_API_KEY ||= env.ARK_API_KEY?.trim()
    process.env.DOUBAO_API_KEY ||= env.DOUBAO_API_KEY?.trim()
    process.env.VOLCENGINE_API_KEY ||= env.VOLCENGINE_API_KEY?.trim()
    process.env.DOUBAO_MODEL ||= env.DOUBAO_MODEL?.trim()
    process.env.ARK_MODEL ||= env.ARK_MODEL?.trim()

    const pagesBasePath = process.env.VITE_PAGES_BASE_PATH
    const base = pagesBasePath != null && pagesBasePath !== '' ? `${pagesBasePath}/` : '/'

    return {
        plugins: [react(), aiMarkdownApi()],
        base,
        server: {
            port: 5173,
            strictPort: true,
        },
        preview: {
            port: 5173,
            strictPort: true,
        },
    }
})
