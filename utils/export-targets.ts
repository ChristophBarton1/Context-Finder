import type { ReportOptions } from './report';
import { buildReport, detectIssueTags, groupErrors } from './report';
import { redact } from './redact';
import { isTracker } from './trackers';

/**
 * Export targets for the "Copy for …" dropdown. Each target tunes the
 * report's task section (and sometimes the whole format) to where the text
 * will be pasted. Free tier: Claude + ChatGPT. Everything else is Pro.
 */
export interface ExportTarget {
  id: string;
  label: string;
  pro: boolean;
  /** Opened via the "Open …" link after copying. */
  openUrl?: string;
  /** Detects an open tab of this AI tool to preselect the target. */
  hostPattern?: RegExp;
  task?: string;
}

const CODEBASE_TASK =
  'I am working in my local codebase. Use the browser debug context above to locate the likely ' +
  'source file or component, then propose the smallest safe fix. Explain which file needs changes ' +
  'and what to test afterwards.';

export const EXPORT_TARGETS: ExportTarget[] = [
  {
    id: 'claude',
    label: 'Claude',
    pro: false,
    openUrl: 'https://claude.ai/new',
    hostPattern: /(^|\.)claude\.ai$/,
  },
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    pro: false,
    openUrl: 'https://chatgpt.com/',
    hostPattern: /(^|\.)chatgpt\.com$/,
  },
  { id: 'claude-code', label: 'Claude Code', pro: true, task: CODEBASE_TASK },
  { id: 'cursor', label: 'Cursor', pro: true, task: CODEBASE_TASK },
  {
    id: 'gemini',
    label: 'Gemini',
    pro: true,
    openUrl: 'https://gemini.google.com/app',
    hostPattern: /(^|\.)gemini\.google\.com$/,
  },
  {
    id: 'grok',
    label: 'Grok',
    pro: true,
    openUrl: 'https://grok.com/',
    hostPattern: /(^|\.)grok\.com$/,
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

export function buildExport(
  targetId: string,
  opts: ReportOptions
): { text: string; redactedCount: number } {
  if (targetId === 'client') return buildClientSummary(opts);
  const target = EXPORT_TARGETS.find((t) => t.id === targetId);
  return buildReport({ ...opts, task: target?.task ?? opts.task });
}
