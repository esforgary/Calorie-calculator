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
  image?: string;
  note?: string;
  custom?: boolean;
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
  emoji: string;
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
  image?: string;
  nutrients: Nutrients;
}
export interface WalkEntry {
  id: string;
  date: string;
  time: string;
  minutes: number;
  steps: number;
  distance: number;
  pace: "easy" | "moderate" | "brisk";
  weight: number;
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
  goal: "lose" | "maintain";
  stepsGoal: number;
  stride: number;
  configured: boolean;
}
export interface AppData {
  version: 1;
  profile: Profile;
  products: Product[];
  recipes: Recipe[];
  food: FoodEntry[];
  walks: WalkEntry[];
  sleep: SleepEntry[];
  water: Record<string, number>;
}
