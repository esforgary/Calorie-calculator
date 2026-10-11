// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProductCard } from "./ProductCard";
import type { Product } from "./types";

let root: Root;
let host: HTMLDivElement;
const onEdit = vi.fn();
const onDelete = vi.fn();
const onInsight = vi.fn();
const product: Product = {
  id: "oats", name: "Хлопья", category: "Крупы", emoji: "🌾",
  kcal: 400, protein: 12, fat: 8, carbs: 60, fiber: 10,
  servingGrams: 40, pieceGrams: 25,
};

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  vi.clearAllMocks();
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

async function render(value = product) {
  await act(async () => root.render(<ProductCard product={value} onEdit={onEdit} onDelete={onDelete} onInsight={onInsight} />));
}

async function choose(label: string) {
  const button = [...host.querySelectorAll(".product-amount-options button")]
    .find(node => node.querySelector("span")?.textContent === label);
  expect(button).toBeDefined();
  await act(async () => (button as HTMLButtonElement).click());
}

function values() {
  return {
    kcal: host.querySelector(".product-energy strong")?.textContent,
    macros: [...host.querySelectorAll(".product-macros b")].map(node => node.textContent),
  };
}

describe("product amount display", () => {
  it("converts per-100g values to a 40g portion and a 25g piece without changing the product", async () => {
    await render();
    expect(values()).toEqual({ kcal: "400", macros: ["12", "8", "60"] });
    await choose("1 порция");
    expect(values()).toEqual({ kcal: "160", macros: ["4,8", "3,2", "24"] });
    expect(host.querySelector('.product-amount-options [aria-pressed="true"]')?.textContent).toContain("40 г");
    await choose("1 штука");
    expect(values()).toEqual({ kcal: "100", macros: ["3", "2", "15"] });
    expect(host.querySelector('.product-amount-options [aria-pressed="true"]')?.textContent).toContain("25 г");
    await choose("100 г");
    expect(values()).toEqual({ kcal: "400", macros: ["12", "8", "60"] });
    expect(product.kcal).toBe(400);
  });

  it("shows labeled editing and deletion actions for standard and custom products", async () => {
    await render();
    const edit = host.querySelector('[aria-label="Редактировать Хлопья"]') as HTMLButtonElement;
    await act(async () => edit.click());
    expect(onEdit).toHaveBeenCalledWith(product);
    const standardRemove = host.querySelector('[aria-label="Удалить Хлопья"]') as HTMLButtonElement;
    expect(standardRemove.textContent).toBe("Удалить");
    await act(async () => standardRemove.click());
    expect(onDelete).toHaveBeenCalledWith(product);
    await render({ ...product, custom: true });
    const remove = host.querySelector('[aria-label="Удалить Хлопья"]') as HTMLButtonElement;
    await act(async () => remove.click());
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ custom: true }));
  });

  it("returns to per-100g values when a saved portion is removed", async () => {
    await render();
    await choose("1 порция");
    await render({ ...product, servingGrams: undefined, pieceGrams: undefined });
    expect(values().kcal).toBe("400");
    expect(host.querySelector(".product-amount-controls")).toBeNull();
  });
});
