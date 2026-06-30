import type { CaptureStore, PickedElement } from '@/utils/types';
import { isNoiseMessage } from '@/utils/trackers';
import { hostOf, isBuilderHost } from '@/utils/builders';
import { injectText } from '@/utils/composer-inject';

/**
 * Isolated-world companion to the MAIN-world page hook. The hook itself is
 * installed by injected.content.ts (a world:'MAIN' content script); this file
 * receives the captured data via postMessage, answers the popup's requests,
 * keeps the badge counter updated and implements the element/area picker.
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  allFrames: true,
  matchAboutBlank: true,
  main() {
    // The page hook is installed by injected.content.ts (MAIN-world script),
    // which runs on every page without CSP issues. This isolated-world script
    // handles the capture communication, badge updates, and element picker.

    // This script runs in EVERY frame. Child frames (e.g. the app preview
    // inside Lovable/Bolt) relay their findings to the top frame, which
    // aggregates everything and is the only frame that answers the popup.
    const isTop = window.self === window.top;
    let store: CaptureStore = { errors: [], network: [] };
    const frameStores = new Map<string, CaptureStore>();

    const realCount = (s: CaptureStore) =>
      s.errors.filter((e) => !isNoiseMessage(e.message)).length;
    const onBuilder = isBuilderHost(hostOf(location.href));
    const totalErrors = () => {
      const frameErrors = [...frameStores.values()].reduce(
        (n, s) => n + realCount(s),
        0
      );
      // On a builder, the top frame is the editor shell — its errors aren't
      // the user's app bug, so they don't drive the badge. Off a builder,
      // count everything (unchanged behavior).
      return onBuilder ? frameErrors : realCount(store) + frameErrors;
    };

    let lastBadge = -1;
    const sendCounts = () => {
      const n = totalErrors();
      if (n === lastBadge) return;
      lastBadge = n;
      browser.runtime.sendMessage({ type: 'cg:counts', errors: n }).catch(() => {});
    };

    window.addEventListener('message', (e) => {
      const d = e.data;
      if (d?.source === 'context-grabber' && e.source === window) {
        const payload = d.payload as CaptureStore;
        if (!payload || !Array.isArray(payload.errors)) return;
        store = payload;
        if (isTop) {
          sendCounts();
        } else {
          try {
            window.top?.postMessage(
              { source: 'context-grabber-frame', href: location.href, payload: store },
              '*'
            );
          } catch {
            /* sandboxed frames may refuse – nothing we can do */
          }
        }
      } else if (isTop && d?.source === 'context-grabber-frame' && e.source !== window) {
        const payload = d.payload as CaptureStore;
        if (!payload || !Array.isArray(payload.errors) || typeof d.href !== 'string') return;
        frameStores.set(d.href, payload);
        sendCounts();
      }
    });

    // Lightweight DOM heuristics – knowing "this is WordPress + Elementor"
    // or "this is Next.js" makes the AI's root-cause guess much better.
    const detectStack = (): string[] => {
      const found: string[] = [];
      try {
        const probe = (sel: string) => document.querySelector(sel) !== null;
        if (probe('link[href*="wp-content"], script[src*="wp-content"], script[src*="wp-includes"]'))
          found.push('WordPress');
        if (probe('[class*="elementor"], script[src*="elementor"]')) found.push('Elementor');
        if (probe('.woocommerce, script[src*="woocommerce"]')) found.push('WooCommerce');
        if (probe('#__next, script#__NEXT_DATA__')) found.push('Next.js');
        else if (probe('script[src*="react"], [data-reactroot]')) found.push('React');
        if (probe('[data-v-app], script[src*="vue"]')) found.push('Vue');
        if (probe('[class*="svelte-"]')) found.push('Svelte');
        if (probe('[ng-version]')) found.push('Angular');
        if (probe('script[src*="shopify"], link[href*="cdn.shopify"]')) found.push('Shopify');
      } catch {
        /* detection is best-effort */
      }
      return found;
    };

    browser.runtime.onMessage.addListener((msg: { type?: string; text?: string }) => {
      // Only the top frame answers the popup – child frames stay silent so
      // their (empty) responses never win the race.
      if (!isTop) return undefined;
      if (msg?.type === 'cg:injectComposer' && typeof msg.text === 'string') {
        return Promise.resolve({ result: injectText(msg.text) });
      }
      if (msg?.type === 'cg:getData') {
        const frames = [...frameStores.entries()];
        const topHost = hostOf(location.href);
        return Promise.resolve({
          errors: [
            ...store.errors.map((err) => ({ ...err, origin: topHost })),
            ...frames.flatMap(([href, s]) =>
              s.errors.map((err) => ({ ...err, origin: hostOf(href) }))
            ),
          ],
          network: [
            ...store.network.map((n) => ({ ...n, origin: topHost })),
            ...frames.flatMap(([href, s]) =>
              s.network.map((n) => ({ ...n, origin: hostOf(href) }))
            ),
          ],
          page: {
            url: location.href,
            title: document.title,
            viewport: `${window.innerWidth}×${window.innerHeight}`,
            userAgent: navigator.userAgent,
            stack: detectStack(),
          },
        });
      }
      if (msg?.type === 'cg:startPick') {
        startPicker();
        return Promise.resolve(true);
      }
      if (msg?.type === 'cg:selectRegion') {
        startRegionSelect();
        return Promise.resolve(true);
      }
      return undefined;
    });

    // --- element picker -------------------------------------------------

    const STYLE_KEYS = [
      'display',
      'position',
      'width',
      'height',
      'margin',
      'padding',
      'color',
      'background-color',
      'font-size',
      'font-family',
      'z-index',
      'overflow',
      'opacity',
      'visibility',
    ];

    function cssPath(el: Element): string {
      const parts: string[] = [];
      let node: Element | null = el;
      while (node && node !== document.documentElement && parts.length < 6) {
        let part = node.tagName.toLowerCase();
        if (node.id) {
          parts.unshift(`${part}#${node.id}`);
          break;
        }
        const cls = Array.from(node.classList).slice(0, 2).join('.');
        if (cls) part += `.${cls}`;
        const parent: Element | null = node.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter(
            (c) => c.tagName === node!.tagName
          );
          if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
        }
        parts.unshift(part);
        node = parent;
      }
      return parts.join(' > ');
    }

    /**
     * All picker UI lives inside a closed shadow root on a zero-size,
     * pointer-transparent host: page CSS can't style our UI, our UI can't
     * affect page layout, and elementFromPoint never returns our elements.
     */
    function makeOverlay(): { host: HTMLElement; root: ShadowRoot } {
      const host = document.createElement('div');
      host.style.cssText =
        'all:initial;position:fixed;top:0;left:0;width:0;height:0;' +
        'pointer-events:none;z-index:2147483647;';
      const root = host.attachShadow({ mode: 'closed' });
      document.documentElement.append(host);
      return { host, root };
    }

    function startPicker() {
      const { host, root } = makeOverlay();
      const highlight = document.createElement('div');
      highlight.style.cssText =
        'position:fixed;pointer-events:none;border:2px solid #4f5ee8;' +
        'background:rgba(79,94,232,0.08);border-radius:3px;transition:all 60ms ease-out;display:none;';
      const hint = document.createElement('div');
      hint.textContent = 'Click the broken element · Esc to cancel';
      hint.style.cssText =
        'position:fixed;top:12px;left:50%;transform:translateX(-50%);pointer-events:none;' +
        'background:#17171a;color:#f4f4f5;border:1px solid #2e2e33;border-radius:8px;' +
        'padding:8px 14px;font:500 13px/1.4 system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,0.3);';
      root.append(highlight, hint);

      let current: Element | null = null;

      const onMove = (e: MouseEvent) => {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        if (!el || el === host) return;
        current = el;
        const r = el.getBoundingClientRect();
        highlight.style.display = 'block';
        highlight.style.top = `${r.top - 2}px`;
        highlight.style.left = `${r.left - 2}px`;
        highlight.style.width = `${r.width}px`;
        highlight.style.height = `${r.height}px`;
      };

      const cleanup = () => {
        document.removeEventListener('mousemove', onMove, true);
        document.removeEventListener('click', onClick, true);
        document.removeEventListener('keydown', onKey, true);
        host.remove();
      };

      const onClick = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!current) return cleanup();
        const computed = getComputedStyle(current);
        const styles: Record<string, string> = {};
        for (const k of STYLE_KEYS) styles[k] = computed.getPropertyValue(k);
        const picked: PickedElement = {
          selector: cssPath(current),
          html: current.outerHTML.slice(0, 2000),
          styles,
          time: new Date().toISOString(),
        };
        browser.runtime.sendMessage({ type: 'cg:picked', element: picked }).catch(() => {});
        cleanup();
        toast('Element captured – open Context Grabber again');
      };

      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          cleanup();
        }
      };

      document.addEventListener('mousemove', onMove, true);
      document.addEventListener('click', onClick, true);
      document.addEventListener('keydown', onKey, true);
    }

    /**
     * Snipping-tool style region selection: dim the page, let the user drag
     * a rectangle, then ask the background to capture + crop it. The overlay
     * is removed BEFORE the capture so it never appears in the screenshot.
     */
    function startRegionSelect() {
      const { host, root } = makeOverlay();
      host.style.pointerEvents = 'auto';
      host.style.width = '100vw';
      host.style.height = '100vh';
      host.style.cursor = 'crosshair';

      const dim = document.createElement('div');
      dim.style.cssText =
        'position:fixed;inset:0;background:rgba(0,0,0,0.35);';
      const sel = document.createElement('div');
      sel.style.cssText =
        'position:fixed;display:none;border:1.5px solid #6e7ef7;background:rgba(110,126,247,0.12);' +
        'box-shadow:0 0 0 100000px rgba(0,0,0,0.35);';
      const hint = document.createElement('div');
      hint.textContent = 'Drag to select an area · Esc to cancel';
      hint.style.cssText =
        'position:fixed;top:12px;left:50%;transform:translateX(-50%);pointer-events:none;' +
        'background:#17171a;color:#f4f4f5;border:1px solid #2e2e33;border-radius:8px;' +
        'padding:8px 14px;font:500 13px/1.4 system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,0.3);';
      root.append(dim, sel, hint);

      let startX = 0;
      let startY = 0;
      let dragging = false;

      const cleanup = () => {
        window.removeEventListener('keydown', onKey, true);
        host.remove();
      };

      const rectFrom = (e: MouseEvent) => {
        const x = Math.min(startX, e.clientX);
        const y = Math.min(startY, e.clientY);
        const w = Math.abs(e.clientX - startX);
        const h = Math.abs(e.clientY - startY);
        return { x, y, w, h };
      };

      host.addEventListener('mousedown', (e) => {
        e.preventDefault();
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        dim.style.display = 'none'; // the selection's box-shadow dims instead
        sel.style.display = 'block';
      });

      host.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const r = rectFrom(e);
        sel.style.left = `${r.x}px`;
        sel.style.top = `${r.y}px`;
        sel.style.width = `${r.w}px`;
        sel.style.height = `${r.h}px`;
      });

      host.addEventListener('mouseup', (e) => {
        if (!dragging) return;
        const r = rectFrom(e);
        cleanup();
        if (r.w < 5 || r.h < 5) return;
        // Two frames so the page repaints without the overlay before capture.
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            browser.runtime
              .sendMessage({ type: 'cg:captureRegion', rect: r, dpr: window.devicePixelRatio || 1 })
              .then((ok) =>
                toast(ok ? 'Area captured – open Context Grabber again' : 'Capture failed – try again')
              )
              .catch(() => {});
          })
        );
      });

      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          cleanup();
        }
      };
      window.addEventListener('keydown', onKey, true);
    }

    function toast(text: string) {
      const { host, root } = makeOverlay();
      const el = document.createElement('div');
      el.textContent = text;
      el.style.cssText =
        'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);pointer-events:none;' +
        'background:#17171a;color:#f4f4f5;border:1px solid #2e2e33;border-radius:8px;' +
        'padding:10px 16px;font:500 13px/1.4 system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,0.3);' +
        'opacity:0;transition:opacity 200ms ease;';
      root.append(el);
      requestAnimationFrame(() => (el.style.opacity = '1'));
      setTimeout(() => {
        el.style.opacity = '0';
        setTimeout(() => host.remove(), 300);
      }, 2600);
    }
  },
});
