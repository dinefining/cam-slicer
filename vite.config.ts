import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig(({ mode }) => {
    return {
      // Relative asset paths, so the built site works from any folder (e.g. a GitHub Pages project page)
      base: './',
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      // `npm run dev:https` serves over HTTPS so phones and iPads on the network can use the camera
      plugins: [react(), ...(mode === 'https' ? [basicSsl()] : [])],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
