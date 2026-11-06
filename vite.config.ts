import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { rukAiApiMiddleware } from './server/apiMiddleware';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'ruk-ai-api-plugin',
      configureServer(server) {
        server.middlewares.use(rukAiApiMiddleware);
      },
      configurePreviewServer(server) {
        server.middlewares.use(rukAiApiMiddleware);
      },
    },
  ],
  server: {
    host: '0.0.0.0',
    port: 3001,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 3001,
    strictPort: true,
    allowedHosts: true,
  },
});
