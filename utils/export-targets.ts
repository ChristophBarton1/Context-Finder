import type { ReportOptions } from './report';
import { buildReport, detectIssueTags, groupErrors } from './report';
import { redact } from './redact';
import { isTracker } from './trackers';

/**
 * Export targets for the "Send to …" dropdown. Each target tunes the
 * report's task section (and sometimes the whole format) to where the text
 * goes. ALL chat tools are free – the AI workflow is the core product.
 * Pro covers the formats that save professionals time (GitHub, client
 * summary) plus the response inspector / download / unlimited picker.
 */
export interface ExportTarget {
  id: string;
  label: string;
  pro: boolean;
  /** Opened after copying (chat site of this tool). */
  openUrl?: string;
  /**
   * Builds a URL that opens the tool with the report already in the chat
   * input. Only for tools with official prefill support (?q=…).
   */
  prefill?: (text: string) => string;
  /** Detects an open tab of this AI tool to preselect the target. */
  hostPattern?: RegExp;
  /**
   * AI app-builder targets (Lovable, Bolt, …): instead of opening a tab,
   * fill the chat composer already on the active tab via composer-inject.ts.
   * Only meaningful when hostPattern matches the ACTIVE tab specifically.
   */
  inject?: boolean;
  task?: string;
}

/** Above this URL length we open the plain site and rely on the clipboard. */
export const MAX_PREFILL_URL = 6000;

const CODEBASE_TASK =
  'I am working in my local codebase. Use the browser debug context above to locate the likely ' +
  'source file or component, then propose the smallest safe fix. Explain which file needs changes ' +
  'and what to test afterwards.';

const BUILDER_TASK =
  'You are building this app in this chat. Use the browser debug context above to find the cause ' +
  'and fix it directly in your next response.';

export const EXPORT_TARGETS: ExportTarget[] = [
  {
    id: 'claude',
    label: 'Claude',
    pro: false,
    openUrl: 'https://claude.ai/new',
    prefill: (t) => `https://claude.ai/new?q=${encodeURIComponent(t)}`,
    hostPattern: /(^|\.)claude\.ai$/,
  },
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    pro: false,
    openUrl: 'https://chatgpt.com/',
    prefill: (t) => `https://chatgpt.com/?q=${encodeURIComponent(t)}`,
    hostPattern: /(^|\.)chatgpt\.com$/,
  },
  { id: 'claude-code', label: 'Claude Code', pro: false, task: CODEBASE_TASK },
  { id: 'codex-cli', label: 'Codex CLI', pro: false, task: CODEBASE_TASK },
  { id: 'cursor', label: 'Cursor', pro: false, task: CODEBASE_TASK },
  { id: 'windsurf', label: 'Windsurf', pro: false, task: CODEBASE_TASK },
  {
    id: 'gemini',
    label: 'Gemini',
    pro: false,
    openUrl: 'https://gemini.google.com/app',
    hostPattern: /(^|\.)gemini\.google\.com$/,
  },
  {
    id: 'grok',
    label: 'Grok',
    pro: false,
    openUrl: 'https://grok.com/',
    prefill: (t) => `https://grok.com/?q=${encodeURIComponent(t)}`,
    hostPattern: /(^|\.)grok\.com$/,
  },
  {
    id: 'lovable',
    label: 'Lovable',
    pro: false,
    inject: true,
    hostPattern: /(^|\.)lovable\.dev$/,
    task: BUILDER_TASK,
  },
  {
    id: 'bolt',
    label: 'Bolt',
    pro: false,
    inject: true,
    hostPattern: /(^|\.)bolt\.new$/,
    task: BUILDER_TASK,
  },
  {
    id: 'replit',
    label: 'Replit',
    pro: false,
    inject: true,
    hostPattern: /(^|\.)replit\.com$/,
    task: BUILDER_TASK,
  },
  {
    id: 'v0',
    label: 'v0',
    pro: false,
    inject: true,
    hostPattern: /(^|\.)v0\.app$/,
    task: BUILDER_TASK,
  },
  {
    id: 'base44',
    label: 'Base44',
    pro: false,
    inject: true,
    hostPattern: /(^|\.)base44\.com$/,
    task: BUILDER_TASK,
  },
  {
    id: 'github',
    label: 'GitHub Issue',
    pro: true,
    task:
      'Notes for maintainers: reproduction details and full console/network context are above. ' +
      'Please triage and link related issues.',
  },
  { id: 'client', label: 'Client summary', pro: true },
  { id: 'developer', label: 'Developer hand-off', pro: true },
];

function pageHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Plain-English, non-technical summary a freelancer can send to a client. */
function buildClientSummary(opts: ReportOptions): { text: string; redactedCount: number } {
  const { data, expectation } = opts;
  const failures = data.network.filter((n) => !isTracker(n.url));
  const errors = groupErrors(data.errors);
  const tags = detectIssueTags(data);
  const lines: string[] = [];

  lines.push(`Quick technical check of ${pageHost(data.page.url)}`);
  lines.push('');
  if (expectation.trim()) {
    lines.push(`Reported problem: ${expectation.trim()}`);
    lines.push('');
  }
  lines.push('What I found:');
  if (errors.length > 0) {
    lines.push(`- ${errors.length} technical ${errors.length === 1 ? 'error' : 'errors'} in the page's code`);
  }
  if (failures.length > 0) {
    lines.push(`- ${failures.length} ${failures.length === 1 ? 'request' : 'requests'} to the server failed`);
  }
  if (tags.includes('CSP')) {
    lines.push("- The website's security policy is blocking some scripts from running");
  }
  if (errors.length === 0 && failures.length === 0) {
    lines.push('- No technical errors at the moment – the issue may be intermittent');
  }
  lines.push('');
  lines.push(
    'In plain words: parts of the page are not loading or running correctly. ' +
      'This is usually caused by a plugin or script conflict, or a server-side configuration issue — it is fixable.'
  );
  lines.push('');
  lines.push(
    'Next step: I will trace which component causes this and apply the smallest safe fix.'
  );
  lines.push('');
  lines.push(
    '(No personal or sensitive data is included in this summary. Generated locally with Context Grabber.)'
  );

  return (({ text, count }) => ({ text, redactedCount: count }))(redact(lines.join('\n')));
}

/** Short technical hand-off for a teammate – context, not prose. */
function buildDeveloperHandoff(opts: ReportOptions): { text: string; redactedCount: number } {
  const { data, picked, expectation } = opts;
  const failures = data.network.filter((n) => !isTracker(n.url));
  const errors = groupErrors(data.errors);
  const tags = detectIssueTags(data);
  const lines: string[] = [];

  lines.push('## Bug context');
  lines.push('');
  lines.push(`- **Page:** ${data.page.url}`);
  if (expectation.trim()) lines.push(`- **Repro / expected:** ${expectation.trim()}`);
  if (data.page.stack?.length) lines.push(`- **Stack:** ${data.page.stack.join(' · ')}`);
  if (tags.length) lines.push(`- **Suspected area:** ${tags.join(', ')}`);
  lines.push('');
  if (errors.length > 0) {
    lines.push('**Main errors:**');
    lines.push('```');
    for (const e of errors.slice(0, 5)) {
      lines.push(`[${e.level}] ${e.message.slice(0, 300)}${e.count > 1 ? `  (×${e.count})` : ''}`);
    }
    lines.push('```');
    lines.push('');
  }
  if (failures.length > 0) {
    lines.push('**Failed requests:**');
    for (const n of failures.slice(-5)) {
      lines.push(`- \`${n.method ?? 'GET'}\` ${n.url} → ${n.status === 0 ? 'failed' : n.status}`);
      if (opts.pro && n.body) {
        lines.push(`  - response: \`${n.body.replace(/`/g, "'").replace(/\s+/g, ' ').slice(0, 200)}\``);
      }
    }
    lines.push('');
  }
  if (picked) {
    lines.push(`**Element:** \`${picked.selector}\``);
    lines.push('');
  }
  lines.push('_Captured locally with Context Grabber._');

  return (({ text, count }) => ({ text, redactedCount: count }))(redact(lines.join('\n')));
}

export function buildExport(
  targetId: string,
  opts: ReportOptions
): { text: string; redactedCount: number } {
  if (targetId === 'client') return buildClientSummary(opts);
  if (targetId === 'developer') return buildDeveloperHandoff(opts);
  const target = EXPORT_TARGETS.find((t) => t.id === targetId);
  return buildReport({ ...opts, task: target?.task ?? opts.task });
}
