# Chrome Web Store listing — ready-to-paste content

Everything the CWS developer dashboard asks for. Paste from here.

## Basics

- **Name:** Context Grabber – AI Bug Reports
- **Short description** (from manifest, 124 chars — hard limit 132):
  > One-click bug reports for AI coding, sent straight into Lovable, Bolt, Replit, v0, ChatGPT & Claude. 100% local, no servers.
- **Category:** Developer Tools
- **Language:** English
- **Privacy policy URL:** https://christophbarton1.github.io/Context-Finder/privacy.html
  (live once GitHub Pages is enabled: repo Settings → Pages → Source = "GitHub Actions")

## Detailed description (up to 16,000 chars)

> **Your AI built the app. Context Grabber tells it what broke.**
>
> When an app built with Lovable, Bolt, Replit, v0 or Base44 stops working,
> typing "it doesn't work" into the chat makes the AI guess — and guessing
> costs you three more broken attempts. Context Grabber captures what
> actually went wrong and puts a precise, AI-ready bug report exactly where
> it needs to go.
>
> **One click, straight into your builder's chat.** On a Lovable, Bolt,
> Replit, v0 or Base44 project page, "Send to …" writes the full report
> directly into the builder's own chat box. Review it, hit send, get a fix
> that works on the first try. Claude, ChatGPT and Grok open with the report
> prefilled; every other tool gets a perfectly formatted copy.
>
> **It knows your app from the builder's editor.** Builder pages are noisy —
> the editor's own analytics and background errors have nothing to do with
> your app. Context Grabber separates "your app" (the live preview) from the
> builder's editor-shell noise, so your AI chases your bug, not Lovable's
> background chatter. No other tool does this.
>
> **Captures everything that matters, automatically.** Console errors,
> uncaught exceptions, failed network requests, broken images and scripts,
> CSP blocks — including inside the preview iframes where AI-built apps
> actually run. The badge shows the live error count per tab.
>
> **Point at what's broken.** The element picker lets you click the broken
> part of the page; its selector, HTML and key styles go into the report.
> Add an optional screenshot of the page or a selected region.
>
> **100% private, by design.** No servers, no telemetry, no account.
> Everything is processed and stored locally in your browser. Obvious
> secrets (API keys, tokens, passwords) are automatically redacted before
> anything is copied. The only network request the extension can ever make
> is optional Pro license activation.
>
> Free forever for the core flow. Pro (one-time purchase) adds professional
> formats — client-ready summaries, developer hand-offs, GitHub issues — a
> response-body inspector and an unlimited element picker.

## Single purpose statement

> Captures the current tab's console errors, failed network requests, and
> selected element context into a formatted bug report for AI coding
> assistants.

## Permission justifications (Privacy practices tab)

- **Host permission `<all_urls>`:** Console errors and failed requests must
  be recorded from page load onward; injecting the capture hook only after a
  user gesture (activeTab) would miss the very errors the user wants to
  report, so the content script must run on all sites at document_start. No
  captured data leaves the browser.
- **activeTab:** Used with `tabs.captureVisibleTab` to screenshot the current
  tab or a user-selected region, on explicit user action only.
- **storage:** Local storage of the last 15 generated reports, per-tab
  captures (session-scoped, cleared on navigation) and settings. Nothing is
  synced or transmitted.
- **clipboardWrite:** Copies the generated bug report to the clipboard on
  user click.

## Data-use disclosures (Privacy practices tab)

- Collects: **Website content** (console output, failed-request URLs/status
  and truncated error response bodies, user-selected element markup,
  user-initiated screenshots). Processed and stored **locally only**.
- Not sold. Not transferred to third parties. Not used for purposes
  unrelated to the single purpose. (Limited Use compliant.)
- Remote code: **No.**

## Assets checklist (create before submitting)

- [ ] 1–5 screenshots, **1280×800** (use the onboarding demo page + a real
      Lovable project: popup with errors captured; report preview; "Send to
      Lovable" filling the chat; the app-vs-editor split in a report)
- [ ] Small promo tile, **440×280** PNG (logo + "One-click AI bug reports";
      minimal text)
- [ ] Optional marquee, **1400×560** (featured-carousel eligibility)
- [x] In-package icons 16/32/48/96/128 (already present and correct)

## Submission notes

- The `<all_urls>` host permission routinely triggers a manual review
  (1–2 weeks). The justification above is accurate — don't soften it.
- Reviewer note worth adding: the capture hook wraps `fetch`/`console` with
  native-looking functions (`toString` preserved) purely so anti-tamper
  scripts on host pages (e.g. Salesforce Embedded Messaging) don't break —
  compatibility, not concealment. All code is bundled; no remote code.
- Before submitting: enable GitHub Pages (Settings → Pages → "GitHub
  Actions") so the privacy-policy and uninstall URLs resolve, and verify
  both return 200.
- Pro/licensing: keys activate via Lemon Squeezy's license API (the one
  network call, disclosed in the privacy policy). If the Lemon Squeezy
  product isn't live at submission time, the checkout link is hidden and Pro
  simply can't be purchased — nothing misleading in the listing.
