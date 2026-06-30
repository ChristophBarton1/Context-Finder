# Builder Send-Targets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user fill Lovable's/Bolt.new's (and a generic fallback for Replit/v0/Base44) own chat composer directly with the bug report, instead of only copying to clipboard or opening a generic AI chat in a new tab.

**Architecture:** A new `utils/composer-inject.ts` finds the chat composer on the active tab (site-specific selectors for Lovable/Bolt, a generic single-textarea/contenteditable detector elsewhere) and writes text into it using React's native-setter bypass technique. `capture.content.ts` exposes this over the existing `browser.runtime.onMessage` channel; the popup calls it for 5 new "inject" export targets instead of opening a tab.

**Tech Stack:** TypeScript, WXT (Manifest V3), Svelte 5. No test runner exists in this project (confirmed: no `vitest`/`jest` dependency, no test files outside `node_modules`) — verification uses `npm run check` (svelte-check/type-check) and `npm run build` as the gate, same as the project's existing convention, plus a manual browser smoke test in the final task.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `utils/composer-inject.ts` | **Create** | Find + fill the chat composer on the active page. Pure DOM logic, no chrome.* APIs — testable in isolation. |
| `entrypoints/capture.content.ts` | Modify | Wire `composer-inject.ts` into the existing top-frame message listener as a new `cg:injectComposer` message type. |
| `utils/export-targets.ts` | Modify | Add 5 new `ExportTarget` entries (`lovable`, `bolt`, `replit`, `v0`, `base44`) with `inject: true`, plus the `BUILDER_TASK` text. |
| `utils/icons.ts` | Modify | Add brand icons (Replit, v0) and monograms (Lovable, Bolt, Base44) for the new targets. |
| `entrypoints/popup/App.svelte` | Modify | Active-tab-aware preselection for inject targets; `copyReport()` branches into inject-then-fallback; button label and helper text cover the new states. |

---

## Task 1: Composer-finding and text-injection engine

**Files:**
- Create: `utils/composer-inject.ts`

- [ ] **Step 1: Write the file**

```ts
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
```

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: `0 ERRORS 0 WARNINGS`

- [ ] **Step 3: Commit**

```bash
git add utils/composer-inject.ts
git commit -m "feat: add composer-finding and text-injection engine"
```

---

## Task 2: Wire injection into the content script

**Files:**
- Modify: `entrypoints/capture.content.ts:1-2` (import), `entrypoints/capture.content.ts:89-119` (message listener)

- [ ] **Step 1: Add the import**

At the top of the file, alongside the existing imports:

```ts
import type { CaptureStore, PickedElement } from '@/utils/types';
import { isNoiseMessage } from '@/utils/trackers';
import { injectText } from '@/utils/composer-inject';
```

- [ ] **Step 2: Widen the message type and add the handler**

Change the listener signature and add a new branch. Before:

```ts
browser.runtime.onMessage.addListener((msg: { type?: string }) => {
  // Only the top frame answers the popup – child frames stay silent so
  // their (empty) responses never win the race.
  if (!isTop) return undefined;
  if (msg?.type === 'cg:getData') {
```

After:

```ts
browser.runtime.onMessage.addListener((msg: { type?: string; text?: string }) => {
  // Only the top frame answers the popup – child frames stay silent so
  // their (empty) responses never win the race.
  if (!isTop) return undefined;
  if (msg?.type === 'cg:injectComposer' && typeof msg.text === 'string') {
    return Promise.resolve({ result: injectText(msg.text) });
  }
  if (msg?.type === 'cg:getData') {
```

(Everything else in the listener — `cg:getData`, `cg:startPick`, `cg:selectRegion`, the closing `return undefined;` — stays exactly as it is.)

- [ ] **Step 3: Type-check and build**

Run: `npm run check && npm run build`
Expected: `0 ERRORS 0 WARNINGS`, build finishes with the usual file list (now including the new util bundled into `content-scripts/capture.js`).

- [ ] **Step 4: Commit**

```bash
git add entrypoints/capture.content.ts
git commit -m "feat: handle cg:injectComposer message in content script"
```

---

## Task 3: New export targets

**Files:**
- Modify: `utils/export-targets.ts:13-27` (interface), `utils/export-targets.ts:32-35` (task text), `utils/export-targets.ts:37-83` (targets array)

- [ ] **Step 1: Add the `inject` field to `ExportTarget`**

Before:

```ts
export interface ExportTarget {
  id: string;
  label: string;
  pro: boolean;
  /** Opened after copying (chat site of this tool). */
  openUrl?: string;
  /**
   * Builds a URL that opens the tool with the report already in the chat
   * input. Only for tools with official prefill support (?q=…).
   */
  prefill?: (text: string) => string;
  /** Detects an open tab of this AI tool to preselect the target. */
  hostPattern?: RegExp;
  task?: string;
}
```

After:

```ts
export interface ExportTarget {
  id: string;
  label: string;
  pro: boolean;
  /** Opened after copying (chat site of this tool). */
  openUrl?: string;
  /**
   * Builds a URL that opens the tool with the report already in the chat
   * input. Only for tools with official prefill support (?q=…).
   */
  prefill?: (text: string) => string;
  /** Detects an open tab of this AI tool to preselect the target. */
  hostPattern?: RegExp;
  /**
   * AI app-builder targets (Lovable, Bolt, …): instead of opening a tab,
   * fill the chat composer already on the active tab via composer-inject.ts.
   * Only meaningful when hostPattern matches the ACTIVE tab specifically.
   */
  inject?: boolean;
  task?: string;
}
```

- [ ] **Step 2: Add the builder task text**

Right after `CODEBASE_TASK`:

```ts
const CODEBASE_TASK =
  'I am working in my local codebase. Use the browser debug context above to locate the likely ' +
  'source file or component, then propose the smallest safe fix. Explain which file needs changes ' +
  'and what to test afterwards.';

const BUILDER_TASK =
  'You are building this app in this chat. Use the browser debug context above to find the cause ' +
  'and fix it directly in your next response.';
```

- [ ] **Step 3: Add the 5 new targets**

Insert right after the `grok` entry and before the `github` entry in `EXPORT_TARGETS`:

```ts
  {
    id: 'lovable',
    label: 'Lovable',
    pro: false,
    inject: true,
    hostPattern: /(^|\.)lovable\.dev$/,
    task: BUILDER_TASK,
  },
  {
    id: 'bolt',
    label: 'Bolt',
    pro: false,
    inject: true,
    hostPattern: /(^|\.)bolt\.new$/,
    task: BUILDER_TASK,
  },
  {
    id: 'replit',
    label: 'Replit',
    pro: false,
    inject: true,
    hostPattern: /(^|\.)replit\.com$/,
    task: BUILDER_TASK,
  },
  {
    id: 'v0',
    label: 'v0',
    pro: false,
    inject: true,
    hostPattern: /(^|\.)v0\.app$/,
    task: BUILDER_TASK,
  },
  {
    id: 'base44',
    label: 'Base44',
    pro: false,
    inject: true,
    hostPattern: /(^|\.)base44\.com$/,
    task: BUILDER_TASK,
  },
```

- [ ] **Step 4: Type-check**

Run: `npm run check`
Expected: `0 ERRORS 0 WARNINGS`

- [ ] **Step 5: Commit**

```bash
git add utils/export-targets.ts
git commit -m "feat: add Lovable/Bolt/Replit/v0/Base44 export targets"
```

---

## Task 4: Brand icons

**Files:**
- Modify: `utils/icons.ts:9-26` (imports), `utils/icons.ts:55-69` (`TARGET_ICONS`)

- [ ] **Step 1: Add the new simple-icons imports**

Before:

```ts
import {
  siClaude,
  siAnthropic,
  siGooglegemini,
  siGithub,
  siX,
  siCursor,
  siWindsurf,
  siWordpress,
  siElementor,
  siWoocommerce,
  siShopify,
  siReact,
  siVuedotjs,
  siSvelte,
  siAngular,
  siNextdotjs,
} from 'simple-icons';
```

After:

```ts
import {
  siClaude,
  siAnthropic,
  siGooglegemini,
  siGithub,
  siX,
  siCursor,
  siWindsurf,
  siReplit,
  siV0,
  siWordpress,
  siElementor,
  siWoocommerce,
  siShopify,
  siReact,
  siVuedotjs,
  siSvelte,
  siAngular,
  siNextdotjs,
} from 'simple-icons';
```

- [ ] **Step 2: Add the new `TARGET_ICONS` entries**

Before:

```ts
export const TARGET_ICONS: Record<string, BrandIcon> = {
  claude: icon(siClaude),
  // OpenAI had its marks removed from simple-icons (trademark request) –
  // no icon is more professional than a fake one.
  chatgpt: {},
  'claude-code': icon(siAnthropic),
  'codex-cli': {},
  cursor: icon(siCursor),
  windsurf: icon(siWindsurf),
  gemini: icon(siGooglegemini),
  grok: icon(siX),
  github: icon(siGithub),
  client: { monogram: '@' },
  developer: { monogram: '</>' },
};
```

After:

```ts
export const TARGET_ICONS: Record<string, BrandIcon> = {
  claude: icon(siClaude),
  // OpenAI had its marks removed from simple-icons (trademark request) –
  // no icon is more professional than a fake one.
  chatgpt: {},
  'claude-code': icon(siAnthropic),
  'codex-cli': {},
  cursor: icon(siCursor),
  windsurf: icon(siWindsurf),
  gemini: icon(siGooglegemini),
  grok: icon(siX),
  github: icon(siGithub),
  // Lovable and Base44 have no official simple-icons entry; Bolt's actual
  // brand mark is distinct from StackBlitz's (its parent company) and using
  // StackBlitz's logo here would misrepresent it. Same "no fake icon"
  // reasoning as chatgpt/codex-cli above.
  lovable: { monogram: 'L' },
  bolt: { monogram: 'B' },
  replit: icon(siReplit),
  v0: icon(siV0),
  base44: { monogram: '44' },
  client: { monogram: '@' },
  developer: { monogram: '</>' },
};
```

- [ ] **Step 3: Type-check and build**

Run: `npm run check && npm run build`
Expected: `0 ERRORS 0 WARNINGS`, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add utils/icons.ts
git commit -m "feat: add brand icons/monograms for builder targets"
```

---

## Task 5: Popup wiring — preselect, send, fallback

**Files:**
- Modify: `entrypoints/popup/App.svelte:50` (errorCount — already inject-aware, no change needed here, listed for context only)
- Modify: `entrypoints/popup/App.svelte:18` (state declarations)
- Modify: `entrypoints/popup/App.svelte:146-171` (target preselection in `onMount`)
- Modify: `entrypoints/popup/App.svelte:204-233` (`copyReport`)
- Modify: `entrypoints/popup/App.svelte:658` (button label)
- Modify: `entrypoints/popup/App.svelte:714-729` (helper text)

- [ ] **Step 1: Add an `injectResult` state variable**

Find:

```ts
  let copyState: 'idle' | 'busy' | 'done' = $state('idle');
```

Replace with:

```ts
  let copyState: 'idle' | 'busy' | 'done' = $state('idle');
  let injectResult: 'idle' | 'injected' | 'not-found' = $state('idle');
```

- [ ] **Step 2: Preselect inject targets against the active tab only**

Inject targets only make sense when the chat composer is on the page actually being captured — checking "is some other open tab on lovable.dev" (the existing logic for chat tools) would be wrong here. Find the `else` branch in `onMount`:

```ts
        } else {
          try {
            const tabs = await browser.tabs.query({ currentWindow: true });
            for (const t of EXPORT_TARGETS) {
              if (!t.hostPattern || (t.pro && !pro)) continue;
              const open = tabs.some((tb) => {
                try {
                  return t.hostPattern!.test(new URL(tb.url ?? '').host);
                } catch {
                  return false;
                }
              });
              if (open) {
                targetId = t.id;
                break;
              }
            }
          } catch {
            /* tab detection is optional */
          }
        }
```

Replace with:

```ts
        } else {
          let matched = false;
          try {
            const activeHost = new URL(pageUrl).host;
            for (const t of EXPORT_TARGETS) {
              if (!t.inject || !t.hostPattern) continue;
              if (t.hostPattern.test(activeHost)) {
                targetId = t.id;
                matched = true;
                break;
              }
            }
          } catch {
            /* malformed pageUrl is fine to skip */
          }
          if (!matched) {
            try {
              const tabs = await browser.tabs.query({ currentWindow: true });
              for (const t of EXPORT_TARGETS) {
                if (!t.hostPattern || t.inject || (t.pro && !pro)) continue;
                const open = tabs.some((tb) => {
                  try {
                    return t.hostPattern!.test(new URL(tb.url ?? '').host);
                  } catch {
                    return false;
                  }
                });
                if (open) {
                  targetId = t.id;
                  break;
                }
              }
            } catch {
              /* tab detection is optional */
            }
          }
        }
```

- [ ] **Step 3: Branch `copyReport()` into inject-then-fallback**

Find:

```ts
  async function copyReport() {
    if (!preview || copyState === 'busy') return;
    copyState = 'busy';
    let ok = true;
    try {
      await navigator.clipboard.writeText(preview.text);
    } catch {
      ok = false;
    }
    copyState = ok ? 'done' : 'idle';
    if (!ok) return;
    // Remember this report locally (last 15) so it can be re-copied later.
    if (data) {
      const entry: HistoryEntry = {
        host: pageDisplay(data.page.url),
        time: Date.now(),
        problems: problemCount,
        target: target.label,
        text: preview.text,
      };
      history = [entry, ...history.filter((h) => !(h.host === entry.host && h.target === entry.target))].slice(0, 15);
      browser.storage.local.set({ 'cg:history': $state.snapshot(history) }).catch(() => {});
    }
    if (target.openUrl) {
      const prefillUrl = target.prefill?.(preview.text);
      const url = prefillUrl && prefillUrl.length <= MAX_PREFILL_URL ? prefillUrl : target.openUrl;
      browser.tabs.create({ url }).catch(() => {});
    }
    setTimeout(() => (copyState = 'idle'), 2600);
  }
```

Replace with:

```ts
  function recordHistory() {
    if (!data || !preview) return;
    const entry: HistoryEntry = {
      host: pageDisplay(data.page.url),
      time: Date.now(),
      problems: problemCount,
      target: target.label,
      text: preview.text,
    };
    history = [entry, ...history.filter((h) => !(h.host === entry.host && h.target === entry.target))].slice(0, 15);
    browser.storage.local.set({ 'cg:history': $state.snapshot(history) }).catch(() => {});
  }

  async function copyReport() {
    if (!preview || copyState === 'busy') return;
    copyState = 'busy';
    injectResult = 'idle';

    if (target.inject && tabId != null) {
      try {
        const res = (await browser.tabs.sendMessage(tabId, {
          type: 'cg:injectComposer',
          text: preview.text,
        })) as { result: 'injected' | 'not-found' } | undefined;
        injectResult = res?.result ?? 'not-found';
      } catch {
        injectResult = 'not-found';
      }
      if (injectResult === 'injected') {
        copyState = 'done';
        recordHistory();
        setTimeout(() => (copyState = 'idle'), 2600);
        return;
      }
      // composer not found – fall through to the clipboard fallback below
    }

    let ok = true;
    try {
      await navigator.clipboard.writeText(preview.text);
    } catch {
      ok = false;
    }
    copyState = ok ? 'done' : 'idle';
    if (!ok) return;
    recordHistory();
    if (target.openUrl) {
      const prefillUrl = target.prefill?.(preview.text);
      const url = prefillUrl && prefillUrl.length <= MAX_PREFILL_URL ? prefillUrl : target.openUrl;
      browser.tabs.create({ url }).catch(() => {});
    }
    setTimeout(() => (copyState = 'idle'), 2600);
  }
```

- [ ] **Step 4: Update the main button label**

Find:

```svelte
              {target.openUrl ? `Send to ${target.label}` : `Copy for ${target.label}`}
```

Replace with:

```svelte
              {target.inject || target.openUrl ? `Send to ${target.label}` : `Copy for ${target.label}`}
```

- [ ] **Step 5: Update the helper text under the button**

Find:

```svelte
        <p class="-mt-1 text-center text-[10.5px] leading-relaxed text-ink-3">
          {#if copyState === 'done'}
            {#if target.prefill}
              {target.label} opened — your report is already in the chat
            {:else if target.openUrl}
              {target.label} opened — paste with Ctrl+V
            {:else}
              Copied — paste it into {target.label}
            {/if}
          {:else if target.prefill}
            Opens {target.label} with the report already in the chat.
          {:else if target.openUrl}
            Copies the report and opens {target.label} — just paste.
          {:else}
            Formatted for {target.label} — paste it there when copied.
          {/if}
```

Replace with:

```svelte
        <p class="-mt-1 text-center text-[10.5px] leading-relaxed text-ink-3">
          {#if copyState === 'done'}
            {#if target.inject && injectResult === 'injected'}
              Sent to {target.label} — press Enter there to submit
            {:else if target.inject && injectResult === 'not-found'}
              Couldn't find {target.label}'s chat box — copied instead, paste with Ctrl+V
            {:else if target.prefill}
              {target.label} opened — your report is already in the chat
            {:else if target.openUrl}
              {target.label} opened — paste with Ctrl+V
            {:else}
              Copied — paste it into {target.label}
            {/if}
          {:else if target.inject}
            Fills {target.label}'s chat box directly — review and press Enter.
          {:else if target.prefill}
            Opens {target.label} with the report already in the chat.
          {:else if target.openUrl}
            Copies the report and opens {target.label} — just paste.
          {:else}
            Formatted for {target.label} — paste it there when copied.
          {/if}
```

- [ ] **Step 6: Type-check and build**

Run: `npm run check && npm run build`
Expected: `0 ERRORS 0 WARNINGS`, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add entrypoints/popup/App.svelte
git commit -m "feat: send bug reports directly into builder chat composers"
```

---

## Task 6: Manual verification against real builder sites

No automated test exists for live third-party DOM (by definition — these are
pages this project doesn't control). This task is the real verification.

**Files:** none (manual browser testing only)

- [ ] **Step 1: Build and load the unpacked extension**

```bash
npm run build
```

In Chrome: `chrome://extensions` → Developer mode → Reload (or "Load unpacked" → `.output/chrome-mv3` if not already loaded).

- [ ] **Step 2: Test Lovable**

1. Open an existing Lovable project at `lovable.dev/projects/<id>` (or create one).
2. Open the extension popup — confirm the target auto-selects "Lovable" with its `L` monogram, and the button reads "Send to Lovable".
3. Type something in the "What did you expect?" box, click "Send to Lovable".
4. Confirm: the report text appears inside Lovable's own chat textarea (not the clipboard), and the helper text reads "Sent to Lovable — press Enter there to submit".
5. If the textarea is NOT filled: open DevTools on the Lovable tab, inspect the actual composer element, and update `SITE_SELECTORS` in `utils/composer-inject.ts` with the real selector (the existing `textarea#chatinput` / `textarea` fallback chain was inferred from a third-party extension's source, not confirmed live).

- [ ] **Step 3: Test Bolt.new**

Same steps as Lovable, on a `bolt.new/~/<id>` project page. Confirm the target auto-selects "Bolt" with its `B` monogram.

- [ ] **Step 4: Test Replit, v0, Base44 (generic detector)**

For each of `replit.com`, `v0.app`, `app.base44.com`:
1. Open a real project/chat page.
2. Click "Send to <Builder>".
3. If it works: great, the generic single-textarea detector was enough.
4. If it says "Couldn't find … chat box — copied instead": open DevTools, inspect the real composer, and add a new entry to `SITE_SELECTORS` in `utils/composer-inject.ts` (mirroring the Lovable/Bolt entries), then re-run `npm run build` and retest.

- [ ] **Step 5: Regression-check the existing generic chat targets**

Open the popup on any ordinary page (not a builder site) and confirm ChatGPT/Claude/Gemini/Grok/Cursor/Codex/Windsurf/GitHub/Client/Developer targets still behave exactly as before (button labels, copy/open behavior) — the `target.inject ||` addition to the button-label condition must not have changed anything for targets where `inject` is `undefined`.

- [ ] **Step 6: Commit any selector fixes from Steps 2–4**

```bash
git add utils/composer-inject.ts
git commit -m "fix: harden builder composer selectors against live DOM"
```

(Skip this step if no selector changes were needed.)
