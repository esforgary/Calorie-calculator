export type FoodIconCategory =
  | "cheese" | "sausage" | "poultry" | "meat" | "fish" | "egg"
  | "sweets" | "bakery" | "cereals" | "flakes" | "pasta" | "produce"
  | "dairy" | "nuts" | "oil" | "other" | "soup" | "main" | "sandwich"
  | "sandwich-chicken" | "sandwich-sausage" | "dessert" | "pizza" | "burger" | "roll";

export interface Nutrients {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
}
export interface Product extends Nutrients {
  id: string;
  name: string;
  category: string;
  emoji: string;
  iconCategory?: FoodIconCategory;
  image?: string;
  note?: string;
  custom?: boolean;
  /** Nutrients remain per 100 g; these weights define optional input units. */
  servingGrams?: number;
  pieceGrams?: number;
}
export interface Ingredient {
  productId: string;
  grams: number;
}
export interface Recipe {
  id: string;
  name: string;
  ingredients: Ingredient[];
  servings: number;
  cookedWeight: number;
  /** Optional weight of one prepared piece; servings use cookedWeight / servings. */
  pieceGrams?: number;
  emoji: string;
  iconCategory?: FoodIconCategory;
}
export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
export interface FoodEntry {
  id: string;
  date: string;
  meal: MealType;
  productId?: string;
  name: string;
  grams: number;
  emoji: string;
  iconCategory?: FoodIconCategory;
  image?: string;
  nutrients: Nutrients;
  /** Retain the entered amount without recalculating the saved nutrient snapshot. */
  quantity?: { unit: "serving" | "piece"; amount: number };
}
export type ActivityKind = "walk" | "running" | "dumbbells" | "cycling" | "gym" | "swimming" | "tennis" | "basketball";
export interface WalkEntry {
  id: string;
  date: string;
  time: string;
  minutes: number;
  steps: number;
  distance: number;
  pace: "easy" | "moderate" | "brisk";
  weight: number;
  /** Missing in existing version-1 diaries: interpreted as walking. */
  kind?: ActivityKind;
}
export interface SleepEntry {
  id: string;
  date: string;
  bedtime: string;
  wakeTime: string;
  weight: number;
}
export interface Profile {
  name: string;
  age: number;
  sex: "female" | "male";
  height: number;
  weight: number;
  targetWeight: number;
  activity: number;
  goal: "lose" | "lose_fast" | "maintain";
  stepsGoal: number;
  stride: number;
  configured: boolean;
}
export interface SavedThemePreset {
  id: string;
  name: string;
  colors: { accent: string; background: string; surface: string };
}
export interface AppData {
  version: 1;
  theme?: { accent: string; background: string; surface: string };
  themePresets?: SavedThemePreset[];
  profile: Profile;
  products: Product[];
  recipes: Recipe[];
  food: FoodEntry[];
  walks: WalkEntry[];
  sleep: SleepEntry[];
  water: Record<string, number>;
}
