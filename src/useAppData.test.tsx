// @vitest-environment jsdom
import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialData } from './seed';
import type { AppData } from './types';

type Session = { access_token: string; user: { id: string; email: string } } | null;
type Result = { data: unknown; error: { message: string; code?: string } | null };
type Request = { operation: 'select' | 'insert' | 'update'; owner?: string; revision?: number; payload?: unknown; signal?: AbortSignal };

const fake = vi.hoisted(() => {
  const listeners = new Set<(event: string, session: Session) => void>();
  const state = {
    session: null as Session,
    requests: [] as Request[],
    respond: async (_request: Request): Promise<Result> => ({ data: null, error: null }),
  };
  const auth = {
    onAuthStateChange: vi.fn((listener: (event: string, session: Session) => void) => {
      listeners.add(listener);
      const sessionAtSubscription = state.session;
      queueMicrotask(() => listener('INITIAL_SESSION', sessionAtSubscription));
      return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
    }),
    getSession: vi.fn(async () => ({ data: { session: state.session }, error: null })),
    signInWithPassword: vi.fn(async () => ({ error: null })),
    signOut: vi.fn(async () => ({ error: null })),
  };
  const client = {
    auth,
    from: vi.fn(() => {
      const request: Request = { operation: 'select' };
      const query = {
        select: () => query,
        insert: (payload: { user_id: string; data: unknown }) => {
          request.operation = 'insert'; request.owner = payload.user_id; request.payload = payload.data; return query;
        },
        update: (payload: { data: unknown }) => { request.operation = 'update'; request.payload = payload.data; return query; },
        eq: (field: string, value: string | number) => {
          if (field === 'user_id') request.owner = String(value);
          if (field === 'revision') request.revision = Number(value);
          return query;
        },
        abortSignal: (signal: AbortSignal) => { request.signal = signal; return query; },
        maybeSingle: () => { state.requests.push(request); return state.respond(request); },
      };
      return query;
    }),
  };
  return {
    state, client, listeners,
    emit(session: Session, event = session ? 'SIGNED_IN' : 'SIGNED_OUT') {
      state.session = session;
      for (const listener of listeners) listener(event, session);
    },
  };
});

vi.mock('./supabase', async () => {
  const { createSessionPolicy } = await import('./authSession');
  return { configured: true, supabase: fake.client, supabaseConfigurationError: null,
    sessionPolicy: createSessionPolicy({
      getItem: key => localStorage.getItem(key),
      setItem: (key, value) => { try { localStorage.setItem(key, value); } catch { /* unavailable storage */ } },
    }),
  };
});
import { isAppData, useAppData } from './useAppData';
import { REMEMBER_SESSION_KEY, REMEMBER_SESSION_MS } from './authSession';
import { OWNER_AUTH_EMAIL } from './ownerAuth';

const GUEST = 'kall:diary:guest:v1';
const userKey = (id: string) => `kall:diary:${id}:v1`;
const account = (id: string, start = Date.now(), sessionId = `${id}-session`): Session => ({
  access_token: `header.${btoa(JSON.stringify({ sub: id, session_id: sessionId, iat: Math.floor(Date.now() / 1000), amr: [{ method: 'password', timestamp: Math.floor(start / 1000) }] }))}.signature`,
  user: { id, email: OWNER_AUTH_EMAIL },
});
const row = (data: AppData, revision = 1): Result => ({ data: { data, revision, updated_at: '2026-10-11T08:00:00Z' }, error: null });
const named = (name: string): AppData => ({ ...createInitialData(), profile: { ...createInitialData().profile, name } });
const cache = (data: AppData, revision: number | null = null, dirty = false) => JSON.stringify({ cacheVersion: 1, data, revision, dirty, updatedAt: null });
let root: Root;
let view: ReturnType<typeof useAppData>;

function Probe() { view = useAppData(); return null; }
async function flush() {
  await act(async () => { for (let index = 0; index < 10; index += 1) await Promise.resolve(); });
}
async function mount() { await act(async () => { root.render(<StrictMode><Probe /></StrictMode>); }); await flush(); }
function newRoot() {
  const element = document.createElement('div'); document.body.appendChild(element); root = createRoot(element);
}
async function debounce() { await act(async () => { await vi.advanceTimersByTimeAsync(750); }); }

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(new Date('2026-10-11T10:00:00Z'));
  vi.clearAllMocks();
  localStorage.clear();
  fake.listeners.clear();
  fake.state.session = null;
  fake.state.requests = [];
  fake.state.respond = async () => ({ data: null, error: null });
  fake.client.auth.signOut.mockImplementation(async () => { fake.emit(null); return { error: null }; });
  newRoot();
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useAppData lifecycle and ownership', () => {
  it('maps the fixed login to Supabase credentials and rejects other logins before any auth request', async () => {
    await mount();
    await expect(view.signIn('someone-else', 'test-only-secret')).rejects.toThrow('Неверный логин или пароль.');
    expect(fake.client.auth.signInWithPassword).not.toHaveBeenCalled();
    await act(async () => { await view.signIn(' EsForGary ', 'test-only-secret'); });
    expect(fake.client.auth.signInWithPassword).toHaveBeenCalledWith({ email: OWNER_AUTH_EMAIL, password: 'test-only-secret' });
    expect([...Object.values(localStorage)].join(' ')).not.toContain('test-only-secret');
  });

  it('rejects a valid Supabase session for another email before loading a diary', async () => {
    const foreign = account('another-user')!;
    foreign.user.email = 'other@example.test';
    fake.state.session = foreign;
    await mount();
    expect(view.authReady).toBe(true);
    expect(view.authenticated).toBe(false);
    expect(fake.state.requests).toHaveLength(0);
    expect(fake.client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('locks the diary and preserves existing guest data without exposing or editing it', async () => {
    localStorage.setItem(GUEST, cache(named('Старый гостевой дневник')));
    await mount();
    expect(fake.client.auth.onAuthStateChange).toHaveBeenCalledTimes(2);
    expect(fake.listeners.size).toBe(1);
    expect(view.authReady).toBe(true);
    expect(view.authenticated).toBe(false);
    expect(view.editable).toBe(false);
    await act(async () => { view.setData(current => ({ ...current, profile: { ...current.profile, name: 'Гость' } })); });
    expect(view.data.profile.name).not.toBe('Гость');
    expect(view.data.profile.name).not.toBe('Старый гостевой дневник');
    expect(JSON.parse(localStorage.getItem(GUEST)!).data.profile.name).toBe('Старый гостевой дневник');
    await debounce();
    expect(fake.state.requests).toHaveLength(0);
  });

  it('blocks edits and never uploads a seed snapshot while cloud hydration is pending', async () => {
    fake.state.session = account('alice');
    let finish!: (result: Result) => void;
    fake.state.respond = () => new Promise(resolve => { finish = resolve; });
    await mount();
    expect(view.authReady).toBe(false);
    expect(view.editable).toBe(false);
    await act(async () => { view.setData(named('Недопустимая правка')); });
    await debounce();
    expect(fake.state.requests.map(request => request.operation)).toEqual(['select']);
    expect(localStorage.getItem(userKey('alice'))).toBeNull();
    finish(row(named('Из облака'), 3));
    await flush();
    expect(view.data.profile.name).toBe('Из облака');
    expect(view.authReady).toBe(true);
    expect(view.editable).toBe(true);
    await debounce();
    expect(fake.state.requests.map(request => request.operation)).toEqual(['select']);
  });

  it('keeps guest and account caches separate and rejects a late response for the previous account', async () => {
    localStorage.setItem(GUEST, cache(named('Только гость')));
    fake.state.session = account('alice');
    let finishAlice!: (result: Result) => void;
    fake.state.respond = request => request.owner === 'alice'
      ? new Promise(resolve => { finishAlice = resolve; }) : Promise.resolve(row(named('Борис'), 5));
    await mount();
    expect(view.data.profile.name).not.toBe('Только гость');
    fake.emit(account('bob'));
    await flush();
    expect(view.user?.id).toBe('bob');
    expect(view.data.profile.name).toBe('Борис');
    expect(fake.state.requests[0].signal?.aborted).toBe(true);
    finishAlice(row(named('Алиса'), 2));
    await flush();
    expect(view.user?.id).toBe('bob');
    expect(view.data.profile.name).toBe('Борис');
    expect(JSON.parse(localStorage.getItem(GUEST)!).data.profile.name).toBe('Только гость');
    expect(localStorage.getItem(userKey('alice'))).toBeNull();
    expect(JSON.parse(localStorage.getItem(userKey('bob'))!).data.profile.name).toBe('Борис');
    expect(fake.state.requests.every(request => request.operation === 'select')).toBe(true);
  });

  it('does not overwrite a newer cloud revision and backs up local edits before choosing cloud', async () => {
    fake.state.session = account('alice');
    let remote = named('Исходная');
    let revision = 4;
    fake.state.respond = async request => request.operation === 'select' ? row(remote, revision) : { data: null, error: null };
    await mount();
    await act(async () => { view.setData(named('Мои изменения')); });
    remote = named('Другое устройство'); revision = 5;
    await debounce();
    expect(view.conflict).toBe(true);
    expect(view.data.profile.name).toBe('Мои изменения');
    expect(fake.state.requests.find(request => request.operation === 'update')?.revision).toBe(4);
    await act(async () => { view.retrySync(); }); await flush();
    expect(view.conflict).toBe(true);
    expect(fake.state.requests.filter(request => request.operation === 'update')).toHaveLength(1);
    await act(async () => { await view.useCloudVersion(); });
    expect(view.conflict).toBe(false);
    expect(view.data.profile.name).toBe('Другое устройство');
    expect(JSON.parse(localStorage.getItem(`${userKey('alice')}:conflict-backup`)!).profile.name).toBe('Мои изменения');
  });

  it('retains a failed cloud save in the personal cache and restores it after remount', async () => {
    fake.state.session = account('alice');
    fake.state.respond = async request => request.operation === 'select'
      ? row(named('Облако'), 2) : { data: null, error: { message: 'Failed to fetch' } };
    await mount();
    await act(async () => { view.setData(named('Офлайн-правка')); });
    await debounce();
    expect(view.syncStatus).toBe('Нет синхронизации');
    const saved = JSON.parse(localStorage.getItem(userKey('alice'))!);
    expect(saved.dirty).toBe(true);
    expect(saved.revision).toBe(2);
    expect(saved.data.profile.name).toBe('Офлайн-правка');
    await act(async () => { root.unmount(); });
    newRoot();
    await mount();
    expect(view.data.profile.name).toBe('Офлайн-правка');
    expect(view.editable).toBe(true);
  });

  it('backs up the exact malformed cache before its first replacement', async () => {
    fake.state.session = account('alice');
    localStorage.setItem(userKey('alice'), '{broken JSON');
    await mount();
    await act(async () => { view.setData(named('Восстановленный')); });
    const backupKey = Object.keys(localStorage).find(key => key.startsWith(`${userKey('alice')}:corrupt-backup:`));
    expect(backupKey).toBeDefined();
    expect(localStorage.getItem(backupKey!)).toBe('{broken JSON');
    expect(JSON.parse(localStorage.getItem(userKey('alice'))!).data.profile.name).toBe('Восстановленный');
  });

  it('preserves malformed source when storage cannot hold its backup', async () => {
    fake.state.session = account('alice');
    localStorage.setItem(userKey('alice'), '{broken JSON');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
    await mount();
    expect(localStorage.getItem(userKey('alice'))).toBe('{broken JSON');
    expect(view.error).toContain('Экспортируйте');
    expect(view.editable).toBe(false);
    vi.restoreAllMocks();
    await act(async () => { view.retrySync(); });
    await flush();
    expect(view.editable).toBe(true);
  });

  it('expires an open diary after 30 days and never renews that deadline on token refresh', async () => {
    const start = Date.now() - REMEMBER_SESSION_MS + 1500;
    fake.state.session = account('alice', start);
    await mount();
    const deadline = view.sessionExpiresAt;
    expect(view.authenticated).toBe(true);
    await act(async () => { fake.emit(account('alice', start), 'TOKEN_REFRESHED'); });
    expect(view.sessionExpiresAt).toBe(deadline);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(view.authenticated).toBe(false);
    expect(view.editable).toBe(false);
    expect(view.user).toBeNull();
    expect(fake.client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('rejects a restored expired session without reading any personal cloud data', async () => {
    fake.state.session = account('alice', Date.now() - REMEMBER_SESSION_MS);
    await mount();
    expect(view.authReady).toBe(true);
    expect(view.authenticated).toBe(false);
    expect(fake.state.requests).toHaveLength(0);
  });

  it('rechecks expiry on returning to a suspended tab before accepting edits', async () => {
    fake.state.session = account('alice');
    await mount();
    vi.setSystemTime(new Date(Date.now() + REMEMBER_SESSION_MS));
    await act(async () => { window.dispatchEvent(new Event('focus')); view.setData(named('Просроченная правка')); });
    expect(view.authenticated).toBe(false);
    expect(view.data.profile.name).not.toBe('Просроченная правка');
    expect(fake.state.requests.every(request => request.operation === 'select')).toBe(true);
  });

  it('keeps memory-only changes private until the same account logs in again after expiry', async () => {
    fake.state.session = account('alice', Date.now() - REMEMBER_SESSION_MS + 1000);
    await mount();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
    await act(async () => { view.setData(named('Несохранённые правки')); });
    vi.setSystemTime(new Date(Date.now() + 2000));
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(view.authenticated).toBe(false);
    expect(view.data.profile.name).not.toBe('Несохранённые правки');
    vi.restoreAllMocks();
    await act(async () => { fake.emit(account('alice', Date.now(), 'fresh-login')); });
    await flush();
    expect(view.authenticated).toBe(true);
    expect(view.data.profile.name).toBe('Несохранённые правки');
  });

  it('locks immediately on logout, keeps pending edits in the owner cache, and rejects that session after reload', async () => {
    const oldSession = account('alice');
    fake.state.session = oldSession;
    await mount();
    await act(async () => { view.setData(named('Правки перед выходом')); });
    let finishLogout!: () => void;
    fake.client.auth.signOut.mockImplementationOnce(() => new Promise(resolve => { finishLogout = () => resolve({ error: null }); }));
    let logout!: Promise<void>;
    await act(async () => { logout = view.signOut(); });
    expect(view.authenticated).toBe(false);
    expect(view.data.profile.name).not.toBe('Правки перед выходом');
    expect(JSON.parse(localStorage.getItem(userKey('alice'))!).data.profile.name).toBe('Правки перед выходом');
    expect(JSON.parse(localStorage.getItem(`${REMEMBER_SESSION_KEY}:alice:alice-session`)!).revoked).toBe(true);
    await act(async () => { finishLogout(); await logout; fake.emit(oldSession); });
    expect(view.authenticated).toBe(false);
    await act(async () => { fake.emit(account('bob', Date.now(), 'bob-new')); });
    await flush();
    expect(view.user?.id).toBe('bob');
    expect(view.data.profile.name).not.toBe('Правки перед выходом');
  });

  it('accepts only bounded raster data URLs in imported product images', () => {
    const data = createInitialData();
    for (const unsafe of ['https://example.test/image.jpg', 'javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz4=', `data:image/png;base64,${'A'.repeat(480000)}`]) {
      data.products[0].image = unsafe;
      expect(isAppData(data)).toBe(false);
    }
    for (const type of ['jpeg', 'png', 'webp']) {
      data.products[0].image = `data:image/${type};base64,aGVsbG8=`;
      expect(isAppData(data)).toBe(true);
    }
  });

  it('accepts an optional food product reference and rejects a non-string reference', () => {
    const data = createInitialData();
    const entry = {
      id: 'meal-1', date: '2026-10-11', meal: 'breakfast', name: 'Овсянка', grams: 100, emoji: '🥣',
      nutrients: { kcal: 100, protein: 3, fat: 2, carbs: 15, fiber: 2 },
    };
    expect(isAppData({ ...data, food: [entry] })).toBe(true);
    expect(isAppData({ ...data, food: [{ ...entry, productId: 'oats' }] })).toBe(true);
    expect(isAppData({ ...data, food: [{ ...entry, productId: 42 }] })).toBe(false);
    expect(isAppData({ ...data, food: [{ ...entry, iconCategory: 'sandwich-chicken' }] })).toBe(true);
    expect(isAppData({ ...data, food: [{ ...entry, iconCategory: 'invalid' }] })).toBe(false);
    expect(isAppData({ ...data, products: [{ ...data.products[0], iconCategory: 'cheese' }] })).toBe(true);
    expect(isAppData({ ...data, products: [{ ...data.products[0], iconCategory: 'invalid' }] })).toBe(false);
    expect(isAppData({ ...data, recipes: [{ id: 'recipe', name: 'Суп', emoji: '🥣', servings: 1, cookedWeight: 100, ingredients: [], iconCategory: 'soup' }] })).toBe(true);
    expect(isAppData({ ...data, recipes: [{ id: 'recipe', name: 'Суп', emoji: '🥣', servings: 1, cookedWeight: 100, ingredients: [], iconCategory: 'invalid' }] })).toBe(false);
  });
});
