import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-svelte'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'Context Grabber – AI Bug Reports',
    description:
      'One-click bug reports for AI coding: console errors, failed requests & element context – formatted for Claude, ChatGPT & Cursor. 100% local.',
    permissions: ['activeTab', 'storage', 'clipboardWrite'],
    host_permissions: ['<all_urls>'],
    action: {
      default_title: 'Context Grabber',
    },
  },
});
