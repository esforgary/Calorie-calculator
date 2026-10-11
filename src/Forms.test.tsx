// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FoodForm, ProductForm, SleepForm } from "./Forms";
import { createInitialData } from "./seed";
import type { FoodEntry, Product, SleepEntry } from "./types";

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const portionProduct: Product = { id: 'portion-product', name: 'Сыр', category: 'Сыр', emoji: '', kcal: 200, protein: 10, fat: 5, carbs: 30, fiber: 2, servingGrams: 40, pieceGrams: 25 };
async function changeInput(label: string, value: string) {
  const field = [...container.querySelectorAll('label')].find(field => field.querySelector('span')?.textContent === label);
  const input = field?.querySelector('input');
  expect(input, label).toBeTruthy();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input!.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function clickText(text: string) {
  const button = [...container.querySelectorAll('button')].find(button => button.textContent === text);
  expect(button, text).toBeTruthy();
  await act(async () => button!.click());
}
async function submitForm() {
  await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
}

describe('Product portions', () => {
  it('previews a 40g serving and a piece, converts input basis and saves canonical values', async () => {
    const save = vi.fn<(product: Product) => void>();
    await act(async () => root.render(<ProductForm initial={portionProduct} onSave={save} onCancel={() => {}} />));
    const preview = container.querySelector('[aria-label="Пересчёт пищевой ценности"]')!;
    expect(preview.textContent).toContain('1 порция · 40 г: 80 ккал');
    expect(preview.textContent).toContain('1 штука · 25 г: 50 ккал');
    await clickText('На порцию');
    await changeInput('Калорийность, ккал', '120');
    await changeInput('Белки, г', '8');
    await submitForm();
    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0][0]).toMatchObject({ kcal: 300, protein: 20, fat: 5, carbs: 30, servingGrams: 40, pieceGrams: 25 });
  });

  it('converts between piece and 100g without changing totals and allows removing an optional size', async () => {
    const save = vi.fn<(product: Product) => void>();
    await act(async () => root.render(<ProductForm initial={portionProduct} onSave={save} onCancel={() => {}} />));
    await clickText('На 1 штуку');
    await clickText('На 100 г');
    await changeInput('Вес одной порции, г', '');
    await submitForm();
    expect(save.mock.calls[0][0]).toMatchObject({ kcal: 200, protein: 10, fat: 5, carbs: 30, pieceGrams: 25, servingGrams: undefined });
  });

  it('rejects zero portion weight and impossible nutrients normalized to 100g', async () => {
    const save = vi.fn<(product: Product) => void>();
    await act(async () => root.render(<ProductForm initial={portionProduct} onSave={save} onCancel={() => {}} />));
    await changeInput('Вес одной порции, г', '0');
    await submitForm();
    expect(save).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Вес порции');
    await changeInput('Вес одной порции, г', '40');
    await clickText('На порцию');
    await changeInput('Белки, г', '50');
    await submitForm();
    expect(save).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('в пересчёте на 100 г');
  });
  it('can return to 100g after clearing the active portion weight', async () => {
    const save = vi.fn<(product: Product) => void>();
    await act(async () => root.render(<ProductForm initial={portionProduct} onSave={save} onCancel={() => {}} />));
    await clickText('На порцию');
    await changeInput('Вес одной порции, г', '');
    await clickText('На 100 г');
    await submitForm();
    expect(save.mock.calls[0][0]).toMatchObject({ kcal: 200, protein: 10, servingGrams: undefined });
  });
});

describe('Food quantities', () => {
  async function mountFood() {
    const save = vi.fn<(entry: FoodEntry) => void>();
    await act(async () => root.render(<FoodForm products={[portionProduct, { ...portionProduct, id: 'milk', name: 'Молоко', servingGrams: undefined, pieceGrams: undefined }]} recipes={[]} date="2026-10-11" meal="snack" onSave={save} onCancel={() => {}} />));
    return save;
  }
  it('saves multiple servings as grams, nutrient snapshot and selected quantity', async () => {
    const save = await mountFood();
    await clickText('Порции');
    await changeInput('Количество порций', '2');
    expect(container.textContent).toContain('Всего: 80 г');
    expect(container.textContent).toContain('Ваша порция: 160 ккал');
    await submitForm();
    expect(save.mock.calls[0][0]).toMatchObject({ grams: 80, quantity: { unit: 'serving', amount: 2 }, nutrients: { kcal: 160, protein: 8, fat: 4, carbs: 24 } });
  });
  it('handles fractional pieces and rejects excessive total weight', async () => {
    const save = await mountFood();
    await clickText('Штуки');
    await changeInput('Количество штук', '1.5');
    await submitForm();
    expect(save.mock.calls[0][0]).toMatchObject({ grams: 37.5, quantity: { unit: 'piece', amount: 1.5 }, nutrients: { kcal: 75, protein: 3.75 } });
    save.mockClear();
    await changeInput('Количество штук', '201');
    await submitForm();
    expect(save).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('5000 г');
  });
  it('resets units when search selects another product without portions', async () => {
    const save = await mountFood();
    await clickText('Штуки');
    await changeInput('Поиск', 'Молоко');
    await submitForm();
    expect(save.mock.calls[0][0]).toMatchObject({ name: 'Молоко', grams: 100 });
    expect(save.mock.calls[0][0].quantity).toBeUndefined();
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Единица количества"] button[aria-pressed="true"]')?.textContent).toBe('Граммы');
  });
});

describe("SleepForm", () => {
  it("requires an explicit weight before saving sleep for an unconfigured profile", async () => {
    const profile = createInitialData().profile;
    const save = vi.fn<(entry: SleepEntry) => void>();
    await act(async () => root.render(<SleepForm profile={{ ...profile, configured: false }} date="2026-10-11" onSave={save} onCancel={() => {}} />));
    const weight = container.querySelector<HTMLInputElement>('input[type="number"]')!;
    expect(weight.value).toBe("");
    expect(container.textContent).toContain("Укажите вес для расчёта расхода");
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(save).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Укажите текущий вес");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(weight, "82");
      weight.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0][0]).toMatchObject({ weight: 82, date: "2026-10-11" });
  });

  it("prefills an established profile weight", async () => {
    const profile = { ...createInitialData().profile, configured: true, weight: 91 };
    await act(async () => root.render(<SleepForm profile={profile} date="2026-10-11" onSave={() => {}} onCancel={() => {}} />));
    expect(container.querySelector<HTMLInputElement>('input[type="number"]')?.value).toBe("91");
    expect(container.textContent).toContain("Примерный расход во сне:");
  });
});
