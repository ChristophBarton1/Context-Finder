# Context Grabber – AI Bug Reports

One-click bug reports for AI coding: when an AI-built app breaks, "it doesn't
work" makes the AI guess. Context Grabber captures what actually broke and
formats it as a ready-to-paste prompt for Claude, ChatGPT & Cursor — so the
fix works on the first try. **100% local** – no servers, no telemetry.

## Features

- **Automatic capture** on every page (also inside iframes – e.g. Lovable/Bolt
  previews): console errors & warnings, uncaught exceptions, unhandled promise
  rejections, failed `fetch`/XHR requests, broken images/scripts/stylesheets,
  CSP-blocked requests. Badge shows the error count per tab.
- **Noise filtering:** requests to ~35 known ad/analytics endpoints (blocked
  by ad blockers all the time) are classified as harmless instead of problems;
  duplicates are collapsed.
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
| `entrypoints/capture.content.ts` | Isolated-world companion (all frames): injects the hook, aggregates findings from child iframes in the top frame, answers the popup, updates the badge, element picker (closed shadow DOM). |
| `entrypoints/background.ts` | Badge updates, stores picked elements per tab, opens onboarding on install. |
| `entrypoints/popup/` | The main UI (Svelte): status hero, Report/Problems tabs, copy actions. |
| `entrypoints/onboarding/` | First-run demo page with an intentional bug. Extension pages can't run content scripts, so this page provides the capture services itself. |
| `utils/report.ts` | Builds the markdown prompt. |
| `utils/redact.ts` | Always-on basic secret redaction (privacy by design). |
| `utils/trackers.ts` | Known ad/analytics endpoints – classified as harmless, not as problems. |

## Principles

1. **Local-first** – no servers, no telemetry. Privacy is the product.
2. **Zero decisions on the default path** – one button, one paste. Optional
   tools (element picker, photo) are visible but never in the way.
3. **Tool, not toy** – Linear/Raycast aesthetic: one accent color, neutral
   grays, monospace for anything code-like, designed empty states,
   light + dark mode, no emojis.
4. **Never break the page** – every hook wraps its work in try/catch and
   passes through to the original; wrappers look native to detection scripts.
