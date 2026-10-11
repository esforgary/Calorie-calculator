import type { Session } from '@supabase/supabase-js';

export const REMEMBER_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
export const REMEMBER_SESSION_KEY = 'kall:auth:remembered-session:v1';
type SessionIdentity = Pick<Session, 'access_token' | 'user'>;
interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
interface Lease { userId: string; sessionId: string; expiresAt: number; revoked: boolean }
export type SessionCheck = { valid: true; expiresAt: number } | { valid: false; reason: 'expired' | 'invalid' | 'revoked' };

/** The access-token issue time changes on refresh; the original AMR authentication time does not. */
function identity(session: SessionIdentity): Omit<Lease, 'revoked'> | null {
  try {
    const encoded = session.access_token.split('.')[1];
    const claims = JSON.parse(atob(encoded.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>;
    if (claims.sub !== session.user.id || typeof claims.session_id !== 'string' || !claims.session_id || !Array.isArray(claims.amr)) return null;
    const timestamps = claims.amr.flatMap((entry: unknown): number[] => {
      if (!entry || typeof entry !== 'object') return [];
      const method = entry as Record<string, unknown>;
      return typeof method.method === 'string' && method.method !== 'token_refresh'
        && typeof method.timestamp === 'number' && Number.isSafeInteger(method.timestamp) && method.timestamp > 0
        ? [method.timestamp * 1000] : [];
    });
    if (!timestamps.length) return null;
    return { userId: session.user.id, sessionId: claims.session_id, expiresAt: Math.min(...timestamps) + REMEMBER_SESSION_MS };
  } catch { return null; }
}

/** A browser session gate, not a substitute for Supabase JWT verification and database RLS. */
export function createSessionPolicy(storage: StorageLike) {
  const keyFor = (lease: Pick<Lease, 'userId' | 'sessionId'>) => `${REMEMBER_SESSION_KEY}:${lease.userId}:${lease.sessionId}`;
  const read = (lease: Pick<Lease, 'userId' | 'sessionId'>): Lease | null => {
    try {
      const value = JSON.parse(storage.getItem(keyFor(lease)) ?? 'null') as Lease | null;
      return value && typeof value.userId === 'string' && typeof value.sessionId === 'string'
        && Number.isSafeInteger(value.expiresAt) && typeof value.revoked === 'boolean' ? value : null;
    } catch { return null; }
  };
  const write = (lease: Lease) => storage.setItem(keyFor(lease), JSON.stringify(lease));
  return {
    check(session: SessionIdentity, now = Date.now()): SessionCheck {
      const token = identity(session);
      if (!token || token.expiresAt - REMEMBER_SESSION_MS > now + 5 * 60 * 1000) return { valid: false, reason: 'invalid' };
      const remembered = read(token);
      const sameSession = remembered?.userId === token.userId && remembered.sessionId === token.sessionId;
      if (sameSession && remembered.revoked) return { valid: false, reason: 'revoked' };
      const expiresAt = sameSession ? Math.min(remembered.expiresAt, token.expiresAt) : token.expiresAt;
      if (expiresAt <= now) return { valid: false, reason: 'expired' };
      if (!sameSession || remembered.expiresAt !== expiresAt) write({ ...token, expiresAt, revoked: false });
      return { valid: true, expiresAt };
    },
    revoke(session: SessionIdentity) {
      const token = identity(session);
      if (token) write({ ...token, revoked: true });
    },
  };
}
