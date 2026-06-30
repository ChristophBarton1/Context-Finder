# Builder Noise Intelligence + Real Brand Logos

## Problem

Two issues surfaced from a real Lovable test (the inject feature works — the
report landed in Lovable's chat and Lovable replied):

1. **The report was 100% noise.** On a Lovable project page, every captured
   error and failed request came from the *Lovable editor shell itself*
   (RudderStack/Facebook-Pixel analytics, a ResizeObserver loop, the sandbox
   lease-extend call, Bing tracking) — none from the user's actual built app.
   Lovable's own AI had to tell the user "these are all editor-shell noise, no
   fix needed." For a non-technical target user, a report full of irrelevant
   editor internals is worse than useless: it sends the AI chasing ghosts.

2. **Logos are missing for several targets.** ChatGPT renders as a blank slot;
   Lovable/Bolt/Base44 render as letter monograms (`L`/`B`/`44`) instead of
   their real logos. The owner wants the actual brand logo shown to the left
   of every target name.

## The key insight (drives Part A)

On every supported builder (Lovable, Bolt.new, Replit, v0, Base44), the page
is two worlds:

- **Top frame** = the builder's own editor shell (its analytics, its infra,
  its UI framework warnings). This is the *builder's* code, not the user's.
- **Child iframe(s)** = the user's actual built app preview (e.g.
  `*.lovableproject.com`, the StackBlitz WebContainer, Replit's webview,
  `*.vusercontent.net`, Base44's app deployment). This is the *user's* code —
  the only place their bugs actually live.

The capture system already runs in all frames and already knows each entry's
frame. We just don't *use* that distinction. The fix is to classify every
captured error/request by **frame origin**: on a builder page, top-frame
entries are "editor background" (demoted), iframe entries are "your app"
(promoted). This needs no per-builder iframe-host list — the rule is simply
"the frame whose host is the builder's own domain = editor; any other frame =
the user's app."

## Goals

- **Part A — Builder-aware report.** On builder pages, separate "Your app"
  (iframe) errors/requests from "Builder editor background" (top-frame) ones.
  Promote the former, demote the latter into a clearly-labeled, secondary
  section. Never silently drop anything. Make the badge and popup error count
  reflect *the user's app*, not editor noise, when on a builder.
- **Part B — Broader noise patterns.** Filter a few more high-confidence,
  always-harmless framework messages everywhere (all pages, all targets/LLMs).
- **Part C — Real brand logos.** Show every target's actual logo to the left
  of its name, including the ones currently blank or monogram'd.

## Non-goals

- Per-builder enumeration of exact app-preview iframe hostnames. The
  top-frame-vs-iframe rule is host-list-independent and robust to the builders
  changing their preview domains.
- Suppressing *real* app errors. Noise filtering stays conservative —
  builder-editor entries are demoted and labeled, not deleted; message-pattern
  filtering only covers messages that are known-harmless by construction.
- Security scanning (discussed, deferred — different product direction).

---

## Part A — Builder-aware classification

### A1. Builder registry — `utils/builders.ts` (new)

Single source of truth for "which hosts are AI app-builders." `export-targets.ts`
already encodes builder host patterns on its `inject` targets, but the report
and capture layers shouldn't depend on the export-target list (different
concern). New small module:

```ts
/** Hosts that are AI app-builder editor shells. On these, the top frame is
 *  the builder's own editor and the user's actual app runs in a child
 *  iframe — so top-frame console/network noise is the builder's, not a bug
 *  in what the user built. */
const BUILDER_HOST_PATTERNS: RegExp[] = [
  /(^|\.)lovable\.dev$/,
  /(^|\.)bolt\.new$/,
  /(^|\.)replit\.com$/,
  /(^|\.)v0\.app$/,
  /(^|\.)base44\.com$/,
];

export function isBuilderHost(host: string | undefined): boolean {
  if (!host) return false;
  return BUILDER_HOST_PATTERNS.some((p) => p.test(host));
}

/** Host of a URL, lowercased; '' if unparseable. */
export function hostOf(url: string | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return '';
  }
}
```

(The `inject` targets in `export-targets.ts` keep their own `hostPattern`s —
those drive target preselection, a separate concern. The two lists are
intentionally independent; a comment in each points at the other.)

### A2. Structured frame origin on every entry

`utils/types.ts`: add an optional `origin` (the host of the frame the entry
came from) to both entry types:

```ts
export interface ConsoleEntry {
  level: string;
  message: string;
  time: string;
  /** Host of the frame this came from (top frame or a child iframe). */
  origin?: string;
}

export interface NetworkEntry {
  url?: string;
  method?: string;
  status: number;
  statusText?: string;
  body?: string;
  time: string;
  /** Host of the frame that issued the request. */
  origin?: string;
}
```

### A3. Tag origin in aggregation — `entrypoints/capture.content.ts`

In the `cg:getData` handler, where top-frame and iframe stores are merged,
stamp each entry's `origin`:

- Top-frame entries: `origin: hostOf(location.href)`.
- Iframe entries: `origin: hostOf(href)` (the `frameStores` map is already
  keyed by each iframe's `href`).

This **replaces** the current `message: \`...[in iframe: ${host}]\`` string
hack — origin is now structured data, and the report decides how to display
it (so non-builder pages still get the "[in iframe: host]" annotation, but
rendered at report-build time from `origin`, not baked into the message).

### A4. Builder-aware badge count — `entrypoints/capture.content.ts`

`totalErrors()` currently sums non-noise errors across the top frame and all
iframes. On a builder page, the badge should count **only the user's app**
(iframes), not the editor shell (top frame):

```ts
const onBuilder = isBuilderHost(hostOf(location.href));
const totalErrors = () => {
  const frameErrors = [...frameStores.values()].reduce(
    (n, s) => n + realCount(s),
    0
  );
  // On a builder, the top frame is the editor shell — its errors aren't the
  // user's app bug, so they don't drive the badge. Off a builder, count
  // everything (current behavior).
  return onBuilder ? frameErrors : realCount(store) + frameErrors;
};
```

(`realCount` already excludes `isNoiseMessage` matches — Part B extends what
that catches.)

### A5. Builder-aware report sectioning — `utils/report.ts`

`buildReport` learns the page's builder status and each entry's origin:

```ts
const pageHostName = hostOf(data.page.url);
const onBuilder = isBuilderHost(pageHostName);
const isEditorEntry = (origin?: string) =>
  onBuilder && !!origin && origin === pageHostName;
```

Classification: an entry is "builder editor background" when on a builder AND
its `origin` equals the builder's own top-frame host. Everything else (iframe
app entries, and all entries on non-builder pages) is "primary."

Report structure on a builder page:

1. A one-line orientation note under the header, e.g.:
   `> This is a {BuilderName} project. Errors below are split into **your app**
   (what you built) and the **{BuilderName} editor** (the tool's own
   background activity — usually safe to ignore).`
2. **## Console errors** — only *primary* (app) errors, noise-filtered as
   today. If there are none: `_No errors in your app right now._`
3. **## Failed network requests** — only *primary* (app) requests.
4. A collapsed/secondary **## Builder editor background (usually safe to
   ignore)** section listing the demoted top-frame errors + requests, capped
   short (e.g. first 3 each) with a count, so it's transparent but clearly
   deprioritized.

On a non-builder page: unchanged layout, except iframe entries get a
`[in iframe: {origin}]` suffix appended **at render time** (preserving the old
behavior now that the message no longer carries the suffix).

The `BUILDER_TASK` text (already used by inject targets) stays; on builder
pages it's already the right framing ("you are building this app in this
chat").

`detectIssueTags`, `groupErrors`, and the Pro `buildClientSummary` /
`buildDeveloperHandoff` exports all operate on the **primary** set on builder
pages (so the plain-English client summary doesn't count editor noise as
"errors in the page's code"). This keeps every downstream consumer consistent.

### A6. Popup error count — `entrypoints/popup/App.svelte`

`errorCount` (the hero number) currently counts all non-noise `data.errors`.
On a builder page it should count only app (non-editor) errors, mirroring the
badge:

```ts
const errorCount = $derived.by(() => {
  const errs = (data?.errors ?? []).filter((e) => !isNoiseMessage(e.message));
  if (!data) return 0;
  const host = hostOf(data.page.url);
  if (!isBuilderHost(host)) return errs.length;
  return errs.filter((e) => e.origin !== host).length;
});
```

The Problems tab's `groupedErrors`/`failures`/`trackers` derivations get the
same builder-aware split: on a builder, show app errors in the main list and
the editor-background ones under a muted "Builder editor background"
subsection (reusing the same `isEditorEntry` logic). Keep it light — the
report is the primary surface; the Problems tab just shouldn't contradict it.

---

## Part B — Broader noise patterns

`utils/trackers.ts`: extend `NOISE_MESSAGE_PATTERNS` with high-confidence,
always-harmless framework chatter. Conservative — only messages that are
*never* an actual app bug:

```ts
const NOISE_MESSAGE_PATTERNS = [
  /^\s*%?c?\s*\[GPT\]/i,            // Google Publisher Tag deprecation notices
  /ResizeObserver loop/i,           // benign; browsers fire it on normal layout
  /React Router Future Flag Warning/i, // v6→v7 opt-in notice, not an error
  /\bRS SDK\b/,                     // RudderStack analytics SDK chatter
];
```

(`signal timed out` and similar generic timeouts are deliberately **not**
added — they can be real bugs.)

This lives in the capture-agnostic filter, so it benefits every target/LLM and
both the badge and the report automatically.

---

## Part C — Real brand logos

### C1. Extend `BrandIcon` — `utils/icons.ts`

The current `BrandIcon` supports a single 24×24 `path`, a `color`, or a text
`monogram`. The four real logos we sourced (OpenAI blossom, Lovable
silhouette, Bolt "b" glyph, Base44 mark) all turned out to be **single-path**
marks — so we don't need a raw-SVG field, only a `viewBox` override and a
`fillRule` (Bolt's glyph has a counter that needs `evenodd` or it fills
solid):

```ts
export interface BrandIcon {
  /** SVG path (24×24 viewBox unless `viewBox` overrides). */
  path?: string;
  /** viewBox override for paths whose source isn't 24×24. */
  viewBox?: string;
  /** Fill color; omitted = currentColor (adapts to theme). */
  color?: string;
  /** 'evenodd' for paths with counters/holes; default nonzero. */
  fillRule?: 'evenodd' | 'nonzero';
  /** Last-resort text mark when no real logo is available. */
  monogram?: string;
}
```

### C2. Fill in the missing logos

Using **real, sourced** SVG assets (gathered separately — never invented; a
wrong path renders as garbage):

- `chatgpt`: the real OpenAI mark (replaces the current blank `{}`).
- `lovable`, `bolt`, `base44`: their real logos (replace the `L`/`B`/`44`
  monograms).

Each entry uses `path`(+`viewBox`) when a clean single-path monochrome mark
exists, or `svg` when the logo genuinely needs multiple shapes/colors. If the
research turns up **no** reliable source for a given brand, that brand keeps
its monogram (honest fallback rather than a fake mark) — but the goal is real
logos for all four.

The existing "no fake icon" code comment is updated: the owner has chosen to
show real brand logos for the integration targets; the rule becomes "real
logo where one can be sourced, monogram only as a last resort."

### C3. Render `svg`/`viewBox` — `entrypoints/popup/App.svelte`

The `brandIcon` snippet gains handling for the two new fields, in priority
`svg` → `path` → `monogram` → empty slot:

```svelte
{#snippet brandIcon(icon: BrandIcon | undefined, size: number)}
  {#if icon?.svg}
    <span class="flex shrink-0 items-center justify-center"
      style="width:{size}px;height:{size}px">{@html icon.svg}</span>
  {:else if icon?.path}
    <svg width={size} height={size} viewBox={icon.viewBox ?? '0 0 24 24'}
      aria-hidden="true" class="shrink-0">
      <path d={icon.path} fill={icon.color ?? 'currentColor'} />
    </svg>
  {:else if icon?.monogram}
    … (unchanged) …
  {:else}
    … (unchanged empty slot) …
  {/if}
{/snippet}
```

`{@html icon.svg}` is safe here: the SVG strings are hardcoded constants in
`utils/icons.ts`, never user input. The same `brandIcon` snippet is already
used for both the main button and the dropdown, so every target name renders
its logo to the left in both places — no per-call-site change needed.

The dark-mode handling (`visibleColor` falling back near-black marks to
`currentColor`) continues to apply to `path`-based icons; `svg`-based logos
carry their own colors (acceptable for multi-color brand marks; if a sourced
logo is pure black it should be provided as a `path` so the dark-mode fallback
applies).

---

## Error handling / safety

- Classification degrades safely: if `origin` is ever missing (older cached
  capture, exotic frame), `isEditorEntry` returns false → the entry shows in
  the primary section (fail toward showing, never toward hiding).
- Non-builder pages are completely unaffected by Part A beyond the cosmetic
  move of the iframe annotation from message-baked to render-time.
- Part B patterns are append-only and conservative; worst case a genuinely-new
  builder framework warning isn't filtered (shows as a real error) — safe.
- Part C `{@html}` only ever renders hardcoded constants.

## Testing

No test runner in the project (unchanged convention) — `npm run check` +
`npm run build` gate every task, plus manual verification:

1. Re-run the Lovable test from the report that exposed this: confirm the
   editor-shell errors (RudderStack, ResizeObserver, sandbox lease, Bing) now
   land in the demoted "Builder editor background" section, the React Router
   iframe warnings are noise-filtered, and the "Your app" section correctly
   reads as clean.
2. Confirm the popup badge/hero count shows the app error count (likely 0 in
   that example), not the editor-noise count.
3. Confirm a normal (non-builder) page's report is unchanged except the
   iframe annotation still appears.
4. Confirm every target in the dropdown (all chat tools + all 5 builders)
   shows a real logo to the left of its name; spot-check dark mode.
