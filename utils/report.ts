import type { CaptureData, ConsoleEntry, NetworkEntry, PickedElement } from './types';
import { FREE_NETWORK_LIMIT } from './types';
import { redact } from './redact';
import { isTracker, isNoiseMessage } from './trackers';
import { isBuilderHost, hostOf, builderLabel } from './builders';

export interface ReportOptions {
  data: CaptureData;
  picked: PickedElement | null;
  expectation: string;
  /** Pro unlocks response bodies in the report. */
  pro?: boolean;
  /** Target-specific "## Task" text; default asks for root cause + fix. */
  task?: string;
}

const DEFAULT_TASK =
  'Please analyze the information above, identify the most likely root cause, and provide a concrete fix. ' +
  'If multiple issues exist, address the one blocking the expected behavior first.';

function browserLine(userAgent: string): string {
  const chrome = userAgent.match(/Chrom(?:e|ium)\/([\d.]+)/);
  const edge = userAgent.match(/Edg\/([\d.]+)/);
  if (edge) return `Edge ${edge[1]}`;
  if (chrome) return `Chrome ${chrome[1]}`;
  return userAgent.slice(0, 80);
}

/** Collapse repeated identical errors: one line with a ×N counter. */
export function groupErrors(
  errors: CaptureData['errors']
): { level: string; message: string; count: number }[] {
  const map = new Map<string, { level: string; message: string; count: number }>();
  for (const e of errors) {
    if (isNoiseMessage(e.message)) continue;
    const key = `${e.level}|${e.message}`;
    const g = map.get(key);
    if (g) g.count += 1;
    else map.set(key, { level: e.level, message: e.message, count: 1 });
  }
  return [...map.values()];
}

/** Classify what kind of problems were captured – improves the AI's aim. */
export function detectIssueTags(data: CaptureData): string[] {
  const tags = new Set<string>();
  for (const e of data.errors) {
    if (isNoiseMessage(e.message)) continue;
    if (/content security policy|csp/i.test(e.message)) tags.add('CSP');
    if (/cors|cross-origin/i.test(e.message)) tags.add('CORS');
    if (e.level === 'uncaught' || /typeerror|referenceerror/i.test(e.message))
      tags.add('JS runtime error');
    if (e.level === 'unhandled promise') tags.add('unhandled promise');
  }
  for (const n of data.network) {
    if (isTracker(n.url)) continue;
    if (n.status === 404) tags.add('404 not found');
    else if (n.status === 401 || n.status === 403) tags.add('auth/permission (401/403)');
    else if (n.status >= 500) tags.add('server error (5xx)');
    else if (n.status === 0) tags.add('blocked/failed request');
    if (/content security policy/i.test(n.statusText ?? '')) tags.add('CSP');
  }
  return [...tags];
}

function bodySnippet(n: NetworkEntry): string | null {
  if (!n.body) return null;
  const oneLine = n.body.replace(/`/g, "'").replace(/\s+/g, ' ').trim().slice(0, 300);
  return oneLine ? oneLine : null;
}

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
