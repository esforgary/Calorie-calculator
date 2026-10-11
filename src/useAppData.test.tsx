// @vitest-environment jsdom
import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialData } from './seed';
import type { AppData } from './types';

type Session = { user: { id: string; email: string } } | null;
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
    signUp: vi.fn(async () => ({ data: { session: null }, error: null })),
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
    emit(session: Session) {
      state.session = session;
      for (const listener of listeners) listener(session ? 'SIGNED_IN' : 'SIGNED_OUT', session);
    },
  };
});

vi.mock('./supabase', () => ({ configured: true, supabase: fake.client, supabaseConfigurationError: null }));
import { isAppData, useAppData } from './useAppData';

const GUEST = 'kall:diary:guest:v1';
const userKey = (id: string) => `kall:diary:${id}:v1`;
const account = (id: string): Session => ({ user: { id, email: `${id}@example.test` } });
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
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.clearAllMocks();
  localStorage.clear();
  fake.listeners.clear();
  fake.state.session = null;
  fake.state.requests = [];
  fake.state.respond = async () => ({ data: null, error: null });
  newRoot();
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useAppData lifecycle and ownership', () => {
  it('allows durable guest edits after configured auth initializes under StrictMode', async () => {
    await mount();
    expect(fake.client.auth.onAuthStateChange).toHaveBeenCalledTimes(2);
    expect(fake.listeners.size).toBe(1);
    expect(view.authReady).toBe(true);
    expect(view.editable).toBe(true);
    await act(async () => { view.setData(current => ({ ...current, profile: { ...current.profile, name: 'Гость' } })); });
    expect(view.data.profile.name).toBe('Гость');
    expect(JSON.parse(localStorage.getItem(GUEST)!).data.profile.name).toBe('Гость');
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
    localStorage.setItem(GUEST, '{broken JSON');
    await mount();
    expect(localStorage.getItem(GUEST)).toBe('{broken JSON');
    await act(async () => { view.setData(named('Восстановленный')); });
    const backupKey = Object.keys(localStorage).find(key => key.startsWith(`${GUEST}:corrupt-backup:`));
    expect(backupKey).toBeDefined();
    expect(localStorage.getItem(backupKey!)).toBe('{broken JSON');
    expect(JSON.parse(localStorage.getItem(GUEST)!).data.profile.name).toBe('Восстановленный');
  });

  it('preserves malformed source when storage cannot hold its backup', async () => {
    localStorage.setItem(GUEST, '{broken JSON');
    await mount();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
    await act(async () => { view.setData(named('В памяти')); });
    expect(localStorage.getItem(GUEST)).toBe('{broken JSON');
    expect(view.error).toContain('Экспортируйте');
    expect(view.editable).toBe(false);
    vi.restoreAllMocks();
    await act(async () => { view.retrySync(); });
    expect(view.editable).toBe(true);
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
  });
});
