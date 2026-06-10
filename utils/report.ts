import type { CaptureData, PickedElement } from './types';
import { FREE_NETWORK_LIMIT } from './types';
import { redact } from './redact';
import { isTracker } from './trackers';

export interface ReportOptions {
  data: CaptureData;
  picked: PickedElement | null;
  expectation: string;
}

function browserLine(userAgent: string): string {
  const chrome = userAgent.match(/Chrom(?:e|ium)\/([\d.]+)/);
  const edge = userAgent.match(/Edg\/([\d.]+)/);
  if (edge) return `Edge ${edge[1]}`;
  if (chrome) return `Chrome ${chrome[1]}`;
  return userAgent.slice(0, 80);
}

export function buildReport(opts: ReportOptions): { text: string; redactedCount: number } {
  const { data, picked, expectation } = opts;
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
  lines.push('');

  if (data.errors.length > 0) {
    lines.push(`## Console errors (${data.errors.length})`);
    lines.push('');
    lines.push('```');
    for (const e of data.errors) {
      lines.push(`[${e.level}] ${e.message}`);
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
  lines.push(
    'Please analyze the information above, identify the most likely root cause, and provide a concrete fix. ' +
      'If multiple issues exist, address the one blocking the expected behavior first.'
  );
  lines.push('');
  lines.push('---');
  lines.push('_Generated with Context Grabber_');

  return (({ text, count }) => ({ text, redactedCount: count }))(redact(lines.join('\n')));
}
