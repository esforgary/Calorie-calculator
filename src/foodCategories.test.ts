import { describe, expect, it } from "vitest";
import { createInitialData } from "./seed";
import { foodCategoryLabel, isFoodIconCategory, resolveFoodCategory } from "./foodCategories";
import type { Product, Recipe } from "./types";

const products: Product[] = [
  { id: "chicken", name: "Куриная грудка", category: "Белковые", emoji: "", kcal: 165, protein: 31, fat: 3.6, carbs: 0, fiber: 0 },
  { id: "sausage", name: "Докторская", category: "Колбаса и сосиски", iconCategory: "sausage", emoji: "", kcal: 257, protein: 13, fat: 22, carbs: 1.5, fiber: 0 },
];
const recipe: Recipe = { id: "sandwich", name: "Обед", emoji: "", iconCategory: "sandwich", ingredients: [], servings: 1, cookedWeight: 150 };

describe("food category icons", () => {
  it("infers icons in older diaries by the product name before broad category", () => {
    expect(resolveFoodCategory({ name: "Овсяные хлопья, сухие", category: "Крупы" })).toBe("flakes");
    expect(resolveFoodCategory({ name: "Куриная грудка", category: "Белковые" })).toBe("poultry");
    expect(resolveFoodCategory({ name: "Сыр гауда", category: "Молочные" })).toBe("cheese");
  });

  it("preserves the user's category even when the name suggests another", () => {
    expect(resolveFoodCategory({ name: "Сыр из кешью", iconCategory: "nuts" })).toBe("nuts");
  });

  it("does not confuse Greek yogurt with buckwheat or raw foods with cheese", () => {
    expect(resolveFoodCategory({ name: "Йогурт греческий 2%", category: "Молочные" })).toBe("dairy");
    expect(resolveFoodCategory({ name: "Сырой рис", category: "Крупы" })).toBe("cereals");
    expect(resolveFoodCategory({ name: "Гречка, варёная", category: "Крупы" })).toBe("cereals");
  });

  it("uses the larger actual meat ingredient weight for sandwich filling", () => {
    expect(resolveFoodCategory({ ...recipe, ingredients: [{ productId: "chicken", grams: 60 }, { productId: "sausage", grams: 20 }] }, products)).toBe("sandwich-chicken");
    expect(resolveFoodCategory({ ...recipe, ingredients: [{ productId: "chicken", grams: 30 }, { productId: "sausage", grams: 50 }] }, products)).toBe("sandwich-sausage");
  });

  it("keeps a neutral sandwich when there is no known meat ingredient", () => {
    expect(resolveFoodCategory({ ...recipe, ingredients: [{ productId: "deleted", grams: 100 }] }, products)).toBe("sandwich");
  });

  it("keeps resolved meal snapshots independent of later recipe changes", () => {
    expect(resolveFoodCategory({ name: "Обед", iconCategory: "sandwich-chicken" })).toBe("sandwich-chicken");
    expect(foodCategoryLabel("sandwich-sausage")).toBe("Сэндвич с колбасой");
    expect(isFoodIconCategory("invalid-icon")).toBe(false);
  });

  it("assigns every starter product a known vector icon", () => {
    expect(createInitialData().products.every(product => isFoodIconCategory(product.iconCategory))).toBe(true);
  });
});
