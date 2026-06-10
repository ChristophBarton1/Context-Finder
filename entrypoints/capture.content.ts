import type { CaptureStore, PickedElement } from '@/utils/types';
import { cgPageHook } from '@/utils/page-hook';

/**
 * Isolated-world companion to the page hook.
 * Injects the hook as an anonymous inline script (preferred install path),
 * receives the captured data via postMessage, answers the popup's requests,
 * keeps the badge counter updated and implements the element picker.
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  main() {
    // Install the page hook as an anonymous inline script so its stack
    // frames belong to the page, not to this extension. Chrome would
    // otherwise list every console.warn/error of the page on our
    // chrome://extensions error page. Blocked by CSP on strict pages –
    // there the MAIN-world content script (injected.content.ts) takes over.
    try {
      const s = document.createElement('script');
      s.textContent = `(${cgPageHook.toString()})();`;
      (document.head || document.documentElement).appendChild(s);
      s.remove();
    } catch {
      /* fallback handles it */
    }

    let store: CaptureStore = { errors: [], network: [] };
    let lastBadge = -1;

    window.addEventListener('message', (e) => {
      if (e.source !== window || e.data?.source !== 'context-grabber') return;
      const payload = e.data.payload as CaptureStore;
      if (!payload || !Array.isArray(payload.errors)) return;
      store = payload;
      if (store.errors.length !== lastBadge) {
        lastBadge = store.errors.length;
        browser.runtime
          .sendMessage({ type: 'cg:counts', errors: store.errors.length })
          .catch(() => {});
      }
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
      if (msg?.type === 'cg:startPick') {
        startPicker();
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
