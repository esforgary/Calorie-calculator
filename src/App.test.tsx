// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { createInitialData } from './seed';
import { today } from './nutrition';
import { useAppData } from './useAppData';
import { DEFAULT_THEME, THEME_STORAGE_KEY } from './theme';

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
    signIn: vi.fn(async () => {}), signOut: vi.fn(async () => {}),
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
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  store = accountStore();
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('App authentication boundary', () => {
  it('shows macro composition without a configured calorie target and keeps it when a target is added', async () => {
    store.data.profile.configured = false;
    store.data.food[0].nutrients = { kcal: 403, protein: 14, fat: 7, carbs: 65, fiber: 0 };
    await render();
    const segments = () => [...container.querySelectorAll('.macro-ring-segment')].map(segment => ({
      macro: segment.getAttribute('data-macro'), dash: segment.getAttribute('stroke-dasharray'),
    }));
    expect(segments().map(segment => segment.macro)).toEqual(['protein', 'fat', 'carbs']);
    const before = segments();
    expect(container.querySelector('.ring-label strong')?.textContent).toBe('403');
    const meters = [...container.querySelectorAll<HTMLElement>('.macro [role="meter"]')];
    expect(meters).toHaveLength(3);
    expect(meters.map(meter => Number(meter.getAttribute('aria-valuenow')))).toEqual(expect.arrayContaining([
      expect.closeTo(56 / 379 * 100), expect.closeTo(63 / 379 * 100), expect.closeTo(260 / 379 * 100),
    ]));
    for (const meter of meters) expect(meter.getAttribute('aria-label')).toContain('доля энергии БЖУ');
    store.data.profile.configured = true;
    await render();
    expect(segments()).toEqual(before);
    for (const meter of container.querySelectorAll('.macro [role="meter"]')) expect(meter.getAttribute('aria-label')).toContain('доля дневной цели');
  });

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
    expect(container.querySelector('input[autocomplete="username"]')).not.toBeNull();
    expect(container.querySelector('input[type="email"]')).toBeNull();
    expect(container.textContent).not.toContain('Создать аккаунт');
    expect(container.textContent).not.toContain('Зарегистрироваться');
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
    await clickText('Аккаунт и данные');
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
    await clickText('Аккаунт и данные');
    expect(container.textContent).not.toContain('alice@example.test');
    expect(container.textContent).toContain('bob@example.test');
  });
});

describe('Application appearance across authentication', () => {
  const rememberedTheme = { accent: '#73b3ff', background: '#101c29', surface: '#d3dce5' };
  const accountTheme = { accent: '#ffc17d', background: '#211b19', surface: '#fff5e8' };

  function expectAppearance(theme: typeof rememberedTheme) {
    const style = document.documentElement.style;
    expect(style.getPropertyValue('--accent')).toBe(theme.accent);
    expect(style.getPropertyValue('--app-background')).toBe(theme.background);
    expect(style.getPropertyValue('--surface')).toBe(theme.surface);
  }

  it('uses remembered colors during session checking, updates them on login and retains them after logout', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(rememberedTheme));
    store = { ...store, user: null, authReady: false, authenticated: false, editable: false };
    store.data.theme = accountTheme;
    await render();

    expectAppearance(rememberedTheme);
    expectLocked();
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Проверка сессии…');
    expect(container.querySelector('form')).toBeNull();
    expect(JSON.parse(localStorage.getItem(THEME_STORAGE_KEY)!)).toEqual(rememberedTheme);

    store = accountStore();
    store.data.theme = accountTheme;
    await render();
    expectAppearance(accountTheme);
    expect(container.querySelector('h1')?.textContent).toBe('Дневник питания');
    expect(JSON.parse(localStorage.getItem(THEME_STORAGE_KEY)!)).toEqual(accountTheme);

    store = { ...store, user: null, authenticated: false, editable: false };
    await render();
    expectAppearance(accountTheme);
    expectLocked();
    expect(container.querySelector('input[type="password"]')).not.toBeNull();
    expect(JSON.parse(localStorage.getItem(THEME_STORAGE_KEY)!)).toEqual(accountTheme);
  });

  it('replaces remembered colors with defaults for a ready account without a custom theme', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(rememberedTheme));
    store = { ...store, authReady: false, authenticated: false, editable: false };
    await render();
    expectAppearance(rememberedTheme);
    expectLocked();

    store = accountStore();
    delete store.data.theme;
    await render();
    expectAppearance(DEFAULT_THEME);
    expect(container.querySelector('h1')?.textContent).toBe('Дневник питания');
    expect(JSON.parse(localStorage.getItem(THEME_STORAGE_KEY)!)).toEqual(DEFAULT_THEME);
  });
});

describe('Activity navigation', () => {
  it('opens the activity form without routing an unconfigured profile into settings', async () => {
    store.data.profile.configured = false;
    await render();
    await clickText('Активность');
    await clickText('Записать');
    expect(container.querySelector('h1')?.textContent).toBe('Активность');
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.querySelector('h2')?.textContent).toBe('Записать активность');
    expect(dialog?.querySelector('.activity-form')).not.toBeNull();
    const weight = [...dialog!.querySelectorAll('label')].find(label => label.querySelector('span')?.textContent === 'Ваш вес, кг')?.querySelector('input');
    expect(weight?.value).toBe('');
    expect(container.querySelector('input[autocomplete="given-name"]')).toBeNull();
    expect(container.querySelector('[aria-label="Разделы настроек"]')).toBeNull();
  });

  it('starts the form with the sport selected in the activity launcher', async () => {
    await render();
    await clickText('Активность');
    await clickText('Велосипед');
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog?.querySelector('.activity-type[aria-pressed="true"]')?.textContent).toBe('Велосипед');
    expect(dialog?.querySelectorAll('.activity-type[aria-pressed="true"]')).toHaveLength(1);
    expect(dialog?.textContent).not.toContain('Шаги, если считали');
    expect(container.querySelector('h1')?.textContent).toBe('Активность');
  });
});

describe('Catalog deletion', () => {
  function savedData() {
    expect(store.setData).toHaveBeenCalledOnce();
    const update = vi.mocked(store.setData).mock.calls[0][0];
    return typeof update === 'function' ? update(store.data) : update;
  }

  it('allows deleting a default product only after confirmation while preserving diary history', async () => {
    const product = store.data.products[0];
    expect(product.custom).not.toBe(true);
    store.data.food[0] = { ...store.data.food[0], productId: product.id, name: product.name };
    const history = structuredClone(store.data.food);
    const remainingProducts = store.data.products.filter(item => item.id !== product.id);
    await render();
    await clickText('Продукты');
    await click(`[aria-label="Удалить ${product.name}"]`);

    expect(container.querySelector('[role="dialog"]')?.textContent).toContain(product.name);
    expect(store.setData).not.toHaveBeenCalled();
    await clickText('Отмена');
    expect(store.setData).not.toHaveBeenCalled();
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    await click(`[aria-label="Удалить ${product.name}"]`);
    await clickText('Подтвердить');
    const next = savedData();
    expect(next.products).toEqual(remainingProducts);
    expect(next.food).toEqual(history);
    expect(store.data.products).toContain(product);
  });

  it('keeps a product that is still used as a recipe ingredient', async () => {
    const product = store.data.products[0];
    store.data.recipes = [{
      id: 'linked-recipe', name: 'Каша', ingredients: [{ productId: product.id, grams: 40 }],
      servings: 1, cookedWeight: 120, emoji: '',
    }];
    await render();
    await clickText('Продукты');
    await click(`[aria-label="Удалить ${product.name}"]`);

    expect(container.textContent).toContain('Продукт используется в рецепте. Сначала измените рецепт.');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(store.setData).not.toHaveBeenCalled();
  });

  it('deletes only the confirmed recipe and preserves ingredients and logged nutrition', async () => {
    const product = store.data.products[0];
    const recipe = {
      id: 'recipe-to-delete', name: 'Каша на завтрак',
      ingredients: [{ productId: product.id, grams: 40 }], servings: 1, cookedWeight: 120, emoji: '',
    };
    const otherRecipe = { ...recipe, id: 'other-recipe', name: 'Другая каша' };
    store.data.recipes = [recipe, otherRecipe];
    store.data.food[0] = { ...store.data.food[0], productId: recipe.id, name: recipe.name };
    const history = structuredClone(store.data.food);
    const products = structuredClone(store.data.products);
    await render();
    await clickText('Мои рецепты');
    await click(`[aria-label="Удалить рецепт ${recipe.name}"]`);
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain(recipe.name);
    expect(store.setData).not.toHaveBeenCalled();
    await clickText('Подтвердить');

    const next = savedData();
    expect(next.recipes).toEqual([otherRecipe]);
    expect(next.products).toEqual(products);
    expect(next.food).toEqual(history);
  });
});
