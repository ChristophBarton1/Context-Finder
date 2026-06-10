import { cgPageHook } from '@/utils/page-hook';

/**
 * MAIN-world FALLBACK for the page hook.
 *
 * The preferred install path is the anonymous inline <script> injected by
 * capture.content.ts – code injected that way belongs to the page, so
 * Chrome's extension error collector does not attribute the page's console
 * noise to this extension. On pages whose CSP blocks inline scripts the
 * inline copy never runs, and this content script installs the hook instead
 * (the `__contextGrabber` guard inside ensures exactly one install).
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  world: 'MAIN',
  allFrames: true,
  matchAboutBlank: true,
  main() {
    cgPageHook();
  },
});
