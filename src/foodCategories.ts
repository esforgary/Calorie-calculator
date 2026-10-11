import type { FoodIconCategory, Ingredient, Product } from "./types";

export const PRODUCT_CATEGORIES: { id: FoodIconCategory; label: string }[] = [
  { id: "cheese", label: "Сыр" },
  { id: "sausage", label: "Колбаса и сосиски" },
  { id: "poultry", label: "Мясо птицы" },
  { id: "meat", label: "Мясо" },
  { id: "fish", label: "Рыба" },
  { id: "egg", label: "Яйца" },
  { id: "sweets", label: "Сладкое" },
  { id: "bakery", label: "Мучное" },
  { id: "cereals", label: "Крупы и каши" },
  { id: "flakes", label: "Хлопья" },
  { id: "pasta", label: "Макароны" },
  { id: "produce", label: "Овощи и фрукты" },
  { id: "dairy", label: "Молочные" },
  { id: "nuts", label: "Орехи и бобовые" },
  { id: "oil", label: "Масла" },
  { id: "other", label: "Другое" },
];

export const RECIPE_CATEGORIES: { id: FoodIconCategory; label: string }[] = [
  { id: "soup", label: "Первое" },
  { id: "main", label: "Второе" },
  { id: "sandwich", label: "Сэндвич" },
  { id: "dessert", label: "Десерт" },
  { id: "pizza", label: "Пицца" },
  { id: "burger", label: "Бургер" },
  { id: "roll", label: "Ролл" },
];

const allCategories = [...PRODUCT_CATEGORIES, ...RECIPE_CATEGORIES];
const validCategories = new Set<string>([
  ...allCategories.map(({ id }) => id), "sandwich-chicken", "sandwich-sausage",
]);
export const isFoodIconCategory = (value: unknown): value is FoodIconCategory =>
  typeof value === "string" && validCategories.has(value);

export function foodCategoryLabel(category: FoodIconCategory): string {
  if (category === "sandwich-chicken") return "Сэндвич с птицей";
  if (category === "sandwich-sausage") return "Сэндвич с колбасой";
  return allCategories.find(({ id }) => id === category)?.label ?? "Другое";
}

export interface FoodIconSource {
  name?: string;
  category?: string;
  iconCategory?: FoodIconCategory;
  image?: string;
  ingredients?: Ingredient[];
}

function inferCategory(food: FoodIconSource): FoodIconCategory {
  const name = (food.name ?? "").toLocaleLowerCase("ru");
  const group = (food.category ?? "").toLocaleLowerCase("ru");
  if (/сэндвич|сендвич|бутерброд/.test(name)) return "sandwich";
  if (/пицц/.test(name)) return "pizza";
  if (/бургер/.test(name)) return "burger";
  if (/ролл|шаурм|лаваш с/.test(name)) return "roll";
  if (/суп|борщ|солянк|бульон|окрошк/.test(name)) return "soup";
  if (/торт|пирожн|десерт|чизкейк|морожен/.test(name)) return "dessert";
  if (/колбас|сосиск|сардель|сервелат|ветчин/.test(name)) return "sausage";
  if (/кури|куриц|индей|птиц|гус[ья]|утин|утк/.test(name)) return "poultry";
  if (/(?:^|[^а-яё])сыр(?:$|[^а-яё])|сырн(?:ый|ая|ое|ые)/.test(name)) return "cheese";
  if (/говяд|свинин|баранин|телят|стейк|мясо|бекон/.test(name)) return "meat";
  if (/рыб|лосос|семг|сёмг|форел|тунец|треск|минтай|сельд|скумбр/.test(name)) return "fish";
  if (/яйц|яич|омлет/.test(name)) return "egg";
  if (/хлопь|мюсли|гранол/.test(name)) return "flakes";
  if (/макарон|паст[аы]|спагетти|вермишель|лапш/.test(name)) return "pasta";
  if (/гречк|гречнев|рис|овсян|круп|каша|каши|булгур|пшен/.test(name)) return "cereals";
  if (/шоколад|конфет|слад|мармелад|сахар|м[её]д/.test(name)) return "sweets";
  if (/хлеб|булк|булоч|мучн|печень|круассан|выпечк|мука|блин|пирог/.test(name)) return "bakery";
  if (/йогурт|творог|молок|кефир|сметан|сливк/.test(name)) return "dairy";
  if (/орех|миндал|фундук|кешью|боб|фасол|чечев|горох|нут/.test(name)) return "nuts";
  if (/масло/.test(name)) return "oil";
  if (/яблок|банан|брокколи|помидор|авокадо|огур|морков|салат|капуст|фрукт|овощ|ягод/.test(name)) return "produce";
  if (food.ingredients) return "main";
  const directCategory = allCategories.find(({ label }) => label.toLocaleLowerCase("ru") === group);
  if (directCategory) return directCategory.id;
  if (/круп/.test(group)) return "cereals";
  if (/молоч/.test(group)) return "dairy";
  if (/овощ|фрукт/.test(group)) return "produce";
  if (/белков/.test(group)) return "meat";
  return "other";
}

/** Keeps older diaries compatible and derives sandwich filling from actual ingredients. */
export function resolveFoodCategory(food: FoodIconSource, products: Product[] = []): FoodIconCategory {
  const category = isFoodIconCategory(food.iconCategory) ? food.iconCategory : inferCategory(food);
  if (category !== "sandwich") return category;
  let poultry = 0;
  let sausage = 0;
  for (const ingredient of food.ingredients ?? []) {
    const product = products.find(({ id }) => id === ingredient.productId);
    if (!product) continue;
    const ingredientCategory = resolveFoodCategory(product);
    if (ingredientCategory === "poultry") poultry += ingredient.grams;
    if (ingredientCategory === "sausage") sausage += ingredient.grams;
  }
  if (poultry > 0 || sausage > 0) return poultry >= sausage ? "sandwich-chicken" : "sandwich-sausage";
  return category;
}
