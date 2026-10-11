import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import type { AppData } from './types';
import { createInitialData } from './seed';
import { configured, sessionPolicy, supabase, supabaseConfigurationError } from './supabase';
import { REMEMBER_SESSION_KEY } from './authSession';
import { isFoodIconCategory } from './foodCategories';
import { isOwnerEmail, resolveOwnerEmail } from './ownerAuth';
import { activityValidationError, isActivityKind } from './activity';
import type { WalkEntry } from './types';

interface Cache {
  cacheVersion: 1;
  data: AppData;
  revision: number | null;
  dirty: boolean;
  updatedAt: string | null;
}
interface ActiveDiary extends Cache {
  owner: string | null;
  hydrated: boolean;
  loading: boolean;
  editable: boolean;
  cached: boolean;
  conflicted: boolean;
  savedLocally: boolean;
  damagedSource: string | null;
  damagedBackupKey: string;
  recoveryBlocked: boolean;
  sequence: number;
  controller: AbortController;
}
interface CloudRow { data: unknown; revision: number; updated_at: string }
type Account = { id: string; email?: string } | null;
const GUEST_KEY = 'kall:diary:guest:v1';
const keyFor = (owner: string | null) => owner ? `kall:diary:${owner}:v1` : GUEST_KEY;
const conflictMessage = 'Дневник изменён на другом устройстве. Ваши правки сохранены локально. Экспортируйте их перед загрузкой облачной версии.';
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const text = (value: unknown): value is string => typeof value === 'string';
const image = (value: unknown) => value === undefined || (text(value) && value.length <= 480000
  && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value));
const nutrients = (value: unknown) => record(value) && ['kcal', 'protein', 'fat', 'carbs', 'fiber'].every(key => finite(value[key]) && value[key] >= 0);
const category = (value: unknown) => value === undefined || isFoodIconCategory(value);
const unitWeight = (value: unknown) => value === undefined || (finite(value) && value > 0 && value <= 5000);
const foodQuantity = (value: unknown) => value === undefined || (record(value)
  && (value.unit === 'serving' || value.unit === 'piece') && finite(value.amount) && value.amount > 0);
const themeColors = (value: unknown) => record(value)
  && ['accent', 'background', 'surface'].every(key => text(value[key]) && /^#[0-9a-fA-F]{6}$/.test(value[key]));
const listOf = (value: unknown, check: (item: Record<string, unknown>) => boolean) => Array.isArray(value) && value.every(item => record(item) && check(item));
const themePresets = (value: unknown) => {
  if (value === undefined) return true;
  const ids = new Set<string>();
  const names = new Set<string>();
  return listOf(value, item => {
    if (!text(item.id) || !item.id.trim() || !text(item.name) || !themeColors(item.colors)) return false;
    const name = item.name.trim().toLowerCase();
    if (!name || item.name.trim().length > 40 || ids.has(item.id) || names.has(name)) return false;
    ids.add(item.id);
    names.add(name);
    return true;
  });
};

/** Validate storage/imported JSON before the interface performs calculations on it. */
export function isAppData(value: unknown): value is AppData {
  if (!record(value) || value.version !== 1 || !record(value.profile) || !record(value.water)) return false;
  const p = value.profile;
  return text(p.name) && ['female', 'male'].includes(String(p.sex)) && ['lose', 'maintain'].includes(String(p.goal))
    && (value.theme === undefined || themeColors(value.theme)) && themePresets(value.themePresets)
    && typeof p.configured === 'boolean'
    && ['age', 'height', 'weight', 'targetWeight', 'activity', 'stepsGoal', 'stride'].every(key => finite(p[key]))
    && Object.values(value.water).every(amount => finite(amount) && amount >= 0)
    && listOf(value.products, item => text(item.id) && text(item.name) && text(item.category) && text(item.emoji) && nutrients(item)
      && image(item.image) && category(item.iconCategory) && (item.note === undefined || text(item.note))
      && unitWeight(item.servingGrams) && unitWeight(item.pieceGrams))
    && listOf(value.recipes, item => text(item.id) && text(item.name) && text(item.emoji) && finite(item.servings) && item.servings > 0
      && finite(item.cookedWeight) && item.cookedWeight >= 0 && category(item.iconCategory) && listOf(item.ingredients, ingredient => text(ingredient.productId) && finite(ingredient.grams) && ingredient.grams >= 0))
    && listOf(value.food, item => text(item.id) && text(item.name) && text(item.date) && text(item.emoji) && finite(item.grams) && item.grams >= 0
      && ['breakfast', 'lunch', 'dinner', 'snack'].includes(String(item.meal)) && nutrients(item.nutrients) && image(item.image) && category(item.iconCategory)
      && (item.productId === undefined || text(item.productId)) && foodQuantity(item.quantity))
    && listOf(value.walks, item => text(item.id) && text(item.date) && text(item.time) && ['easy', 'moderate', 'brisk'].includes(String(item.pace))
      && ['minutes', 'steps', 'distance', 'weight'].every(key => finite(item[key]) && item[key] >= 0)
      && (item.kind === undefined || (isActivityKind(item.kind) && activityValidationError(item as unknown as WalkEntry) === null)))
    && listOf(value.sleep, item => text(item.id) && text(item.date) && text(item.bedtime) && text(item.wakeTime) && finite(item.weight) && item.weight >= 0);
}

function loadCache(owner: string | null): { diary: ActiveDiary; error: string | null } {
  let cached: Cache | null = null;
  let error: string | null = null;
  let raw: string | null = null;
  let damagedSource: string | null = null;
  try {
    raw = owner ? window.localStorage.getItem(keyFor(owner)) : null;
  } catch {
    error = 'Хранилище браузера недоступно. Для сохранности данных используйте экспорт.';
  }
  try {
    if (raw !== null) {
      const value: unknown = JSON.parse(raw);
      if (!record(value) || value.cacheVersion !== 1 || !isAppData(value.data)
        || !(value.revision === null || (Number.isSafeInteger(value.revision) && Number(value.revision) > 0))
        || typeof value.dirty !== 'boolean' || !(value.updatedAt === null || text(value.updatedAt))) {
        throw new Error('Invalid diary cache');
      }
      cached = value as unknown as Cache;
    }
  } catch {
    damagedSource = raw;
    error = 'Локальная копия повреждена. Исходная запись сохранена; перед заменой будет создана резервная копия. Восстановите дневник из экспорта или облака.';
  }
  return {
    diary: {
      ...(cached ?? { cacheVersion: 1, data: createInitialData(), revision: null, dirty: false, updatedAt: null }),
      owner, hydrated: false, loading: false, editable: false, cached: Boolean(cached), conflicted: false,
      savedLocally: Boolean(cached), sequence: 0, controller: new AbortController(),
      damagedSource, damagedBackupKey: `${keyFor(owner)}:corrupt-backup:${Date.now()}`,
      recoveryBlocked: false,
    },
    error,
  };
}

function storeCache(diary: ActiveDiary): string | null {
  const cache: Cache = { cacheVersion: 1, data: diary.data, revision: diary.revision, dirty: diary.dirty, updatedAt: diary.updatedAt };
  try {
    if (diary.damagedSource !== null) {
      // Never replace malformed JSON until its exact source has a durable backup.
      window.localStorage.setItem(diary.damagedBackupKey, diary.damagedSource);
      diary.damagedSource = null;
    }
    window.localStorage.setItem(keyFor(diary.owner), JSON.stringify(cache));
    if (diary.recoveryBlocked) diary.editable = !diary.loading && (!diary.owner || diary.hydrated || diary.cached);
    diary.recoveryBlocked = false;
    diary.savedLocally = true;
    diary.cached = true;
    return null;
  } catch {
    if (diary.damagedSource !== null) { diary.recoveryBlocked = true; diary.editable = false; }
    diary.savedLocally = false;
    return 'Не удалось сохранить в браузере: хранилище заполнено или отключено. Экспортируйте дневник, пока эта вкладка открыта; уменьшите количество фото.';
  }
}

function errorText(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : record(cause) && text(cause.message) ? cause.message : 'Неизвестная ошибка';
  if (/Invalid login credentials/i.test(message)) return 'Неверный логин или пароль.';
  if (/Email not confirmed/i.test(message)) return 'Аккаунт ещё не активирован в Supabase.';
  if (/User already registered/i.test(message)) return 'Аккаунт с этим email уже зарегистрирован.';
  if (/signup.*disabled|signups.*allowed/i.test(message)) return 'Регистрация отключена. Войдите в существующий аккаунт.';
  if (/kall_diaries_size_limit/i.test(message)) return 'Дневник превысил облачный лимит 4 МБ. Экспортируйте данные и уменьшите количество фотографий.';
  if (/permission denied|row-level security/i.test(message)) return 'Нет доступа к дневнику. Проверьте вход в аккаунт и политики доступа из supabase/schema.sql.';
  if (/schema cache|relation .* does not exist/i.test(message)) return 'Таблица дневника пока не настроена. Выполните supabase/schema.sql в SQL Editor проекта Supabase и нажмите «Повторить». Другие таблицы не меняются.';
  if (/fetch|network|timeout/i.test(message)) return 'Нет соединения с облаком. Проверьте интернет и повторите синхронизацию.';
  return message;
}

export function useAppData() {
  const [initial] = useState(() => loadCache(null));
  const [data, setDataState] = useState(initial.diary.data);
  const [user, setUser] = useState<Account>(null);
  const [authReady, setAuthReady] = useState(!configured);
  const [canEdit, setCanEdit] = useState(false);
  const [authPending, setAuthPending] = useState(false);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<number | null>(null);
  const [syncStatus, setSyncStatus] = useState(configured ? 'Подключение…' : 'На устройстве');
  const [error, setError] = useState<string | null>(supabaseConfigurationError ?? initial.error);
  const [conflict, setConflict] = useState(false);
  const active = useRef(initial.diary);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveAction = useRef<() => Promise<void>>(async () => {});
  const loadAction = useRef<(discardLocal?: boolean) => Promise<void>>(async () => {});
  const inFlight = useRef<Promise<void> | null>(null);
  const authBusy = useRef(false);
  const initialized = useRef(!configured);
  const authorized = useRef<() => boolean>(() => false);
  const lockAccount = useRef<() => void>(() => {});
  const revocationInFlight = useRef<Promise<unknown> | null>(null);
  const unsavedAccounts = useRef(new Map<string, ActiveDiary>());

  const schedule = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { void saveAction.current(); }, 700);
  }, []);

  const setData: Dispatch<SetStateAction<AppData>> = useCallback(update => {
    const diary = active.current;
    if (!authorized.current() || !diary.owner || !initialized.current || authBusy.current || diary.loading || !diary.editable) {
      setError('Дождитесь загрузки дневника или повторите подключение к облаку.');
      return;
    }
    const next = typeof update === 'function' ? update(diary.data) : update;
    if (!isAppData(next)) { setError('Не удалось сохранить: данные дневника имеют неверный формат.'); return; }
    diary.data = next;
    diary.sequence += 1;
    diary.dirty = Boolean(diary.owner);
    setDataState(next);
    const storageError = storeCache(diary);
    setCanEdit(diary.editable);
    setError(storageError ?? (diary.conflicted ? conflictMessage : null));
    setSyncStatus(diary.owner ? (diary.conflicted ? 'Конфликт версий' : 'Есть изменения') : (storageError ? 'Не сохранено' : 'На устройстве'));
    if (diary.owner && diary.hydrated && !diary.conflicted) schedule();
  }, [schedule]);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let disposed = false;
    let identity: string | null | undefined;
    let currentSession: Session | null = null;
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    let rejectedToken: string | null = null;
    const current = (diary: ActiveDiary) => !disposed && active.current === diary && !diary.controller.signal.aborted && authorized.current();
    const markConflict = (diary: ActiveDiary) => {
      diary.conflicted = true;
      diary.hydrated = true;
      diary.editable = true;
      setCanEdit(!diary.loading);
      setConflict(true);
      setSyncStatus('Конфликт версий');
      const storageError = storeCache(diary);
      setCanEdit(diary.editable && !diary.loading);
      setError(storageError ? `${storageError} Есть конфликт с облачной версией.` : conflictMessage);
    };

    const save = async (): Promise<void> => {
      const diary = active.current;
      if (!current(diary) || !diary.owner || !diary.hydrated || diary.loading || !diary.dirty || diary.conflicted) return;
      if (inFlight.current) { await inFlight.current; if (current(diary) && diary.dirty) schedule(); return; }
      const payload = diary.data;
      const sequence = diary.sequence;
      const revision = diary.revision;
      setSyncStatus('Сохранение…');
      const operation = (async () => {
        try {
          const query = revision === null
            ? client.from('kall_diaries').insert({ user_id: diary.owner, data: payload }).select('revision,updated_at')
            : client.from('kall_diaries').update({ data: payload }).eq('user_id', diary.owner).eq('revision', revision).select('revision,updated_at');
          const result = await query.abortSignal(diary.controller.signal).maybeSingle();
          if (!current(diary)) return;
          if (result.error?.code === '23505' || (!result.error && !result.data)) { markConflict(diary); return; }
          if (result.error) throw result.error;
          if (!result.data || !Number.isSafeInteger(result.data.revision)) throw new Error('Облако вернуло неверную версию дневника. Проверьте SQL-схему.');
          diary.revision = Number(result.data.revision);
          diary.updatedAt = String(result.data.updated_at);
          diary.dirty = diary.sequence !== sequence;
          const storageError = storeCache(diary);
          setError(storageError);
          setSyncStatus(diary.dirty ? 'Есть изменения' : 'В облаке');
          if (diary.dirty) schedule();
        } catch (cause) {
          if (!current(diary)) return;
          setError(`${errorText(cause)} ${diary.savedLocally ? 'Правки сохранены на этом устройстве.' : 'Правки остаются только в открытой вкладке. Экспортируйте дневник.'}`);
          setSyncStatus('Нет синхронизации');
        }
      })();
      inFlight.current = operation;
      await operation;
      if (inFlight.current === operation) inFlight.current = null;
    };

    const hydrate = async (discardLocal = false): Promise<void> => {
      const diary = active.current;
      if (!current(diary) || !diary.owner || diary.loading) return;
      // Block edits throughout the read so a late response cannot replace a new edit.
      diary.loading = true;
      diary.editable = false;
      setCanEdit(false);
      clearTimeout(timer.current);
      setSyncStatus('Загрузка…');
      try {
        if (inFlight.current) await inFlight.current;
        if (!current(diary)) return;
        diary.hydrated = false;
        const { data: result, error: loadError } = await client.from('kall_diaries')
          .select('data,revision,updated_at').eq('user_id', diary.owner).abortSignal(diary.controller.signal).maybeSingle();
        if (!current(diary)) return;
        if (loadError) throw loadError;
        const row = result as CloudRow | null;
        if (row && (!isAppData(row.data) || !Number.isSafeInteger(row.revision) || row.revision < 1)) {
          throw new Error('Облачный дневник имеет неподдерживаемый формат. Локальная копия сохранена.');
        }
        if (diary.dirty && !discardLocal && diary.revision !== (row?.revision ?? null)) { markConflict(diary); return; }
        if (discardLocal && diary.dirty) {
          // Keep one recoverable copy; never discard edits if the backup cannot be stored.
          try { window.localStorage.setItem(`${keyFor(diary.owner)}:conflict-backup`, JSON.stringify(diary.data)); }
          catch { throw new Error('Не удалось создать резервную копию. Сначала экспортируйте данные и освободите хранилище браузера.'); }
        }
        if (!diary.dirty || discardLocal) {
          diary.data = row ? row.data as AppData : createInitialData();
          diary.revision = row?.revision ?? null;
          diary.updatedAt = row?.updated_at ?? null;
          diary.dirty = false;
          setDataState(diary.data);
        }
        diary.hydrated = true;
        diary.editable = true;
        setCanEdit(true);
        diary.conflicted = false;
        setConflict(false);
        setError(storeCache(diary));
        setSyncStatus(diary.dirty ? 'Есть изменения' : 'В облаке');
        if (diary.dirty) schedule();
      } catch (cause) {
        if (!current(diary)) return;
        diary.editable = diary.cached;
        setCanEdit(diary.editable);
        setError(errorText(cause));
        setSyncStatus('Нет синхронизации');
      } finally {
        if (current(diary)) {
          diary.loading = false;
          setCanEdit(diary.editable);
          initialized.current = true;
          setAuthReady(true);
        }
      }
    };

    const changeAccount = (account: User | null) => {
      if (disposed) return;
      const id = account?.id ?? null;
      if (identity === id) { setUser(account ? { id: account.id, email: account.email } : null); return; }
      identity = id;
      clearTimeout(timer.current);
      if (active.current.owner && !active.current.savedLocally && active.current.sequence > 0) {
        unsavedAccounts.current.set(active.current.owner, active.current);
      }
      active.current.controller.abort();
      inFlight.current = null;
      initialized.current = false;
      setCanEdit(false);
      setAuthReady(false);
      const pending = id ? unsavedAccounts.current.get(id) : undefined;
      const loaded = pending ? {
        diary: { ...pending, hydrated: false, loading: false, editable: false, controller: new AbortController() },
        error: 'Восстановлены правки из открытой вкладки. Сохраните резервную копию дневника.',
      } : loadCache(id);
      if (id) unsavedAccounts.current.delete(id);
      active.current = loaded.diary;
      setDataState(loaded.diary.data);
      setUser(account ? { id: account.id, email: account.email } : null);
      setConflict(false);
      setError(loaded.error);
      if (account) { void hydrate(); }
      else {
        initialized.current = true;
        setCanEdit(false);
        setAuthReady(true);
        setSyncStatus('Нужен вход');
      }
    };

    const lock = () => {
      clearTimeout(expiryTimer);
      const previous = currentSession;
      currentSession = null;
      if (previous) sessionPolicy.revoke(previous);
      setSessionExpiresAt(null);
      changeAccount(null);
    };
    const reject = (session: Session, reason: string) => {
      lock();
      setError(reason === 'expired' ? 'Прошло 30 дней после входа. Войдите снова.'
        : reason === 'owner' ? 'Неверный логин или пароль.' : 'Войдите в аккаунт, чтобы открыть дневник.');
      if (rejectedToken === session.access_token) return;
      rejectedToken = session.access_token;
      // Lock immediately even offline. The remembered revocation prevents restoring this token after reload.
      sessionPolicy.revoke(session);
      const revoke = client.auth.signOut({ scope: 'local' }).catch(() => {});
      revocationInFlight.current = revoke;
      void revoke.finally(() => { if (revocationInFlight.current === revoke) revocationInFlight.current = null; });
    };
    const verify = () => {
      if (disposed || !currentSession) return false;
      const checked = sessionPolicy.check(currentSession);
      if (!checked.valid) { reject(currentSession, checked.reason); return false; }
      return true;
    };
    const armExpiry = () => {
      clearTimeout(expiryTimer);
      if (!verify() || !currentSession) return;
      const checked = sessionPolicy.check(currentSession);
      if (checked.valid) expiryTimer = setTimeout(armExpiry, Math.min(checked.expiresAt - Date.now(), 24 * 60 * 60 * 1000));
    };
    const changeSession = (session: Session | null) => {
      if (disposed) return;
      if (!session) { lock(); return; }
      if (!isOwnerEmail(session.user.email)) { reject(session, 'owner'); return; }
      const checked = sessionPolicy.check(session);
      if (!checked.valid) { reject(session, checked.reason); return; }
      rejectedToken = null;
      currentSession = session;
      setSessionExpiresAt(checked.expiresAt);
      changeAccount(session.user);
      armExpiry();
    };
    authorized.current = verify;
    lockAccount.current = lock;

    saveAction.current = save;
    loadAction.current = hydrate;
    const { data: subscription } = client.auth.onAuthStateChange((_event, session) => {
      // Supabase callbacks must return before another auth/database request starts.
      queueMicrotask(() => changeSession(session));
    });
    void client.auth.getSession().then(({ data: sessionData, error: sessionError }) => {
      if (disposed) return;
      if (sessionError) { setError(errorText(sessionError)); setAuthReady(true); return; }
      if (identity === undefined) changeSession(sessionData.session);
    }).catch(cause => { if (!disposed) { setError(errorText(cause)); setAuthReady(true); } });
    const reconnect = () => {
      if (verify() && active.current.owner && !active.current.conflicted && !authBusy.current) {
        if (active.current.hydrated) void save(); else void hydrate();
      }
    };
    const sessionStorageChanged = (event: StorageEvent) => {
      if (event.key === null || event.key.startsWith(REMEMBER_SESSION_KEY)) armExpiry();
    };
    window.addEventListener('online', reconnect);
    window.addEventListener('focus', armExpiry);
    window.addEventListener('storage', sessionStorageChanged);
    document.addEventListener('visibilitychange', armExpiry);
    return () => {
      disposed = true;
      clearTimeout(timer.current);
      clearTimeout(expiryTimer);
      active.current.controller.abort();
      subscription.subscription.unsubscribe();
      window.removeEventListener('online', reconnect);
      window.removeEventListener('focus', armExpiry);
      window.removeEventListener('storage', sessionStorageChanged);
      document.removeEventListener('visibilitychange', armExpiry);
    };
  }, [schedule]);

  useEffect(() => {
    const warnUnsaved = (event: BeforeUnloadEvent) => {
      if ((!active.current.savedLocally && active.current.sequence > 0) || unsavedAccounts.current.size > 0) {
        event.preventDefault(); event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warnUnsaved);
    return () => window.removeEventListener('beforeunload', warnUnsaved);
  }, []);

  const signIn = useCallback(async (login: string, password: string): Promise<void> => {
    if (!supabase) throw new Error('Сначала настройте подключение к Supabase.');
    if (authBusy.current) throw new Error('Дождитесь завершения входа или выхода.');
    if (active.current.owner) throw new Error('Сначала выйдите из текущего аккаунта.');
    if (active.current.sequence > 0 && !active.current.savedLocally) throw new Error('Локальные правки не сохранены. Экспортируйте дневник перед входом.');
    const email = resolveOwnerEmail(login);
    authBusy.current = true;
    setAuthPending(true);
    try {
      if (revocationInFlight.current) await revocationInFlight.current;
      const result = await supabase.auth.signInWithPassword({ email, password });
      if (result.error) throw new Error(errorText(result.error));
    } finally { authBusy.current = false; setAuthPending(false); }
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    if (!supabase) return;
    if (authBusy.current) throw new Error('Дождитесь завершения входа или выхода.');
    authBusy.current = true;
    setAuthPending(true);
    clearTimeout(timer.current);
    try {
      if (active.current.dirty && !active.current.savedLocally) throw new Error('Правки не сохранены. Экспортируйте дневник перед выходом.');
      // Every edit is already cached under its account. Hide and abort immediately;
      // remaining local edits are synchronized on the next login to this account.
      lockAccount.current();
      const result = await supabase.auth.signOut({ scope: 'local' });
      if (result.error) throw new Error(errorText(result.error));
    } finally { authBusy.current = false; setAuthPending(false); }
  }, []);

  const retrySync = useCallback(() => {
    if (authBusy.current || !authorized.current() || !active.current.owner) return;
    if (active.current.recoveryBlocked) {
      setError(storeCache(active.current));
      setCanEdit(active.current.editable);
      if (active.current.recoveryBlocked) return;
    }
    if (!active.current.hydrated || active.current.conflicted) void loadAction.current();
    else void saveAction.current();
  }, []);
  const useCloudVersion = useCallback(async () => {
    if (!active.current.conflicted || authBusy.current) return;
    await loadAction.current(true);
  }, []);

  return { data, setData, user, authReady, authPending, authenticated: Boolean(user), sessionExpiresAt, editable: Boolean(user) && canEdit && authReady && !authPending, configured, syncStatus, error, signIn, signOut, retrySync, conflict, useCloudVersion };
}
