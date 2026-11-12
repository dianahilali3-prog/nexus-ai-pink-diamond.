import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [react(), VitePWA({ registerType: 'autoUpdate', includeAssets: [], manifest: {
    name: 'NEXUS AI — Pink Diamond Edition', short_name: 'NEXUS AI', description: 'Creative AI workspace', theme_color: '#180d19', background_color: '#180d19', display: 'standalone', orientation: 'portrait', start_url: '/', icons: [{ src: '/nexus-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }]
  }})]
});
