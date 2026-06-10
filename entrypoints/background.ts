import type { PickedElement } from '@/utils/types';

export default defineBackground(() => {
  // Per-tab error badge + storing picked elements (content scripts don't know
  // their own tabId, so the relay happens here).
  browser.runtime.onMessage.addListener(
    (msg: { type?: string; errors?: number; element?: PickedElement }, sender) => {
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
