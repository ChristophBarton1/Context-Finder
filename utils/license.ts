/**
 * Pro licensing – local-only for now.
 *
 * Until the LemonSqueezy integration ships, a key is considered valid when it
 * matches the Context Grabber key format. Real signature/API validation
 * replaces this before paid launch – the gate and the UI stay the same.
 */
const LICENSE_KEY_FORMAT = /^CG-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

export const LICENSE_STORAGE_KEY = 'cg:licenseKey';

export function isProKey(key: unknown): boolean {
  return typeof key === 'string' && LICENSE_KEY_FORMAT.test(key.trim().toUpperCase());
}

export function normalizeKey(key: string): string {
  return key.trim().toUpperCase();
}
