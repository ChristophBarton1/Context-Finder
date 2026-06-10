/**
 * Basic secret redaction – always on, even in the free tier (privacy by design).
 * Catches the obvious patterns people accidentally paste into AI chats.
 */
const PATTERNS: RegExp[] = [
  // OpenAI / Anthropic / Stripe style keys
  /\b(sk|pk|rk)-[A-Za-z0-9_-]{16,}\b/g,
  // Generic "live/test" keys (Stripe etc.)
  /\b(sk|pk)_(live|test)_[A-Za-z0-9]{10,}\b/g,
  // GitHub tokens
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  // AWS access keys
  /\bAKIA[0-9A-Z]{16}\b/g,
  // Google API keys
  /\bAIza[0-9A-Za-z_-]{30,}\b/g,
  // JWTs
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\b/g,
  // Bearer tokens in headers/messages
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi,
];

// key=value style secrets – keep the key name, redact the value
const KV_PATTERN =
  /\b(password|passwd|pwd|secret|token|auth|api[_-]?key|access[_-]?key|client[_-]?secret)(["']?\s*[=:]\s*["']?)([^\s"'&,;]{6,})/gi;

export function redact(text: string): { text: string; count: number } {
  let count = 0;
  let out = text;
  for (const re of PATTERNS) {
    out = out.replace(re, () => {
      count++;
      return '[REDACTED]';
    });
  }
  out = out.replace(KV_PATTERN, (_m, key: string, sep: string) => {
    count++;
    return `${key}${sep}[REDACTED]`;
  });
  return { text: out, count };
}
