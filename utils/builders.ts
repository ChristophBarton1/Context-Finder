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

/**
 * On a builder page, is this entry's frame `origin` the builder's own editor
 * shell (the top frame) rather than the user's app (a child iframe)? Off a
 * builder, always false. `pageUrl` is the top-frame document URL. This is the
 * single source of the app-vs-editor split used by the report, the popup, and
 * the Pro exports — call it everywhere so the three can never disagree.
 */
export function isEditorOrigin(
  pageUrl: string | undefined,
  origin: string | undefined
): boolean {
  const host = hostOf(pageUrl);
  return isBuilderHost(host) && !!origin && origin === host;
}
