# Builder Noise Intelligence + Real Brand Logos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On AI app-builder pages, separate the user's app errors (iframe) from the builder's editor-shell noise (top frame) in the report/badge/popup; filter more known-harmless framework messages everywhere; and show every export target's real logo.

**Architecture:** A new `utils/builders.ts` is the single source of truth for "this host is a builder editor shell." Captured entries gain a structured `origin` (frame host). The report, badge, and popup use `origin` + builder detection to promote app errors and demote editor noise. Brand logos extend `BrandIcon` with `svg`/`viewBox` and fill in real marks.

**Tech Stack:** TypeScript, WXT (MV3), Svelte 5. No test runner — `npm run check` + `npm run build` gate every task, plus a manual smoke test at the end.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `utils/builders.ts` | **Create** | Builder host registry: `isBuilderHost`, `hostOf`, `builderLabel`. |
| `utils/types.ts` | Modify | Add `origin?: string` to `ConsoleEntry` and `NetworkEntry`. |
| `utils/trackers.ts` | Modify | Expand `NOISE_MESSAGE_PATTERNS` (Part B). |
| `entrypoints/capture.content.ts` | Modify | Stamp `origin` on aggregated entries (replacing the message suffix hack); builder-aware badge count. |
| `utils/report.ts` | Modify | Builder-aware sectioning: app (primary) vs editor background (demoted); render-time iframe annotation. |
| `entrypoints/popup/App.svelte` | Modify | Builder-aware error/problem counts and Problems-tab; (Part C) `brandIcon` svg/viewBox rendering. |
| `utils/icons.ts` | Modify | (Part C) extend `BrandIcon`; real logos for chatgpt/lovable/bolt/base44. |

Tasks 1–5 are Parts A+B. Task 6 is Part C (logos), appended once real logo assets are sourced.

---

## Task 1: Builder registry + origin types

**Files:**
- Create: `utils/builders.ts`
- Modify: `utils/types.ts` (`ConsoleEntry`, `NetworkEntry`)

- [ ] **Step 1: Create `utils/builders.ts`**

```ts
/**
 * AI app-builder editor shells. On these hosts the TOP frame is the builder's
 * own editor (its analytics, infra, framework warnings) and the user's actual
 * app runs in a CHILD iframe — so top-frame console/network noise is the
 * builder's, not a bug in what the user built. The report/badge/popup use this
 * to promote the user's app errors and demote editor noise.
 *
 * NOTE: kept separate from export-targets.ts's `inject` hostPatterns on
 * purpose — that list drives "send to chat" target preselection, a different
 * concern. Both lists happen to cover the same five builders today.
 */
const BUILDER_HOST_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /(^|\.)lovable\.dev$/, label: 'Lovable' },
  { pattern: /(^|\.)bolt\.new$/, label: 'Bolt' },
  { pattern: /(^|\.)replit\.com$/, label: 'Replit' },
  { pattern: /(^|\.)v0\.app$/, label: 'v0' },
  { pattern: /(^|\.)base44\.com$/, label: 'Base44' },
];

/** Host of a URL, lowercased; '' if missing/unparseable. */
export function hostOf(url: string | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return '';
  }
}

export function isBuilderHost(host: string | undefined): boolean {
  if (!host) return false;
  return BUILDER_HOST_PATTERNS.some((b) => b.pattern.test(host));
}

/** Display name for a builder host, e.g. 'Lovable'; 'the builder' if unknown. */
export function builderLabel(host: string | undefined): string {
  if (!host) return 'the builder';
  return BUILDER_HOST_PATTERNS.find((b) => b.pattern.test(host))?.label ?? 'the builder';
}
```

- [ ] **Step 2: Add `origin` to the entry types in `utils/types.ts`**

Find:

```ts
export interface ConsoleEntry {
  level: string;
  message: string;
  time: string;
}

export interface NetworkEntry {
  url?: string;
  method?: string;
  status: number;
  statusText?: string;
  /** First bytes of the failed response body (Pro: response inspector). */
  body?: string;
  time: string;
}
```

Replace with:

```ts
export interface ConsoleEntry {
  level: string;
  message: string;
  time: string;
  /** Host of the frame this came from (top frame, or a child iframe). */
  origin?: string;
}

export interface NetworkEntry {
  url?: string;
  method?: string;
  status: number;
  statusText?: string;
  /** First bytes of the failed response body (Pro: response inspector). */
  body?: string;
  time: string;
  /** Host of the frame that issued the request. */
  origin?: string;
}
```

- [ ] **Step 3: Type-check and build**

Run: `npm run check && npm run build`
Expected: `0 ERRORS 0 WARNINGS`, build succeeds.

- [ ] **Step 4: Commit** (stage only these two files)

```bash
git add utils/builders.ts utils/types.ts
git commit -m "feat: builder host registry + structured frame origin on entries"
```

---

## Task 2: Stamp origin + builder-aware badge in the content script

**Files:**
- Modify: `entrypoints/capture.content.ts` (imports, badge count, `cg:getData` aggregation)

- [ ] **Step 1: Add the import**

The file already imports `isNoiseMessage`. Add `builders` alongside:

```ts
import { isNoiseMessage } from '@/utils/trackers';
import { hostOf, isBuilderHost } from '@/utils/builders';
```

- [ ] **Step 2: Make the badge count builder-aware**

Find:

```ts
    const realCount = (s: CaptureStore) =>
      s.errors.filter((e) => !isNoiseMessage(e.message)).length;
    const totalErrors = () =>
      realCount(store) +
      [...frameStores.values()].reduce((n, s) => n + realCount(s), 0);
```

Replace with:

```ts
    const realCount = (s: CaptureStore) =>
      s.errors.filter((e) => !isNoiseMessage(e.message)).length;
    const onBuilder = isBuilderHost(hostOf(location.href));
    const totalErrors = () => {
      const frameErrors = [...frameStores.values()].reduce(
        (n, s) => n + realCount(s),
        0
      );
      // On a builder, the top frame is the editor shell — its errors aren't
      // the user's app bug, so they don't drive the badge. Off a builder,
      // count everything (unchanged behavior).
      return onBuilder ? frameErrors : realCount(store) + frameErrors;
    };
```

- [ ] **Step 3: Stamp `origin` in the `cg:getData` aggregation, replacing the message-suffix hack**

Find:

```ts
        return Promise.resolve({
          errors: [
            ...store.errors,
            ...frames.flatMap(([href, s]) =>
              s.errors.map((err) => ({
                ...err,
                message: `${err.message} [in iframe: ${frameLabel(href)}]`,
              }))
            ),
          ],
          network: [...store.network, ...frames.flatMap(([, s]) => s.network)],
          page: {
            url: location.href,
            title: document.title,
            viewport: `${window.innerWidth}×${window.innerHeight}`,
            userAgent: navigator.userAgent,
            stack: detectStack(),
          },
        });
```

Replace with:

```ts
        const topHost = hostOf(location.href);
        return Promise.resolve({
          errors: [
            ...store.errors.map((err) => ({ ...err, origin: topHost })),
            ...frames.flatMap(([href, s]) =>
              s.errors.map((err) => ({ ...err, origin: hostOf(href) }))
            ),
          ],
          network: [
            ...store.network.map((n) => ({ ...n, origin: topHost })),
            ...frames.flatMap(([href, s]) =>
              s.network.map((n) => ({ ...n, origin: hostOf(href) }))
            ),
          ],
          page: {
            url: location.href,
            title: document.title,
            viewport: `${window.innerWidth}×${window.innerHeight}`,
            userAgent: navigator.userAgent,
            stack: detectStack(),
          },
        });
```

(The `frameLabel` helper just above this block becomes unused — remove its
declaration as well. Find and delete:

```ts
        const frameLabel = (href: string) => {
          try {
            return new URL(href).host || href.slice(0, 60);
          } catch {
            return href.slice(0, 60);
          }
        };
```

`hostOf` from `utils/builders.ts` now serves the same purpose.)

- [ ] **Step 4: Type-check and build**

Run: `npm run check && npm run build`
Expected: `0 ERRORS 0 WARNINGS`, build succeeds.

- [ ] **Step 5: Commit** (stage only this file)

```bash
git add entrypoints/capture.content.ts
git commit -m "feat: stamp frame origin on entries; builder-aware badge count"
```

---

## Task 3: Expand noise patterns (Part B)

**Files:**
- Modify: `utils/trackers.ts` (`NOISE_MESSAGE_PATTERNS`)

- [ ] **Step 1: Extend the pattern list**

Find:

```ts
const NOISE_MESSAGE_PATTERNS = [/^\[GPT\]/i];
```

Replace with:

```ts
const NOISE_MESSAGE_PATTERNS = [
  /^\s*%?c?\s*\[GPT\]/i, // Google Publisher Tag's own deprecation notices
  /ResizeObserver loop/i, // benign; browsers fire it on ordinary layout churn
  /React Router Future Flag Warning/i, // v6→v7 opt-in notice, not an error
  /\bRS SDK\b/, // RudderStack analytics SDK chatter
];
```

(Deliberately NOT adding generic timeouts like "signal timed out" — those can
be real bugs.)

- [ ] **Step 2: Type-check and build**

Run: `npm run check && npm run build`
Expected: `0 ERRORS 0 WARNINGS`, build succeeds.

- [ ] **Step 3: Commit** (stage only this file)

```bash
git add utils/trackers.ts
git commit -m "feat: filter ResizeObserver/React Router/RudderStack console noise"
```

---

## Task 4: Builder-aware report

**Files:**
- Modify: `utils/report.ts` (imports + `buildReport`, plus two new module-level section helpers)

This is the largest task. Replace the file's import block and `buildReport`
function (and add two helpers) exactly as below. `groupErrors`,
`detectIssueTags`, `browserLine`, `bodySnippet`, `ReportOptions`, and
`DEFAULT_TASK` are unchanged — do not touch them.

- [ ] **Step 1: Update the import block**

Find:

```ts
import type { CaptureData, NetworkEntry, PickedElement } from './types';
import { FREE_NETWORK_LIMIT } from './types';
import { redact } from './redact';
import { isTracker, isNoiseMessage } from './trackers';
```

Replace with:

```ts
import type { CaptureData, ConsoleEntry, NetworkEntry, PickedElement } from './types';
import { FREE_NETWORK_LIMIT } from './types';
import { redact } from './redact';
import { isTracker, isNoiseMessage } from './trackers';
import { isBuilderHost, hostOf, builderLabel } from './builders';
```

- [ ] **Step 2: Add two section-rendering helpers**

Insert these two functions immediately AFTER `bodySnippet` and BEFORE
`buildReport`:

```ts
/** Render a "Console errors" section from a set of entries (already
 *  origin-scoped by the caller). `emptyMsg` shows when none survive noise
 *  filtering. */
function pushConsoleSection(
  lines: string[],
  errors: ConsoleEntry[],
  heading: string,
  emptyMsg: string
): void {
  const grouped = groupErrors(errors);
  const total = errors.filter((e) => !isNoiseMessage(e.message)).length;
  if (grouped.length > 0) {
    const uniqueNote = grouped.length !== total ? `, ${grouped.length} unique` : '';
    lines.push(`## ${heading} (${total}${uniqueNote})`);
    lines.push('');
    lines.push('```');
    for (const e of grouped) {
      lines.push(`[${e.level}] ${e.message}${e.count > 1 ? `  (×${e.count})` : ''}`);
    }
    lines.push('```');
    lines.push('');
  } else {
    lines.push(`## ${heading}`);
    lines.push('');
    lines.push(`_${emptyMsg}_`);
    lines.push('');
  }
}

/** Render a "Failed network requests" section (non-tracker entries already
 *  origin-scoped by the caller). */
function pushNetworkSection(
  lines: string[],
  failures: NetworkEntry[],
  heading: string,
  pro: boolean
): void {
  if (failures.length === 0) return;
  const shown = failures.slice(-FREE_NETWORK_LIMIT);
  const hidden = failures.length - shown.length;
  lines.push(`## ${heading} (${failures.length})`);
  lines.push('');
  for (const n of shown) {
    const status = n.status === 0 ? 'failed' : `${n.status}${n.statusText ? ' ' + n.statusText : ''}`;
    lines.push(`- \`${n.method ?? 'GET'}\` ${n.url ?? '(unknown url)'} → **${status}**`);
    if (pro) {
      const body = bodySnippet(n);
      if (body) lines.push(`  - server response: \`${body}\``);
    }
  }
  if (hidden > 0) {
    lines.push(`- _…and ${hidden} more (not included)_`);
  }
  lines.push('');
}
```

- [ ] **Step 3: Replace `buildReport`**

Find the entire existing `buildReport` function (from `export function buildReport(opts: ReportOptions)` through its closing `}`) and replace it with:

```ts
export function buildReport(opts: ReportOptions): { text: string; redactedCount: number } {
  const { data, picked, expectation, pro = false, task = DEFAULT_TASK } = opts;
  const lines: string[] = [];

  const pageHostName = hostOf(data.page.url);
  const onBuilder = isBuilderHost(pageHostName);
  const builderName = builderLabel(pageHostName);
  // On a builder, an entry from the builder's own top-frame host is editor
  // shell background; iframe entries (the user's app) and everything on
  // non-builder pages are "primary". Missing origin → treated as primary
  // (fail toward showing, never hiding).
  const isEditor = (origin?: string) =>
    onBuilder && !!origin && origin === pageHostName;

  // Non-builder pages: annotate iframe entries with their origin at render
  // time (this used to be baked into the message by the capture layer).
  const annotated = (errors: ConsoleEntry[]): ConsoleEntry[] =>
    onBuilder
      ? errors
      : errors.map((e) =>
          e.origin && e.origin !== pageHostName
            ? { ...e, message: `${e.message} [in iframe: ${e.origin}]` }
            : e
        );

  const appErrors = annotated(data.errors.filter((e) => !isEditor(e.origin)));
  const editorErrors = data.errors.filter((e) => isEditor(e.origin));
  const appFailures = data.network.filter((n) => !isEditor(n.origin) && !isTracker(n.url));
  const appTrackers = data.network.filter((n) => !isEditor(n.origin) && isTracker(n.url));
  const editorFailures = data.network.filter((n) => isEditor(n.origin) && !isTracker(n.url));

  lines.push('# Bug report');
  lines.push('');
  if (expectation.trim()) {
    lines.push(`**What I expected:** ${expectation.trim()}`);
    lines.push('');
  }
  lines.push(`**URL:** ${data.page.url}`);
  lines.push(`**Page title:** ${data.page.title || '(none)'}`);
  lines.push(`**Browser:** ${browserLine(data.page.userAgent)} · viewport ${data.page.viewport}`);
  if (data.page.stack && data.page.stack.length > 0) {
    lines.push(`**Detected stack:** ${data.page.stack.join(' · ')}`);
  }
  // Issue tags reflect the user's app only (not editor noise).
  const tags = detectIssueTags({
    ...data,
    errors: appErrors,
    network: [...appFailures, ...appTrackers],
  });
  if (tags.length > 0) {
    lines.push(`**Detected issue types:** ${tags.join(', ')}`);
  }
  lines.push('');

  if (onBuilder) {
    lines.push(
      `> This is a ${builderName} project. Problems are split into **your app** ` +
        `(what you built) and the **${builderName} editor** (the tool's own background ` +
        `activity — usually safe to ignore).`
    );
    lines.push('');
  }

  // --- Your app (primary) ---
  pushConsoleSection(
    lines,
    appErrors,
    onBuilder ? 'Console errors in your app' : 'Console errors',
    onBuilder ? 'No errors in your app right now.' : 'No console errors were captured on this page.'
  );
  pushNetworkSection(
    lines,
    appFailures,
    onBuilder ? 'Failed network requests in your app' : 'Failed network requests',
    pro
  );

  if (appTrackers.length > 0) {
    lines.push(`## Blocked ad/analytics requests (${appTrackers.length}) — most likely harmless`);
    lines.push('');
    lines.push(
      '_These point to known tracking endpoints and are typically blocked by an ad blocker or consent tool. Ignore them unless tracking itself is the problem._'
    );
    for (const n of appTrackers.slice(-3)) {
      lines.push(`- \`${n.method ?? 'GET'}\` ${n.url ?? '(unknown url)'}`);
    }
    lines.push('');
  }

  // --- Builder editor background (demoted) ---
  if (onBuilder && (editorErrors.length > 0 || editorFailures.length > 0)) {
    const grouped = groupErrors(editorErrors);
    lines.push(`## ${builderName} editor background (usually safe to ignore)`);
    lines.push('');
    lines.push(
      `_These come from the ${builderName} editor itself, not from your app. Listed for completeness._`
    );
    lines.push('');
    if (grouped.length > 0) {
      lines.push('```');
      for (const e of grouped.slice(0, 3)) {
        lines.push(`[${e.level}] ${e.message}${e.count > 1 ? `  (×${e.count})` : ''}`);
      }
      if (grouped.length > 3) lines.push(`…and ${grouped.length - 3} more`);
      lines.push('```');
    }
    for (const n of editorFailures.slice(0, 3)) {
      const status = n.status === 0 ? 'failed' : `${n.status}${n.statusText ? ' ' + n.statusText : ''}`;
      lines.push(`- \`${n.method ?? 'GET'}\` ${n.url ?? '(unknown url)'} → **${status}**`);
    }
    if (editorFailures.length > 3) lines.push(`- _…and ${editorFailures.length - 3} more_`);
    lines.push('');
  }

  // Combined harmless-noise note across the whole capture.
  const noiseCount = data.errors.filter((e) => isNoiseMessage(e.message)).length;
  if (noiseCount > 0) {
    lines.push(
      `_${noiseCount} ad/analytics console ${noiseCount === 1 ? 'message' : 'messages'} ignored (harmless)._`
    );
    lines.push('');
  }

  if (picked) {
    lines.push('## Selected element');
    lines.push('');
    lines.push(`**Selector:** \`${picked.selector}\``);
    lines.push('');
    lines.push('```html');
    lines.push(picked.html);
    lines.push('```');
    const styleEntries = Object.entries(picked.styles);
    if (styleEntries.length > 0) {
      lines.push('');
      lines.push('Key computed styles:');
      lines.push('```css');
      for (const [k, v] of styleEntries) lines.push(`${k}: ${v};`);
      lines.push('```');
    }
    lines.push('');
  }

  lines.push('## Task');
  lines.push('');
  lines.push(task);
  lines.push('');
  lines.push('---');
  lines.push('_Generated with Context Grabber — 100% locally, no data left this computer_');

  return (({ text, count }) => ({ text, redactedCount: count }))(redact(lines.join('\n')));
}
```

- [ ] **Step 4: Type-check and build**

Run: `npm run check && npm run build`
Expected: `0 ERRORS 0 WARNINGS`, build succeeds.

- [ ] **Step 5: Commit** (stage only this file)

```bash
git add utils/report.ts
git commit -m "feat: builder-aware report — split your-app vs editor background"
```

---

## Task 5: Builder-aware popup counts

**Files:**
- Modify: `entrypoints/popup/App.svelte` (imports + the derivation block at lines ~51–64, plus a small Problems-tab note)

- [ ] **Step 1: Add the import**

The file already imports `isTracker, isNoiseMessage` from trackers. Add builders:

```ts
  import { isTracker, isNoiseMessage } from '@/utils/trackers';
  import { isBuilderHost, hostOf } from '@/utils/builders';
```

- [ ] **Step 2: Make the count derivations builder-aware**

Find:

```ts
  const errorCount = $derived(
    (data?.errors ?? []).filter((e) => !isNoiseMessage(e.message)).length
  );
  const groupedErrors = $derived(groupErrors(data?.errors ?? []));
  const failures = $derived((data?.network ?? []).filter((n) => !isTracker(n.url)));
  const trackers = $derived((data?.network ?? []).filter((n) => isTracker(n.url)));
```

Replace with:

```ts
  const pageHostName = $derived(hostOf(data?.page.url));
  const onBuilder = $derived(isBuilderHost(pageHostName));
  const isEditorEntry = (origin?: string) =>
    onBuilder && !!origin && origin === pageHostName;
  // App-scoped sets: on a builder, drop the editor shell's top-frame entries
  // so counts reflect the user's app, not the tool's own background activity.
  const appErrors = $derived((data?.errors ?? []).filter((e) => !isEditorEntry(e.origin)));
  const appNetwork = $derived((data?.network ?? []).filter((n) => !isEditorEntry(n.origin)));
  const editorProblemCount = $derived(
    onBuilder
      ? (data?.errors ?? []).filter((e) => isEditorEntry(e.origin) && !isNoiseMessage(e.message)).length +
          (data?.network ?? []).filter((n) => isEditorEntry(n.origin) && !isTracker(n.url)).length
      : 0
  );
  const errorCount = $derived(
    appErrors.filter((e) => !isNoiseMessage(e.message)).length
  );
  const groupedErrors = $derived(groupErrors(appErrors));
  const failures = $derived(appNetwork.filter((n) => !isTracker(n.url)));
  const trackers = $derived(appNetwork.filter((n) => isTracker(n.url)));
```

- [ ] **Step 3: Route `tags` through the app-scoped sets**

Find:

```ts
  const tags = $derived(data ? detectIssueTags(data) : []);
```

Replace with:

```ts
  const tags = $derived(
    data ? detectIssueTags({ ...data, errors: appErrors, network: appNetwork }) : []
  );
```

- [ ] **Step 4: Surface the demoted editor count in the Problems tab**

Find the Problems-tab heading/intro. Locate this block (the Problems tab panel header — search for the text `Problems` near a count like `{problemCount}`):

```svelte
          <p class="text-[11px] font-semibold">Report preview — exactly what gets copied</p>
```

That's the report tab — NOT the target. Instead, find the Problems tab's
list container. Search for `{#if groupedErrors.length` (the first place
`groupedErrors` is rendered in the template). Immediately BEFORE that
`{#if}`, insert a muted note that appears only on builders with demoted
problems:

```svelte
          {#if onBuilder && editorProblemCount > 0}
            <p class="mb-2 text-[10.5px] text-ink-3">
              {editorProblemCount} more from the builder's editor — hidden as background noise.
            </p>
          {/if}
```

If the exact surrounding markup differs from this description, STOP and report
BLOCKED with the actual Problems-tab markup so the controller can adjust the
insertion point — do not guess.

- [ ] **Step 5: Type-check and build**

Run: `npm run check && npm run build`
Expected: `0 ERRORS 0 WARNINGS`, build succeeds.

- [ ] **Step 6: Commit** (stage only this file)

```bash
git add entrypoints/popup/App.svelte
git commit -m "feat: builder-aware error counts in popup hero and Problems tab"
```

---

## Task 6: Real brand logos (Part C)

> Appended once real logo SVG assets are sourced. Fills `BrandIcon` with
> `svg`/`viewBox` support and replaces the chatgpt blank + lovable/bolt/base44
> monograms with real marks. Detailed steps added before execution.

---

## Manual verification (after all tasks)

1. `npm run build`, reload unpacked at `chrome://extensions`.
2. On the same Lovable project page that produced the noisy report: confirm
   the RudderStack/ResizeObserver/Bing/sandbox-lease entries now sit in the
   demoted "**Lovable editor background**" section, the React Router iframe
   warnings are noise-filtered, and the "**Console errors in your app**"
   section reads clean.
3. Confirm the popup badge and hero count show the app's error count (likely
   0 here), not the editor noise; confirm the Problems tab shows the muted
   "N more from the builder's editor" note.
4. On a normal (non-builder) page: confirm the report is unchanged except the
   iframe annotation still appears as `[in iframe: host]`.
5. (After Task 6) Confirm every dropdown target shows a real logo on the left,
   in both light and dark mode.
