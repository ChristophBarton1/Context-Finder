import { cgPageHook } from '@/utils/page-hook';

/**
 * Installs the page hook in the MAIN world.
 *
 * WXT registers this as a world:'MAIN' content script in the manifest, so the
 * browser injects it on every page at document_start, in the page's own JS
 * world and without being subject to the page's CSP. This is the single
 * install path for cgPageHook(); the `__contextGrabber` guard inside the hook
 * still ensures exactly one install even if the script ever runs twice.
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
