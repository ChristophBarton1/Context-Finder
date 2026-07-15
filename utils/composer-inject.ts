/**
 * Finds and fills the chat composer on AI app-builder pages (Lovable,
 * Bolt.new, and a scored generic fallback for builders without a confirmed
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
    // No bare `textarea` fallback: on a miss we'd rather fall through to the
    // scored generic finder than fill whatever textarea happens to be first.
    selectors: ['textarea#chatinput', 'form.p-2.flex.flex-col textarea'],
  },
  {
    hostPattern: /(^|\.)bolt\.new$/,
    selectors: [
      'textarea[placeholder="How can Bolt help you today?"]',
      'textarea[placeholder*="Bolt" i]',
      'section[aria-label="Chat"] textarea',
    ],
  },
  {
    hostPattern: /(^|\.)v0\.app$/,
    selectors: ['textarea[placeholder*="v0" i]'],
  },
];

/** Code editors (Replit/Bolt use CodeMirror, others Monaco) expose textareas
 *  and contenteditables that must never receive a bug report. */
const EDITOR_GUARD = '.cm-editor, .cm-content, .monaco-editor, .CodeMirror';

function isUsable(el: Element): boolean {
  if (el.closest(EDITOR_GUARD)) return false;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  const style = getComputedStyle(el);
  if (style.visibility === 'hidden' || style.display === 'none') return false;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    return !el.disabled && !el.readOnly;
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

/** How strongly an element reads as "the chat composer". */
function composerScore(el: HTMLElement): number {
  const hints = ['placeholder', 'aria-label', 'data-placeholder', 'id', 'name']
    .map((a) => el.getAttribute(a) ?? '')
    .join(' ')
    .toLowerCase();
  let score = 0;
  if (/chat|messag|\bask\b|prompt|describe|help|build/.test(hints)) score += 4;
  const r = el.getBoundingClientRect();
  if (r.top > window.innerHeight * 0.45) score += 2; // composers sit near the bottom
  if (el.closest('form')) score += 1;
  return score;
}

/** Used when there's no site-specific selector chain (or it found nothing).
 *  A single plausible candidate wins outright; among several, only a clear
 *  composer-looking front-runner is picked — never a guess between equals. */
function genericComposer(): HTMLElement | null {
  const candidates = [
    ...document.querySelectorAll<HTMLElement>('textarea, div[contenteditable="true"]'),
  ].filter(isUsable);
  if (candidates.length <= 1) return candidates[0] ?? null;
  const scored = candidates
    .map((el) => ({ el, score: composerScore(el) }))
    .sort((a, b) => b.score - a.score);
  return scored[0].score >= 4 && scored[0].score > scored[1].score ? scored[0].el : null;
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
