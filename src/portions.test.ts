import { describe, expect, it } from 'vitest';
import { productNutrients, productQuantityGrams, productUnitGrams, quantityGramsByWeight, recipeQuantityGrams, recipeUnitGrams } from './portions';
import type { Product, Nutrients, Recipe } from './types';

const product: Product = {
  id: 'cheese', name: 'Сыр', category: 'Молочное', emoji: '🧀',
  kcal: 320, protein: 24, fat: 20, carbs: 8, fiber: 2,
  servingGrams: 40, pieceGrams: 25,
};

function expectNutrients(actual: Nutrients | null, expected: Nutrients) {
  expect(actual).not.toBeNull();
  for (const key of Object.keys(expected) as (keyof Nutrients)[]) {
    expect(actual![key]).toBeCloseTo(expected[key]);
  }
}

describe('product portions and pieces', () => {
  it('calculates a 40 g serving from nutrients per 100 g', () => {
    expect(productUnitGrams(product, 'serving')).toBe(40);
    expect(productQuantityGrams(product, 'serving', 1)).toBe(40);
    expectNutrients(productNutrients(product, 'serving', 1), { kcal: 128, protein: 9.6, fat: 8, carbs: 3.2, fiber: 0.8 });
    expect(productQuantityGrams(product, 'serving', 2)).toBe(80);
    expectNutrients(productNutrients(product, 'serving', 2), { kcal: 256, protein: 19.2, fat: 16, carbs: 6.4, fiber: 1.6 });
  });

  it('calculates one piece and supports fractional piece/serving quantities', () => {
    expectNutrients(productNutrients(product, 'piece', 1), { kcal: 80, protein: 6, fat: 5, carbs: 2, fiber: 0.5 });
    expect(productQuantityGrams(product, 'piece', 1.5)).toBe(37.5);
    expect(productQuantityGrams(product, 'serving', 0.5)).toBe(20);
    expectNutrients(productNutrients(product, 'piece', 1.5), { kcal: 120, protein: 9, fat: 7.5, carbs: 3, fiber: 0.75 });
  });

  it('keeps grams usable for old products without optional unit weights', () => {
    const legacy = { ...product, servingGrams: undefined, pieceGrams: undefined };
    expect(productUnitGrams(legacy, 'grams')).toBe(1);
    expect(productQuantityGrams(legacy, 'grams', 40)).toBe(40);
    expect(productNutrients(legacy, 'grams', 40)).toEqual(productNutrients(product, 'serving', 1));
    expect(productQuantityGrams(legacy, 'serving', 1)).toBeNull();
    expect(productNutrients(legacy, 'piece', 1)).toBeNull();
  });

  it('rejects missing, non-positive, non-finite or oversized unit weights', () => {
    for (const weight of [undefined, 0, -1, NaN, Infinity, 5000.01]) {
      const invalid = { ...product, servingGrams: weight, pieceGrams: weight };
      expect(productUnitGrams(invalid, 'serving')).toBeNull();
      expect(productUnitGrams(invalid, 'piece')).toBeNull();
      expect(productQuantityGrams(invalid, 'serving', 1)).toBeNull();
      expect(productNutrients(invalid, 'piece', 1)).toBeNull();
    }
  });

  it('requires a positive finite amount and bounds the total weight to 0.01–5000 g', () => {
    for (const amount of [0, -1, NaN, Infinity]) {
      expect(productQuantityGrams(product, 'grams', amount)).toBeNull();
      expect(productNutrients(product, 'piece', amount)).toBeNull();
    }
    expect(productQuantityGrams(product, 'grams', 5000)).toBe(5000);
    expect(productQuantityGrams(product, 'grams', 0.01)).toBe(0.01);
    expect(productQuantityGrams(product, 'grams', 0.009)).toBeNull();
    expect(productQuantityGrams(product, 'grams', 5000.01)).toBeNull();
    expect(productQuantityGrams(product, 'piece', 200)).toBe(5000);
    expect(productQuantityGrams(product, 'piece', 201)).toBeNull();
    expect(productQuantityGrams({ ...product, pieceGrams: 5000 }, 'piece', Number.MAX_VALUE)).toBeNull();
  });
});

describe('recipe portions and pieces', () => {
  const recipe: Recipe = {
    id: 'pancakes', name: 'Сырники', emoji: '🥞', ingredients: [{ productId: product.id, grams: 300 }],
    cookedWeight: 300, servings: 3, pieceGrams: 50,
  };

  it('converts two portions and one and a half pieces to cooked grams', () => {
    expect(recipeUnitGrams(recipe, 'serving')).toBe(100);
    expect(recipeQuantityGrams(recipe, 'serving', 2)).toBe(200);
    expect(recipeQuantityGrams(recipe, 'serving', 0.5)).toBe(50);
    expect(recipeUnitGrams(recipe, 'piece')).toBe(50);
    expect(recipeQuantityGrams(recipe, 'piece', 1.5)).toBe(75);
  });

  it('preserves fractional serving weight before multiplying the entered amount', () => {
    const fractional = { ...recipe, cookedWeight: 100, servings: 3 };
    expect(recipeUnitGrams(fractional, 'serving')).toBe(100 / 3);
    expect(recipeQuantityGrams(fractional, 'serving', 1.5)).toBe(50);
    expect(recipeQuantityGrams(fractional, 'serving', 3)).toBe(100);
  });

  it('keeps grams and servings available for legacy recipes without a piece weight', () => {
    const legacy = { ...recipe, pieceGrams: undefined };
    expect(recipeQuantityGrams(legacy, 'grams', 75)).toBe(75);
    expect(recipeQuantityGrams(legacy, 'serving', 2)).toBe(200);
    expect(recipeUnitGrams(legacy, 'piece')).toBeNull();
    expect(recipeQuantityGrams(legacy, 'piece', 1)).toBeNull();
  });

  it('rejects invalid prepared piece weights and serving definitions', () => {
    for (const weight of [undefined, 0, -1, NaN, Infinity, 5000.01]) {
      expect(recipeUnitGrams({ ...recipe, pieceGrams: weight }, 'piece')).toBeNull();
    }
    for (const value of [0, -1, NaN, Infinity]) {
      expect(recipeUnitGrams({ ...recipe, cookedWeight: value }, 'serving')).toBeNull();
      expect(recipeUnitGrams({ ...recipe, servings: value }, 'serving')).toBeNull();
    }
    expect(recipeUnitGrams({ ...recipe, cookedWeight: -100, servings: -2 }, 'serving')).toBeNull();
    expect(recipeUnitGrams({ ...recipe, cookedWeight: 10001, servings: 2 }, 'serving')).toBeNull();
  });

  it('applies the diary range to the final recipe amount', () => {
    for (const amount of [0, -1, NaN, Infinity, 0.00001, 51]) {
      expect(recipeQuantityGrams(recipe, 'serving', amount)).toBeNull();
    }
    expect(recipeQuantityGrams(recipe, 'serving', 0.0001)).toBe(0.01);
    expect(recipeQuantityGrams(recipe, 'serving', 50)).toBe(5000);
    expect(recipeQuantityGrams(recipe, 'piece', 101)).toBeNull();
  });
});

describe('ad hoc unit weights', () => {
  it('uses the same validation for a weight supplied directly in the diary', () => {
    expect(quantityGramsByWeight(40, 2)).toBe(80);
    expect(quantityGramsByWeight(25, 1.5)).toBe(37.5);
    expect(quantityGramsByWeight(0.001, 10)).toBe(0.01);
    for (const weight of [undefined, null, 0, -1, NaN, Infinity, 5000.01]) {
      expect(quantityGramsByWeight(weight, 1)).toBeNull();
    }
    expect(quantityGramsByWeight(25, 0.0001)).toBeNull();
    expect(quantityGramsByWeight(25, 201)).toBeNull();
  });
});
