import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import sketch2code from '@s2c/vite-plugin'

export default defineConfig({
  plugins: [sketch2code({ allowDirty: true }), react(), tailwindcss()],
  server: { port: 5199, strictPort: true },
})
