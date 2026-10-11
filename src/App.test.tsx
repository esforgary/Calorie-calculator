// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { createInitialData } from './seed';
import { today } from './nutrition';
import { useAppData } from './useAppData';

vi.mock('./useAppData', () => ({ useAppData: vi.fn(), isAppData: vi.fn() }));

type Store = ReturnType<typeof useAppData>;
let root: Root;
let container: HTMLDivElement;
let store: Store;

function accountStore(id = 'alice'): Store {
  const data = createInitialData();
  data.profile = { ...data.profile, configured: true, name: `Профиль ${id}` };
  data.food = [{
    id: 'private-entry', name: `Личная запись ${id}`, date: today(), meal: 'breakfast',
    grams: 100, emoji: '', nutrients: { kcal: 100, protein: 5, fat: 4, carbs: 11, fiber: 1 },
  }];
  return {
    data, setData: vi.fn(),
    user: { id, email: `${id}@example.test` },
    authReady: true, authPending: false, authenticated: true, editable: true,
    sessionExpiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    configured: true, syncStatus: 'Сохранено', error: null, conflict: false,
    signIn: vi.fn(async () => {}), signUp: vi.fn(async () => ''), signOut: vi.fn(async () => {}),
    retrySync: vi.fn(), useCloudVersion: vi.fn(async () => {}),
  };
}

async function render() {
  vi.mocked(useAppData).mockReturnValue(store);
  await act(async () => { root.render(<App />); });
}

async function click(selector: string) {
  const element = container.querySelector<HTMLButtonElement>(selector);
  expect(element, `Expected button ${selector}`).not.toBeNull();
  await act(async () => { element!.click(); });
}

async function clickText(text: string) {
  const element = [...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === text);
  expect(element, `Expected button ${text}`).toBeDefined();
  await act(async () => { element!.click(); });
}

function expectLocked() {
  expect(container.querySelector('h1')?.textContent).toBe('Вход в аккаунт');
  expect(container.querySelector('nav')).toBeNull();
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(container.querySelector('[aria-label="Выбрать дату дневника"]')).toBeNull();
  expect(container.querySelector('input[autocomplete="given-name"]')).toBeNull();
  expect(container.textContent).not.toContain('Личная запись');
  expect(container.textContent).not.toContain('alice@example.test');
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  store = accountStore();
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  vi.restoreAllMocks();
});

describe('App authentication boundary', () => {
  it('does not expose an existing diary while the session is being checked', async () => {
    store.authReady = false;
    await render();
    expectLocked();
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Проверка сессии…');
    expect(container.querySelector('form')).toBeNull();
  });

  it('only renders the login screen for an unauthenticated person even if diary data remains in memory', async () => {
    store = { ...store, user: null, authenticated: false, editable: false };
    await render();
    expectLocked();
    expect(container.querySelector('input[type="email"]')).not.toBeNull();
    expect(container.querySelector('input[type="password"]')).not.toBeNull();
  });

  it('renders the account diary once authentication is ready', async () => {
    await render();
    expect(container.querySelector('h1')?.textContent).toBe('Дневник питания');
    expect(container.querySelector('nav[aria-label="Главная навигация"]')).not.toBeNull();
    expect(container.textContent).toContain('Личная запись alice');
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(container.textContent).not.toContain('Хорошего дня');
  });

  it('closes a private dialog immediately when authentication is revoked and does not restore it on login', async () => {
    await render();
    await click('[aria-label="Добавить еду: Завтрак"]');
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.body.style.overflow).toBe('hidden');
    store = { ...store, user: null, authenticated: false, editable: false };
    await render();
    expectLocked();
    expect(document.body.style.overflow).not.toBe('hidden');

    store = accountStore();
    await render();
    expect(container.querySelector('h1')?.textContent).toBe('Дневник питания');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('hides the account profile when logout completes', async () => {
    const signOut = store.signOut;
    await render();
    await click('[aria-label="Профиль и цели"]');
    expect(container.querySelector<HTMLInputElement>('input[autocomplete="given-name"]')?.value).toBe('Профиль alice');
    expect(container.textContent).toContain('alice@example.test');
    await clickText('Выйти из аккаунта');
    await clickText('Подтвердить');
    expect(signOut).toHaveBeenCalledOnce();

    store = { ...store, user: null, authenticated: false, editable: false };
    await render();
    expectLocked();
  });

  it('resets account-specific views and profile fields when the active account changes', async () => {
    await render();
    await click('[aria-label="Профиль и цели"]');
    expect(container.querySelector<HTMLInputElement>('input[autocomplete="given-name"]')?.value).toBe('Профиль alice');

    store = accountStore('bob');
    await render();
    expect(container.querySelector('h1')?.textContent).toBe('Дневник питания');
    expect(container.textContent).not.toContain('Личная запись alice');
    expect(container.textContent).toContain('Личная запись bob');
    await click('[aria-label="Профиль и цели"]');
    expect(container.querySelector<HTMLInputElement>('input[autocomplete="given-name"]')?.value).toBe('Профиль bob');
    expect(container.textContent).not.toContain('alice@example.test');
    expect(container.textContent).toContain('bob@example.test');
  });
});
