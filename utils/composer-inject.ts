/**
 * Finds and fills the chat composer on AI app-builder pages (Lovable,
 * Bolt.new, and a generic fallback for builders without a confirmed
 * selector yet) so a bug report lands directly in the user's existing
 * conversation instead of a fresh tab.
 */

interface SiteSelectors {
  hostPattern: RegExp;
  /** Tried in order; first visible, enabled match wins. */
  selectors: string[];
}

const SITE_SELECTORS: SiteSelectors[] = [
  {
    hostPattern: /(^|\.)lovable\.dev$/,
    selectors: ['textarea#chatinput', 'form.p-2.flex.flex-col textarea', 'textarea'],
  },
  {
    hostPattern: /(^|\.)bolt\.new$/,
    selectors: [
      'textarea[placeholder="How can Bolt help you today?"]',
      'section[aria-label="Chat"] textarea',
      'textarea',
    ],
  },
];

function isUsable(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  const style = getComputedStyle(el);
  if (style.visibility === 'hidden' || style.display === 'none') return false;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    return !el.disabled;
  }
  return true;
}

function siteSpecificComposer(): HTMLElement | null {
  const site = SITE_SELECTORS.find((s) => s.hostPattern.test(location.host));
  if (!site) return null;
  for (const sel of site.selectors) {
    const el = document.querySelector(sel);
    if (el instanceof HTMLElement && isUsable(el)) return el;
  }
  return null;
}

/** Used when there's no site-specific selector chain (or it found nothing):
 *  if exactly one plausible composer exists on the page, use it. Never guess
 *  between multiple candidates. */
function genericComposer(): HTMLElement | null {
  const candidates = [
    ...document.querySelectorAll<HTMLElement>('textarea'),
    ...document.querySelectorAll<HTMLElement>('div[contenteditable="true"]'),
  ].filter(isUsable);
  return candidates.length === 1 ? candidates[0] : null;
}

export function findComposer(): HTMLElement | null {
  return siteSpecificComposer() ?? genericComposer();
}

/** React (and similar frameworks) override the instance `value` setter to
 *  intercept changes — calling it directly leaves their internal state
 *  stale, so the framework "doesn't see" the new text. Going through the
 *  prototype's native setter bypasses that interception while a dispatched
 *  `input` event still notifies the framework. */
function setNativeValue(el: HTMLTextAreaElement | HTMLInputElement, value: string): void {
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Caller's responsibility: only invoke this when the active tab's host
 * matches an intended builder (the popup host-gates inject targets). This
 * function trusts that gate — it will fill whatever single composer it finds
 * on whatever page it runs on.
 */
export function injectText(text: string): 'injected' | 'not-found' {
  const el = findComposer();
  if (!el) return 'not-found';
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    setNativeValue(el, text);
  } else {
    el.innerText = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  el.focus();
  el.scrollIntoView({ block: 'nearest' });
  return 'injected';
}
