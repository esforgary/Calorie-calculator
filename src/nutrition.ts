import type {
  Nutrients,
  Product,
  Profile,
  Recipe,
  SleepEntry,
  WalkEntry,
} from "./types";
import { activityStats } from "./activity";

const emptyNutrients = (): Nutrients => ({
  kcal: 0,
  protein: 0,
  fat: 0,
  carbs: 0,
  fiber: 0,
});
const nonnegative = (value: number) =>
  Number.isFinite(value) ? Math.max(0, value) : 0;
const formatDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** Calendar dates stay local: UTC conversion can shift a journal entry by a day. */
export function today(): string {
  return formatDate(new Date());
}

export function dateOffset(date: string, days: number): string {
  const parsed = new Date(`${date}T12:00:00`);
  if (!Number.isFinite(parsed.getTime()) || !Number.isFinite(days)) return date;
  parsed.setDate(parsed.getDate() + Math.trunc(days));
  return formatDate(parsed);
}

/** Monday through Sunday of the selected diary date's local calendar week. */
export function weekDates(date: string): string[] {
  const weekday = new Date(`${date}T12:00:00`).getDay();
  if (!Number.isFinite(weekday)) return [];
  const monday = dateOffset(date, -((weekday + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => dateOffset(monday, index));
}

export function sumNutrients(items: Nutrients[]): Nutrients {
  return items.reduce(
    (total, item) => ({
      kcal: total.kcal + nonnegative(item.kcal),
      protein: total.protein + nonnegative(item.protein),
      fat: total.fat + nonnegative(item.fat),
      carbs: total.carbs + nonnegative(item.carbs),
      fiber: total.fiber + nonnegative(item.fiber),
    }),
    emptyNutrients(),
  );
}

export function scaleNutrients(item: Nutrients, factor: number): Nutrients {
  const scale = nonnegative(factor);
  return {
    kcal: nonnegative(item.kcal) * scale,
    protein: nonnegative(item.protein) * scale,
    fat: nonnegative(item.fat) * scale,
    carbs: nonnegative(item.carbs) * scale,
    fiber: nonnegative(item.fiber) * scale,
  };
}

export function calculateProfile(profile: Profile) {
  const { weight, height, age, activity } = profile;
  if (
    ![weight, height, age, activity].every(
      (value) => Number.isFinite(value) && value > 0,
    )
  ) {
    return {
      bmi: 0,
      bmiLabel: "Нет данных",
      bmr: 0,
      tdee: 0,
      target: 0,
      protein: 0,
      fat: 0,
      carbs: 0,
      deficit: 0,
    };
  }
  const bmi = weight / (height / 100) ** 2;
  const bmiLabel =
    bmi < 18.5
      ? "Ниже обычного диапазона"
      : bmi < 25
        ? "Обычный диапазон"
        : bmi < 30
          ? "Выше обычного диапазона"
          : "Высокий ИМТ";
  // Mifflin–St Jeor estimates resting expenditure, not an exact metabolic measurement.
  const bmr = Math.round(
    Math.max(
      0,
      10 * weight +
        6.25 * height -
        5 * age +
        (profile.sex === "male" ? 5 : -161),
    ),
  );
  const tdee = Math.round(bmr * Math.max(1, activity));
  // These are product settings, not a prescribed intake or promised rate of weight loss.
  // Both loss modes keep the existing floor at estimated resting expenditure.
  // Sleep and logged walking do not add an allowance to this activity-adjusted target.
  const canLose =
    (profile.goal === "lose" || profile.goal === "lose_fast") && bmi >= 18.5 && age >= 20 && age <= 78;
  const lossTarget = profile.goal === "lose_fast"
    ? tdee - Math.min(750, Math.round(tdee * 0.3))
    : Math.round(tdee * 0.9);
  const target = canLose ? Math.max(bmr, lossTarget) : tdee;
  return {
    bmi,
    bmiLabel,
    bmr,
    tdee,
    target,
    protein: Math.round((target * 0.25) / 4),
    fat: Math.round((target * 0.3) / 9),
    carbs: Math.round((target * 0.45) / 4),
    deficit: tdee - target,
  };
}

/** Product values are per 100 g; recipe values describe the entire prepared recipe. */
export function recipeNutrients(
  recipe: Recipe,
  products: Product[],
): Nutrients {
  const byId = new Map(products.map((product) => [product.id, product]));
  return sumNutrients(
    recipe.ingredients.map((ingredient) => {
      const product = byId.get(ingredient.productId);
      return product
        ? scaleNutrients(product, nonnegative(ingredient.grams) / 100)
        : emptyNutrients();
    }),
  );
}

export function walkStats(walk: WalkEntry): { gross: number; active: number } {
  return activityStats(walk);
}

export function sleepHours(bedtime: string, wakeTime: string): number {
  if (!bedtime || !wakeTime) return 0;
  const duration = new Date(wakeTime).getTime() - new Date(bedtime).getTime();
  return Number.isFinite(duration) && duration > 0 ? duration / 3_600_000 : 0;
}

export function sleepCalories(entry: SleepEntry): number {
  // 2024 Adult Compendium lists sleeping as 1.0 MET. Informational, already in TDEE.
  return Math.round(
    nonnegative(entry.weight) * sleepHours(entry.bedtime, entry.wakeTime),
  );
}

export function productInsights(product: Product): string[] {
  const insights: string[] = [];
  if (product.protein >= 10)
    insights.push(
      "Содержит заметное количество белка. Учитывайте его в общей цели на день.",
    );
  if (product.fiber >= 3)
    insights.push(
      "Содержит клетчатку: помогает разнообразить рацион и поддерживать работу кишечника.",
    );
  if (product.kcal >= 300)
    insights.push(
      "Высокая калорийность на 100 г: размер порции заметно влияет на дневной итог.",
    );
  else if (product.kcal > 0 && product.kcal <= 100)
    insights.push(
      "Невысокая калорийность на 100 г. Соусы и масло при приготовлении учитывайте отдельно.",
    );
  if (!insights.length)
    insights.push(
      "Оценивайте продукт вместе с размером порции и разнообразием рациона.",
    );
  insights.push(
    "Отдельный продукт не ускоряет и не блокирует похудение. Важен общий баланс питания; БЖУ не описывают все свойства продукта.",
  );
  return insights;
}
