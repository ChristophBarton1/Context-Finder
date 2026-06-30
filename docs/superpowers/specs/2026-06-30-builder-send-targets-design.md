# Builder Send-Targets: direct chat-box injection for AI app builders

## Problem

Context Grabber's "Send to …" targets are all generic AI chat tools (ChatGPT,
Claude, Gemini, Grok) plus dev-tool placeholders (Cursor, Codex CLI,
Windsurf). None of them are the AI app-builder platforms — Lovable, Bolt.new,
Replit Agent, v0, Base44 — that the tool's actual target audience (non-coders
"vibe coding") spends all their time in. Competitive research confirms this is
the validated market gap: every existing "capture errors → AI prompt" tool
either targets professional devs (technical vocabulary, React internals) or
requires manual copy/paste back into the builder's own chat. Nobody closes the
loop directly inside the builder.

It's also a better fit for the literal feature request ("send to ChatGPT
should actually put the text in the chat, not just open it") — these builder
platforms render their chat composer and the live app preview (where the bug
happens, inside an iframe Context Grabber already captures) on the *same
page*. No new tab, no cross-site navigation, no fighting an undocumented
`?q=` URL parameter that breaks without notice (confirmed: Claude's already
did).

## Goal

Add first-class "Send to <Builder>" targets that, when the user is already on
that builder's project page, fill the builder's own chat composer with the
formatted bug report — so the user reviews and hits Enter themselves.

## Non-goals (v1)

- **Auto-submit.** Filling the composer is enough to satisfy "it's already in
  the chat" — the user presses Enter. Avoids send-button-disabled-state race
  conditions and keeps the extension squarely in "prefill convenience," not
  "automating the site" (lower ToS exposure).
- **Wix Vibe.** No confirmed workspace URL pattern exists anywhere (product
  launched Jan 2026, everything sits behind login, zero prior art). Adding a
  `host_permissions`/content-script match for a guessed domain risks being
  silently wrong. Revisit once a real workspace URL has been observed.
- **Cross-origin injection into ChatGPT/Claude/Gemini/Grok's composer.**
  Out of scope for this spec — those stay on the existing
  prefill-URL-or-clipboard path. (Research showed Claude's official prefill
  is gone and Gemini never had one; fixing that is a separate, lower-value
  effort given the new builder targets cover the bigger gap.)

## Confidence per target (drives v1 scope)

| Target | Domain pattern | Composer DOM | Confidence | v1 selector strategy |
|---|---|---|---|---|
| **Lovable** | `lovable.dev/projects/*` | `<textarea>`, confirmed live via real shipped extension source | High | Site-specific chain |
| **Bolt.new** | `bolt.new/~/*` | `<textarea placeholder="How can Bolt help you today?">`, confirmed live | High | Site-specific chain |
| **Replit Agent** | `replit.com/@*` | Unconfirmed (no connected browser session during research) | Low | Generic detector only |
| **v0** | `v0.app/*/chat/*` | Unconfirmed (client-hydrated, no SSR markers found) | Low | Generic detector only |
| **Base44** | `app.base44.com/apps/*/editor/*` | Unconfirmed (login wall blocked inspection) | Low | Generic detector only |

Low-confidence targets still ship in v1 — through the generic detector, not a
guessed selector — and get hardened with real selectors during the manual
test pass against each platform (which was already planned as a separate
QA step). No silent gap: if the generic detector can't find a confident
single composer, it falls back to clipboard exactly like today, so worst
case is no regression from current behavior.

## Architecture

### 1. `utils/composer-inject.ts` (new)

Exports `findComposer(): HTMLTextAreaElement | HTMLElement | null` and
`injectText(text: string): 'injected' | 'not-found'`.

```ts
interface SiteSelectors {
  hostPattern: RegExp;
  selectors: string[]; // tried in order, first match wins
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
```

Lookup order:
1. If the current host matches a `SITE_SELECTORS` entry, try its selector
   chain top to bottom.
2. Otherwise (or if every site-specific selector misses), run the **generic
   detector**: collect all visible, non-disabled `<textarea>` and
   `div[contenteditable="true"]` elements on the page. If exactly one
   candidate exists, use it. If zero or more than one, return `null` (treated
   as not-found — never guess between multiple text boxes).

Text insertion (same routine for every match, textarea or contenteditable):
- For `<textarea>`/`<input>`: get the native value setter via
  `Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set`,
  call it with the new text, then dispatch `new Event('input', { bubbles: true })`.
  This is the confirmed-necessary technique for React-controlled inputs (both
  Lovable and Bolt's composers are React-controlled; naive `el.value = …`
  is silently ignored).
- For `contenteditable`: set `el.innerText`, dispatch `input` + `change`.
- After injection: `el.focus()` so the user's next keystroke (Enter) lands in
  the box, and call `el.scrollIntoView({ block: 'nearest' })` if it's outside
  the viewport.

### 2. `entrypoints/capture.content.ts` — new message handler

Top-frame-only (composer always lives in the parent page, never inside the
preview iframe — confirmed for both researched sites):

```ts
if (msg?.type === 'cg:injectComposer') {
  if (!isTop) return undefined;
  const result = injectText(msg.text);
  return Promise.resolve({ result });
}
```

### 3. `utils/export-targets.ts` — 5 new targets

```ts
{ id: 'lovable', label: 'Lovable', pro: false, hostPattern: /(^|\.)lovable\.dev$/, task: BUILDER_TASK },
{ id: 'bolt', label: 'Bolt', pro: false, hostPattern: /(^|\.)bolt\.new$/, task: BUILDER_TASK },
{ id: 'replit', label: 'Replit', pro: false, hostPattern: /(^|\.)replit\.com$/, task: BUILDER_TASK },
{ id: 'v0', label: 'v0', pro: false, hostPattern: /(^|\.)v0\.app$/, task: BUILDER_TASK },
{ id: 'base44', label: 'Base44', pro: false, hostPattern: /(^|\.)base44\.com$/, task: BUILDER_TASK },
```

`BUILDER_TASK` replaces the generic "identify root cause and fix" task text
with one that assumes the AI is *already* the one building the app in this
same chat (vs. `CODEBASE_TASK`, which assumes a separate local-codebase
session):

> "You are building this app in this chat. Use the debug context above to
> find the cause and fix it directly in your next response."

These targets carry no `openUrl`/`prefill` — a new `inject: true` flag marks
them as composer-injection targets instead.

### 4. Popup (`App.svelte`)

Existing host-detection logic (already used to preselect ChatGPT/Claude/etc.
when an open tab matches) extends naturally: if the active tab's host matches
a builder's `hostPattern`, that target is preselected and its button reads
"Send to Lovable" (etc.). Clicking it sends `cg:injectComposer` to the
content script instead of opening a URL.

- `result: 'injected'` → toast "Sent to Lovable's chat — press Enter to
  submit," done.
- `result: 'not-found'` → identical fallback to the existing chat-tool path:
  copy to clipboard + toast "Couldn't find Lovable's chat box — copied
  instead, paste with Ctrl+V."
- Builder targets carry no `openUrl` (unlike ChatGPT/Claude/etc.) — opening
  `lovable.dev` in a fresh tab wouldn't land the user on *their* project, so
  there's nothing useful to navigate to. This means no new fallback code is
  needed: when the active tab's host doesn't match, the existing
  `target.openUrl ? 'Send to …' : 'Copy for …'` rendering already shows
  "Copy for Lovable" by default (same as the Pro "Client summary"/"Developer
  hand-off" targets today, which also have no `openUrl`). The injection path
  only activates when `inject: true` *and* the host matches.

### 5. Logos (`utils/icons.ts`)

```ts
replit: icon(siReplit),
v0: icon(siV0),
```

`siReplit` and `siV0` exist in `simple-icons`. Lovable, Bolt, and Base44 do
**not** have official simple-icons entries — following the project's existing
principle (see the ChatGPT entry's comment: "no icon is more professional
than a fake one"), these get text monograms instead of a borrowed or
approximated mark:

```ts
lovable: { monogram: 'L' },
bolt: { monogram: 'B' },
base44: { monogram: '44' },
```

(Using StackBlitz's logo for "Bolt" was considered and rejected — Bolt.new
has its own distinct brand identity, and StackBlitz's mark would misrepresent
it, same reasoning as the existing OpenAI/ChatGPT decision.)

## Error handling

- Site redesigns its composer → site-specific selectors fail → generic
  detector still has a chance to find it (single textarea/contenteditable on
  page) before falling all the way back to clipboard. Avoids an
  every-UI-update hotfix cycle (the failure mode that broke AIPRM repeatedly,
  per research).
- Ambiguous generic detection (0 or 2+ candidates) → treated as not-found,
  never guesses wrong.
- Injection always degrades to the existing clipboard+toast path — never a
  silent failure, never blocks the rest of the popup.

## Testing

No existing test runner in this project (confirmed — no test framework in
`package.json`, no test files outside `node_modules`); this fix follows
existing project convention of no unit tests for utils. Verification path:

1. `npm run check` + `npm run build` after implementation (already part of
   this project's flow).
2. Manual test pass against Lovable and Bolt.new (high-confidence
   targets) — confirm injection actually lands text in the real composer.
3. Manual test pass against Replit, v0, Base44 using the generic detector —
   if it fails to find the composer on any of them, inspect the live DOM at
   that point and add a site-specific `SITE_SELECTORS` entry (this is the
   "hardening" step deferred from the design phase, now informed by real
   data instead of guesses).
4. Re-run the existing manual checklist for the 4 unaffected generic chat
   targets (ChatGPT/Claude/Gemini/Grok) to confirm no regression.
