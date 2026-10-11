import { describe, expect, it } from 'vitest';
import { productNutrients, productQuantityGrams, productUnitGrams } from './portions';
import type { Product, Nutrients } from './types';

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

  it('requires a positive finite amount and bounds the total weight to 5000 g', () => {
    for (const amount of [0, -1, NaN, Infinity]) {
      expect(productQuantityGrams(product, 'grams', amount)).toBeNull();
      expect(productNutrients(product, 'piece', amount)).toBeNull();
    }
    expect(productQuantityGrams(product, 'grams', 5000)).toBe(5000);
    expect(productQuantityGrams(product, 'grams', 5000.01)).toBeNull();
    expect(productQuantityGrams(product, 'piece', 200)).toBe(5000);
    expect(productQuantityGrams(product, 'piece', 201)).toBeNull();
    expect(productQuantityGrams({ ...product, pieceGrams: 5000 }, 'piece', Number.MAX_VALUE)).toBeNull();
  });
});
