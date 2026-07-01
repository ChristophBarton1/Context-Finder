import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-svelte'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'Context Grabber – AI Bug Reports',
    // Chrome hard-limits manifest descriptions to 132 chars (this one: 120).
    // "local capture" not "local": the optional Pro license activation is the
    // one network call — the capture itself never leaves the device.
    description:
      'One-click bug reports for AI coding, sent straight into Lovable, Bolt, Replit, v0, ChatGPT & Claude. 100% local capture.',
    permissions: ['activeTab', 'storage', 'clipboardWrite'],
    host_permissions: ['<all_urls>'],
    action: {
      default_title: 'Context Grabber',
    },
  },
});
