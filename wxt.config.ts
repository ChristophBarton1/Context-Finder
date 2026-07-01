import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-svelte'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'Context Grabber – AI Bug Reports',
    // Chrome hard-limits manifest descriptions to 132 chars (this one: 124).
    description:
      'One-click bug reports for AI coding, sent straight into Lovable, Bolt, Replit, v0, ChatGPT & Claude. 100% local, no servers.',
    permissions: ['activeTab', 'storage', 'clipboardWrite'],
    host_permissions: ['<all_urls>'],
    action: {
      default_title: 'Context Grabber',
    },
  },
});
