import type { Session } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSessionPolicy, REMEMBER_SESSION_KEY, REMEMBER_SESSION_MS } from './authSession';

const now = new Date('2026-10-11T10:00:00Z').getTime();
const token = (userId = 'alice', sessionId = 'session-a', authenticatedAt = now, overrides = {}) => ({
  user: { id: userId },
  access_token: `header.${btoa(JSON.stringify({ sub: userId, session_id: sessionId, iat: now / 1000, amr: [{ method: 'password', timestamp: authenticatedAt / 1000 }], ...overrides }))}.signature`,
}) as Session;
const setup = () => {
  const entries = new Map<string, string>();
  const storage = { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); } };
  return { entries, storage, policy: createSessionPolicy(storage) };
};

describe('30-day account-bound browser sessions', () => {
  it('restores the same deadline across reload and refreshed tokens, even if AMR changes', () => {
    const { storage, policy } = setup();
    expect(policy.check(token(), now)).toEqual({ valid: true, expiresAt: now + REMEMBER_SESSION_MS });
    const reload = createSessionPolicy(storage);
    expect(reload.check(token('alice', 'session-a', now + 100000), now + 100000))
      .toEqual({ valid: true, expiresAt: now + REMEMBER_SESSION_MS });
    expect(reload.check(token(), now + REMEMBER_SESSION_MS)).toEqual({ valid: false, reason: 'expired' });
  });

  it('binds each lease to both the account and session, and allows a new credential login after logout', () => {
    const { policy } = setup();
    policy.check(token(), now);
    policy.revoke(token());
    expect(policy.check(token(), now)).toEqual({ valid: false, reason: 'revoked' });
    expect(policy.check(token('alice', 'new-session'), now)).toEqual({ valid: true, expiresAt: now + REMEMBER_SESSION_MS });
    expect(policy.check(token('bob', 'session-b', now + 1000), now + 1000))
      .toEqual({ valid: true, expiresAt: now + 1000 + REMEMBER_SESSION_MS });
    expect(policy.check(token(), now)).toEqual({ valid: false, reason: 'revoked' });
  });

  it('uses original authentication time rather than refreshed iat or a new 30 days after clearing app storage', () => {
    const { policy, entries } = setup();
    const old = now - REMEMBER_SESSION_MS;
    expect(policy.check(token('alice', 'session-a', old, { iat: now / 1000 }), now)).toEqual({ valid: false, reason: 'expired' });
    entries.set(`${REMEMBER_SESSION_KEY}:alice:session-a`, '{corrupt');
    expect(policy.check(token('alice', 'session-a', old), now)).toEqual({ valid: false, reason: 'expired' });
  });

  it('rejects a mismatched account, missing authentication timestamp, or future authentication', () => {
    const { policy } = setup();
    for (const invalid of [token('alice', 's', now, { sub: 'bob' }), token('alice', 's', now, { amr: [] }), token('alice', 's', now + 3600000)]) {
      expect(policy.check(invalid, now)).toEqual({ valid: false, reason: 'invalid' });
    }
  });
});
