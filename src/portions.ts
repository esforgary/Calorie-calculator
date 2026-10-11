import { scaleNutrients } from './nutrition';
import type { Nutrients, Product } from './types';

export type ProductUnit = 'grams' | 'serving' | 'piece';

const validWeight = (grams: number | undefined): grams is number =>
  typeof grams === 'number' && Number.isFinite(grams) && grams > 0 && grams <= 5000;

/** Weight of one selected unit, or null when the product has no valid unit weight. */
export function productUnitGrams(product: Product, unit: ProductUnit): number | null {
  if (unit === 'grams') return 1;
  const grams = unit === 'serving' ? product.servingGrams : unit === 'piece' ? product.pieceGrams : undefined;
  return validWeight(grams) ? grams : null;
}

/** Resolve a positive quantity to the canonical weight accepted by the diary form. */
export function productQuantityGrams(product: Product, unit: ProductUnit, amount: number): number | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unitGrams = productUnitGrams(product, unit);
  if (unitGrams === null) return null;
  const grams = unitGrams * amount;
  return validWeight(grams) ? grams : null;
}

/** Product nutrients are always stored per 100 g, independent of the display unit. */
export function productNutrients(product: Product, unit: ProductUnit, amount: number): Nutrients | null {
  const grams = productQuantityGrams(product, unit, amount);
  return grams === null ? null : scaleNutrients(product, grams / 100);
}
