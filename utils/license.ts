/**
 * Pro licensing via Lemon Squeezy's public License API.
 *
 * /v1/licenses/activate and /v1/licenses/validate need no API key — they are
 * designed to be called from client apps. That makes the store/product-ID
 * check below the actual security boundary: without it, any valid key from
 * ANY Lemon Squeezy store would unlock Pro here.
 *
 * Privacy: these are the only network requests the extension ever makes, and
 * they contain nothing but the license key + instance id (see
 * site/privacy.html, which discloses exactly this).
 */

export const LICENSE_STORAGE_KEY = 'cg:licenseKey';

// TODO(owner): fill in after creating the Lemon Squeezy product. Until then
// LS_CONFIGURED is false: the checkout link stays hidden and activation
// reports 'unconfigured' — Pro simply cannot be bought yet.
export const LS_CHECKOUT_URL = '';
const LS_STORE_ID = 0;
const LS_PRODUCT_ID = 0;
export const LS_CONFIGURED: boolean = LS_STORE_ID > 0 && LS_PRODUCT_ID > 0;

const API = 'https://api.lemonsqueezy.com/v1/licenses';
/** How long a successful validation is trusted before re-checking. */
const REVALIDATE_MS = 3 * 24 * 60 * 60 * 1000;

export interface StoredLicense {
  key: string;
  /** Lemon Squeezy activation instance — enables the per-key device limit. */
  instanceId: string;
  lastValidated: number;
}

export function normalizeKey(key: string): string {
  return key.trim();
}

/** Parse whatever sits in storage. Legacy values (the old format-check era
 *  stored a plain string) and anything malformed → null = not licensed. */
export function readStoredLicense(v: unknown): StoredLicense | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (
    typeof o.key !== 'string' ||
    typeof o.instanceId !== 'string' ||
    typeof o.lastValidated !== 'number'
  ) {
    return null;
  }
  return { key: o.key, instanceId: o.instanceId, lastValidated: o.lastValidated };
}

export function needsRevalidation(lic: StoredLicense): boolean {
  return Date.now() - lic.lastValidated > REVALIDATE_MS;
}

interface LsMeta {
  store_id?: number;
  product_id?: number;
}
interface LsResponse {
  activated?: boolean;
  valid?: boolean;
  error?: string | null;
  instance?: { id?: string };
  meta?: LsMeta;
}

function productMatches(meta: LsMeta | undefined): boolean {
  return meta?.store_id === LS_STORE_ID && meta?.product_id === LS_PRODUCT_ID;
}

async function post(path: string, body: object): Promise<LsResponse | 'offline'> {
  let res: Response;
  try {
    res = await fetch(`${API}/${path}`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return 'offline';
  }
  // 5xx = their problem, not an authoritative verdict on the key.
  if (res.status >= 500) return 'offline';
  try {
    return (await res.json()) as LsResponse;
  } catch {
    return 'offline';
  }
}

export type ActivateResult =
  | { ok: true; license: StoredLicense }
  | { ok: false; reason: 'unconfigured' | 'invalid' | 'limit' | 'offline' };

/** Called once, when the user enters a key. Requires being online. */
export async function activateLicense(rawKey: string): Promise<ActivateResult> {
  if (!LS_CONFIGURED) return { ok: false, reason: 'unconfigured' };
  const key = normalizeKey(rawKey);
  if (!key) return { ok: false, reason: 'invalid' };

  const body = await post('activate', { license_key: key, instance_name: 'context-grabber' });
  if (body === 'offline') return { ok: false, reason: 'offline' };

  if (body.activated === true && productMatches(body.meta) && typeof body.instance?.id === 'string') {
    return {
      ok: true,
      license: { key, instanceId: body.instance.id, lastValidated: Date.now() },
    };
  }
  if (/limit/i.test(body.error ?? '')) return { ok: false, reason: 'limit' };
  return { ok: false, reason: 'invalid' };
}

/**
 * Periodic re-check. 'valid' → bump lastValidated. 'revoked' → clear the
 * license (authoritative: refunded, expired, disabled, or instance removed).
 * 'offline' → keep Pro exactly as it was and retry on a later popup open —
 * a paying user must never lose access because their Wi-Fi dropped.
 */
export async function validateLicense(lic: StoredLicense): Promise<'valid' | 'revoked' | 'offline'> {
  if (!LS_CONFIGURED) return 'offline';
  const body = await post('validate', { license_key: lic.key, instance_id: lic.instanceId });
  if (body === 'offline') return 'offline';
  if (body.valid === true && productMatches(body.meta)) return 'valid';
  // valid for a DIFFERENT store/product should never have been stored —
  // treat as revoked rather than trusting it forever.
  if (body.valid === true || body.valid === false) return 'revoked';
  return 'offline';
}
