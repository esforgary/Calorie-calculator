import { scaleNutrients } from './nutrition';
import type { Nutrients, Product, Recipe } from './types';

export type ProductUnit = 'grams' | 'serving' | 'piece';

const validWeight = (grams: number | null | undefined): grams is number =>
  typeof grams === 'number' && Number.isFinite(grams) && grams > 0 && grams <= 5000;

/** Weight of one selected unit, or null when the product has no valid unit weight. */
export function productUnitGrams(product: Product, unit: ProductUnit): number | null {
  if (unit === 'grams') return 1;
  const grams = unit === 'serving' ? product.servingGrams : unit === 'piece' ? product.pieceGrams : undefined;
  return validWeight(grams) ? grams : null;
}

/** Resolve a unit weight and quantity to the canonical 0.01–5000 g diary range. */
export function quantityGramsByWeight(unitGrams: number | null | undefined, amount: number): number | null {
  if (!validWeight(unitGrams) || !Number.isFinite(amount) || amount <= 0) return null;
  const grams = unitGrams * amount;
  return validWeight(grams) && grams >= 0.01 ? grams : null;
}

/** Resolve a positive quantity to the canonical weight accepted by the diary form. */
export function productQuantityGrams(product: Product, unit: ProductUnit, amount: number): number | null {
  return quantityGramsByWeight(productUnitGrams(product, unit), amount);
}

/** Recipe servings retain the full precision of the cooked weight divided by servings. */
export function recipeUnitGrams(recipe: Recipe, unit: ProductUnit): number | null {
  if (unit === 'grams') return 1;
  if (unit === 'piece') return validWeight(recipe.pieceGrams) ? recipe.pieceGrams : null;
  if (unit !== 'serving' || !Number.isFinite(recipe.cookedWeight) || recipe.cookedWeight <= 0
    || !Number.isFinite(recipe.servings) || recipe.servings <= 0) return null;
  const grams = recipe.cookedWeight / recipe.servings;
  return validWeight(grams) ? grams : null;
}

export function recipeQuantityGrams(recipe: Recipe, unit: ProductUnit, amount: number): number | null {
  return quantityGramsByWeight(recipeUnitGrams(recipe, unit), amount);
}

/** Product nutrients are always stored per 100 g, independent of the display unit. */
export function productNutrients(product: Product, unit: ProductUnit, amount: number): Nutrients | null {
  const grams = productQuantityGrams(product, unit, amount);
  return grams === null ? null : scaleNutrients(product, grams / 100);
}
