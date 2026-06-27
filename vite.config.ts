import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const pagesBasePath = process.env.VITE_PAGES_BASE_PATH
const base = pagesBasePath != null && pagesBasePath !== '' ? `${pagesBasePath}/` : '/'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    base,
})
