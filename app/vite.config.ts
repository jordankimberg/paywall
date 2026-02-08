import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In production, CloudFront routes /plans, /checkout/*, /subscriptions* to API Gateway.
// In local dev, Vite proxy forwards these API paths to localhost:3001.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    proxy: {
      '/plans': 'http://localhost:3001',
      '/checkout': 'http://localhost:3001',
      '/subscriptions': 'http://localhost:3001',
      '/tenants': 'http://localhost:3001',
      '/entitlements': 'http://localhost:3001',
      '/webhooks': 'http://localhost:3001',
    },
  },
});
