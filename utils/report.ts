import type { CaptureData, NetworkEntry, PickedElement } from './types';
import { FREE_NETWORK_LIMIT } from './types';
import { redact } from './redact';
import { isTracker } from './trackers';

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

export function buildReport(opts: ReportOptions): { text: string; redactedCount: number } {
  const { data, picked, expectation, pro = false, task = DEFAULT_TASK } = opts;
  const lines: string[] = [];

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
  const tags = detectIssueTags(data);
  if (tags.length > 0) {
    lines.push(`**Detected issue types:** ${tags.join(', ')}`);
  }
  lines.push('');

  if (data.errors.length > 0) {
    const grouped = groupErrors(data.errors);
    const uniqueNote = grouped.length !== data.errors.length ? `, ${grouped.length} unique` : '';
    lines.push(`## Console errors (${data.errors.length}${uniqueNote})`);
    lines.push('');
    lines.push('```');
    for (const e of grouped) {
      lines.push(`[${e.level}] ${e.message}${e.count > 1 ? `  (×${e.count})` : ''}`);
    }
    lines.push('```');
    lines.push('');
  } else {
    lines.push('## Console errors');
    lines.push('');
    lines.push('_No console errors were captured on this page._');
    lines.push('');
  }

  const failures = data.network.filter((n) => !isTracker(n.url));
  const trackers = data.network.filter((n) => isTracker(n.url));

  if (failures.length > 0) {
    const shown = failures.slice(-FREE_NETWORK_LIMIT);
    const hidden = failures.length - shown.length;
    lines.push(`## Failed network requests (${failures.length})`);
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

  if (trackers.length > 0) {
    lines.push(`## Blocked ad/analytics requests (${trackers.length}) — most likely harmless`);
    lines.push('');
    lines.push(
      '_These point to known tracking endpoints and are typically blocked by an ad blocker or consent tool. Ignore them unless tracking itself is the problem._'
    );
    for (const n of trackers.slice(-3)) {
      lines.push(`- \`${n.method ?? 'GET'}\` ${n.url ?? '(unknown url)'}`);
    }
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
