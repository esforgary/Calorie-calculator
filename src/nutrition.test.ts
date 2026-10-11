import { afterEach, describe, expect, it, vi } from "vitest";
import {
  calculateProfile,
  dateOffset,
  productInsights,
  recipeNutrients,
  scaleNutrients,
  sleepCalories,
  sleepHours,
  sumNutrients,
  today,
  walkStats,
} from "./nutrition";
import { createInitialData, DEFAULT_PROFILE } from "./seed";
import type { Product, Recipe, WalkEntry } from "./types";

afterEach(() => vi.useRealTimers());

describe("calendar and sleep", () => {
  it("uses the local calendar date and handles leap days and year boundaries", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 11, 0, 15));
    expect(today()).toBe("2026-10-11");
    expect(dateOffset("2024-02-28", 1)).toBe("2024-02-29");
    expect(dateOffset("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("counts a night across midnight and keeps sleep calories informational", () => {
    const entry = {
      id: "night",
      date: "2026-10-11",
      bedtime: "2026-10-10T23:30",
      wakeTime: "2026-10-11T07:45",
      weight: 68,
    };
    expect(sleepHours(entry.bedtime, entry.wakeTime)).toBe(8.25);
    expect(sleepCalories(entry)).toBe(561);
    expect(sleepHours(entry.wakeTime, entry.bedtime)).toBe(0);
    expect(sleepHours("", entry.wakeTime)).toBe(0);
    expect(sleepHours("bad date", entry.wakeTime)).toBe(0);
  });
});

describe("profile estimates", () => {
  it("uses Mifflin–St Jeor and the requested energy shares", () => {
    const result = calculateProfile(DEFAULT_PROFILE);
    expect(result.bmi).toBeCloseTo(24.977, 3);
    expect(result.bmr).toBe(1400);
    expect(result.tdee).toBe(1925);
    expect(result.target).toBe(1733);
    expect(result.deficit).toBe(192);
    expect(result.protein).toBe(108);
    expect(result.fat).toBe(58);
    expect(result.carbs).toBe(195);
    expect(calculateProfile({ ...DEFAULT_PROFILE, sex: "male" }).bmr).toBe(
      1566,
    );
  });

  it("does not recommend a deficit for low BMI, maintenance or outside the adult model", () => {
    for (const profile of [
      { ...DEFAULT_PROFILE, weight: 45 },
      { ...DEFAULT_PROFILE, goal: "maintain" as const },
      { ...DEFAULT_PROFILE, age: 17 },
      { ...DEFAULT_PROFILE, age: 79 },
    ]) {
      const result = calculateProfile(profile);
      expect(result.deficit).toBe(0);
      expect(result.target).toBe(result.tdee);
    }
  });

  it("never lowers the target below resting expenditure and handles invalid inputs", () => {
    const result = calculateProfile({ ...DEFAULT_PROFILE, activity: 1.05 });
    expect(result.target).toBe(result.bmr);
    expect(calculateProfile({ ...DEFAULT_PROFILE, height: 0 }).target).toBe(0);
    expect(calculateProfile({ ...DEFAULT_PROFILE, weight: NaN }).bmiLabel).toBe(
      "Нет данных",
    );
  });
});

describe("food and recipes", () => {
  const product: Product = {
    id: "test",
    name: "Продукт",
    category: "Другое",
    emoji: "🥣",
    kcal: 200,
    protein: 10,
    fat: 8,
    carbs: 22,
    fiber: 4,
  };

  it("scales portions and sums all ingredients, independent of cooked water weight and servings", () => {
    expect(scaleNutrients(product, 1.5)).toEqual({
      kcal: 300,
      protein: 15,
      fat: 12,
      carbs: 33,
      fiber: 6,
    });
    const recipe: Recipe = {
      id: "recipe",
      name: "Рецепт",
      emoji: "🍲",
      servings: 4,
      cookedWeight: 500,
      ingredients: [
        { productId: "test", grams: 150 },
        { productId: "test", grams: 50 },
      ],
    };
    expect(recipeNutrients(recipe, [product])).toEqual({
      kcal: 400,
      protein: 20,
      fat: 16,
      carbs: 44,
      fiber: 8,
    });
    expect(
      recipeNutrients({ ...recipe, cookedWeight: 900 }, [product]),
    ).toEqual(recipeNutrients(recipe, [product]));
  });

  it("handles empty recipes and missing products without NaN or negative nutrition", () => {
    expect(sumNutrients([])).toEqual({
      kcal: 0,
      protein: 0,
      fat: 0,
      carbs: 0,
      fiber: 0,
    });
    expect(scaleNutrients(product, -1)).toEqual(sumNutrients([]));
    expect(
      recipeNutrients(
        {
          id: "missing",
          name: "",
          emoji: "",
          servings: 1,
          cookedWeight: 100,
          ingredients: [{ productId: "missing", grams: 100 }],
        },
        [product],
      ),
    ).toEqual(sumNutrients([]));
  });

  it("describes known nutrient properties without claiming a fat-burning effect", () => {
    const insights = productInsights(product);
    expect(insights.some((item) => item.includes("белка"))).toBe(true);
    expect(insights.some((item) => item.includes("клетчатку"))).toBe(true);
    expect(insights.at(-1)).toContain("не ускоряет и не блокирует");
  });
});

describe("activity and initial state", () => {
  it("separates walking expenditure from energy already used at rest", () => {
    const walk: WalkEntry = {
      id: "walk",
      date: "2026-10-11",
      time: "12:00",
      minutes: 60,
      steps: 5000,
      distance: 4.8,
      pace: "moderate",
      weight: 70,
    };
    expect(walkStats(walk)).toEqual({ gross: 266, active: 196 });
    expect(walkStats({ ...walk, pace: "brisk", minutes: 30 })).toEqual({
      gross: 168,
      active: 133,
    });
    expect(walkStats({ ...walk, minutes: -10 })).toEqual({
      gross: 0,
      active: 0,
    });
  });

  it("starts with an empty diary and independently editable starter products", () => {
    const first = createInitialData();
    const second = createInitialData();
    expect(first.profile.configured).toBe(false);
    expect(first.food).toEqual([]);
    expect(first.walks).toEqual([]);
    expect(first.sleep).toEqual([]);
    expect(first.products).toHaveLength(16);
    first.products[0].name = "Изменённый продукт";
    first.profile.name = "Имя";
    expect(second.products[0].name).not.toBe(first.products[0].name);
    expect(second.profile.name).toBe("");
  });
});
