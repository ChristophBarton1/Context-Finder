# Context Grabber – AI Bug Reports

One-click bug reports for AI coding: console errors, failed network requests &
element context – formatted as a ready-to-paste prompt for Claude, ChatGPT &
Cursor. **100% local** – nothing ever leaves the browser.

## Stack

- [WXT](https://wxt.dev) (Manifest V3, Chrome + Firefox/Edge from one codebase)
- TypeScript · Svelte 5 · Tailwind CSS v4

## Development

```bash
npm install
npm run dev        # launches Chrome with the extension + hot reload
npm run check      # type-check (svelte-check)
npm run build      # production build → .output/chrome-mv3
npm run zip        # store-ready zip
```

To load manually: `npm run build`, then open `chrome://extensions`, enable
Developer mode, "Load unpacked" → select `.output/chrome-mv3`.

## Architecture

| File | Role |
| --- | --- |
| `entrypoints/injected.content.ts` | MAIN-world script: hooks `console`, uncaught errors, `fetch`/XHR. Dependency-free, must never break host pages. |
| `entrypoints/capture.content.ts` | Isolated-world companion: stores captured data, answers the popup, badge counts, element picker. |
| `entrypoints/background.ts` | Badge updates, stores picked elements per tab, opens onboarding on install. |
| `entrypoints/popup/` | The main UI (Svelte). |
| `entrypoints/onboarding/` | First-run demo page with an intentional bug. |
| `utils/report.ts` | Builds the markdown prompt. |
| `utils/redact.ts` | Always-on basic secret redaction (privacy by design). |

## Principles

1. **Local-first** – no servers, no telemetry. Privacy is the product.
2. **One copy, one paste** – report text + screenshot in a single clipboard write.
3. **Tool, not toy** – Linear/Raycast aesthetic: one accent color, neutral grays,
   monospace for anything code-like, designed empty states, light + dark mode.
