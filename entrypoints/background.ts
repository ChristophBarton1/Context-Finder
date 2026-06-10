import type { PickedElement } from '@/utils/types';

export default defineBackground(() => {
  // Per-tab error badge + storing picked elements (content scripts don't know
  // their own tabId, so the relay happens here).
  browser.runtime.onMessage.addListener(
    (
      msg: {
        type?: string;
        errors?: number;
        element?: PickedElement;
        rect?: { x: number; y: number; w: number; h: number };
        dpr?: number;
      },
      sender
    ) => {
      const tabId = sender.tab?.id;
      if (tabId == null) return;

      if (msg?.type === 'cg:counts') {
        const n = msg.errors ?? 0;
        browser.action.setBadgeText({
          tabId,
          text: n > 0 ? String(Math.min(n, 99)) : '',
        });
        browser.action.setBadgeBackgroundColor({ tabId, color: '#dc2626' });
        browser.action.setBadgeTextColor({ tabId, color: '#ffffff' });
      }

      if (msg?.type === 'cg:picked' && msg.element) {
        browser.storage.session.set({ [`picked_${tabId}`]: msg.element });
      }

      // Region screenshot: the content script sends the selected rectangle
      // (CSS pixels); we capture the visible tab and crop it here, because
      // only the background can call captureVisibleTab.
      if (msg?.type === 'cg:captureRegion' && msg.rect) {
        const { rect } = msg;
        const dpr = msg.dpr || 1;
        return (async () => {
          try {
            const dataUrl = await browser.tabs.captureVisibleTab(sender.tab!.windowId!, {
              format: 'png',
            });
            const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
            const sx = Math.max(0, Math.round(rect.x * dpr));
            const sy = Math.max(0, Math.round(rect.y * dpr));
            const sw = Math.max(1, Math.min(bitmap.width - sx, Math.round(rect.w * dpr)));
            const sh = Math.max(1, Math.min(bitmap.height - sy, Math.round(rect.h * dpr)));
            const canvas = new OffscreenCanvas(sw, sh);
            canvas.getContext('2d')!.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
            const blob = await canvas.convertToBlob({ type: 'image/png' });
            const bytes = new Uint8Array(await blob.arrayBuffer());
            let binary = '';
            for (let i = 0; i < bytes.length; i += 0x8000) {
              binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
            }
            await browser.storage.session.set({
              [`shot_${tabId}`]: `data:image/png;base64,${btoa(binary)}`,
            });
            return true;
          } catch {
            return false;
          }
        })();
      }
    }
  );

  // Clear stored element when the tab navigates away.
  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'loading') {
      browser.storage.session.remove(`picked_${tabId}`).catch(() => {});
    }
  });

  // First-run onboarding: let the user catch a demo bug in 30 seconds.
  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') {
      browser.tabs.create({ url: browser.runtime.getURL('/onboarding.html') });
    }
  });
});
