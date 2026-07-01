# Context Grabber – AI Bug Reports

One-click bug reports for AI coding: when an AI-built app breaks, "it doesn't
work" makes the AI guess. Context Grabber captures what actually broke and
sends it straight into the AI you're already using — the chat box of your
Lovable/Bolt/Replit project, or Claude/ChatGPT — so the fix works on the
first try. **100% local** – no servers, no telemetry. (The only network call
the extension can ever make is optional Pro license activation.)

## Features

- **Automatic capture** on every page (also inside iframes – e.g. Lovable/Bolt
  previews): console errors & warnings, uncaught exceptions, unhandled promise
  rejections, failed `fetch`/XHR requests, broken images/scripts/stylesheets,
  CSP-blocked requests. Badge shows the error count per tab.
- **Send to Builder:** on a Lovable, Bolt.new, Replit, v0 or Base44 project
  page, one click writes the report directly into the builder's own chat
  composer — review it and hit send. Claude/ChatGPT/Grok open with the report
  prefilled; every other tool gets a perfectly formatted copy.
- **Knows your app from the builder's editor:** on builder pages, the report,
  badge and popup split "your app" (the preview iframe) from the builder's own
  editor-shell noise (its analytics, infra warnings) — so the AI chases your
  bug, not Lovable's background chatter.
- **Noise filtering:** requests to ~35 known ad/analytics endpoints are
  classified as harmless instead of problems; known-benign console chatter
  (ad-SDK deprecations, `ResizeObserver loop`, React Router future-flag
  notices) is filtered; duplicates are collapsed.
- **One-click report:** structured markdown prompt with page info, errors,
  failed requests, element context and the user's expectation. Optional photo
  of the page as a second paste.
- **Element picker:** click the broken part of the page → selector, HTML and
  key computed styles go into the report (3×/day in the free tier).
- **Always-on redaction:** obvious secrets (API keys, tokens, JWTs,
  `password=…`) are replaced with `[REDACTED]` before anything is copied.
- **Zero page interference:** capture hooks are indistinguishable from native
  functions (`toString`, `name`, arity preserved); all picker UI lives in a
  closed shadow DOM on a pointer-transparent host.

## Stack

[WXT](https://wxt.dev) (Manifest V3, Chrome + Firefox/Edge from one codebase)
· TypeScript · Svelte 5 · Tailwind CSS v4

## Development

```bash
npm install
npm run dev        # launches Chrome with the extension + hot reload
npm run check      # type-check (svelte-check)
npm run build      # production build → .output/chrome-mv3
npm run zip        # store-ready zip
```

To load manually: `npm run build`, then `chrome://extensions` → Developer
mode → "Load unpacked" → select `.output/chrome-mv3`.

## Architecture

| File | Role |
| --- | --- |
| `utils/page-hook.ts` | The complete page-world capture hook as one self-contained function. Injected as an anonymous inline script (preferred – keeps the page's console noise off our chrome://extensions error page) with a MAIN-world content-script fallback for CSP-strict pages. A guard ensures exactly one install. |
| `entrypoints/injected.content.ts` | MAIN-world fallback that calls the hook when inline injection is CSP-blocked. |
| `entrypoints/capture.content.ts` | Isolated-world companion (all frames): injects the hook, aggregates findings from child iframes in the top frame (stamping each entry's frame `origin`), answers the popup, updates the builder-aware badge, relays composer injection (`cg:injectComposer`), element picker + region select (closed shadow DOM). |
| `entrypoints/background.ts` | Badge updates, stores picked elements per tab, region-screenshot capture, opens onboarding on install. |
| `entrypoints/popup/` | The main UI (Svelte): status hero, AI Export / Report / Screenshot / Element / Network tabs, Send-to targets with direct chat injection, Pro settings. |
| `entrypoints/onboarding/` | First-run demo page with an intentional bug. Extension pages can't run content scripts, so this page provides the capture services itself. |
| `utils/report.ts` | Builds the markdown prompt; on builder pages splits "your app" from "builder editor background". |
| `utils/builders.ts` | Registry of AI app-builder hosts + the shared app-vs-editor predicate (`isEditorOrigin`) used by report, popup and Pro exports. |
| `utils/composer-inject.ts` | Finds the builder's chat composer (site-specific selector chains, generic fallback) and fills it React-safely. No auto-submit. |
| `utils/export-targets.ts` | The "Send to …" target system: builder inject targets, prefill URLs (ChatGPT/Grok), per-target task text, Pro formats (client summary, developer hand-off). |
| `utils/icons.ts` | Brand icons for targets and detected frameworks (simple-icons + sourced single-path marks). |
| `utils/license.ts` | Pro licensing via Lemon Squeezy's public license API (activate + periodic validate; offline keeps Pro). |
| `utils/redact.ts` | Always-on basic secret redaction (privacy by design). |
| `utils/trackers.ts` | Known ad/analytics endpoints + known-benign console-message patterns – classified as harmless, not as problems. |
| `utils/types.ts` | Shared capture/report types (`ConsoleEntry`, `NetworkEntry` with frame `origin`, …). |

## Principles

1. **Local-first** – no servers, no telemetry. Privacy is the product.
2. **Zero decisions on the default path** – one button, one paste. Optional
   tools (element picker, photo) are visible but never in the way.
3. **Tool, not toy** – Linear/Raycast aesthetic: one accent color, neutral
   grays, monospace for anything code-like, designed empty states,
   light + dark mode, no emojis.
4. **Never break the page** – every hook wraps its work in try/catch and
   passes through to the original; wrappers look native to detection scripts.
