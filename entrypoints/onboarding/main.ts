import { mount } from 'svelte';
import '@/assets/tailwind.css';
import App from './App.svelte';
import { cgPageHook } from '@/utils/page-hook';
import type { CaptureStore } from '@/utils/types';

/**
 * This page is an extension page – content scripts never run here. So the
 * demo would dead-end: the popup would show "this page is off-limits" right
 * after the user triggered their first bug. To make the demo work
 * end-to-end (badge, popup, report), this page provides the same capture
 * services the content scripts normally provide.
 */
cgPageHook();

let store: CaptureStore = { errors: [], network: [] };

window.addEventListener('message', (e) => {
  if (e.source !== window || e.data?.source !== 'context-grabber') return;
  store = e.data.payload as CaptureStore;
  browser.runtime
    .sendMessage({ type: 'cg:counts', errors: store.errors.length })
    .catch(() => {});
});

browser.runtime.onMessage.addListener((msg: { type?: string }) => {
  if (msg?.type === 'cg:getData') {
    return Promise.resolve({
      errors: store.errors,
      network: store.network,
      page: {
        url: location.href,
        title: document.title,
        viewport: `${window.innerWidth}×${window.innerHeight}`,
        userAgent: navigator.userAgent,
      },
    });
  }
  return undefined;
});

export default mount(App, {
  target: document.getElementById('app')!,
});
