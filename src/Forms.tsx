import { useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Camera, Plus, Trash2 } from "lucide-react";
import type {
  FoodEntry,
  FoodIconCategory,
  Ingredient,
  MealType,
  Nutrients,
  Product,
  Profile,
  Recipe,
  SleepEntry,
  WalkEntry,
} from "./types";
import {
  calculateProfile,
  dateOffset,
  recipeNutrients,
  scaleNutrients,
  sleepCalories,
  sleepHours,
  walkStats,
} from "./nutrition";
import { FoodIcon } from "./FoodIcon";
import { PRODUCT_CATEGORIES, RECIPE_CATEGORIES, foodCategoryLabel, resolveFoodCategory } from "./foodCategories";

const mealNames: Record<MealType, string> = {
  breakfast: "Завтрак",
  lunch: "Обед",
  dinner: "Ужин",
  snack: "Перекус",
};
const fmt = (value: number) =>
  Number.isFinite(value)
    ? value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })
    : "0";
const inRange = (value: string, min: number, max: number) =>
  value.trim() !== "" &&
  Number.isFinite(Number(value)) &&
  Number(value) >= min &&
  Number(value) <= max;
const stop = (event: FormEvent<HTMLFormElement>) => event.preventDefault();

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function NumberField({
  label,
  value,
  set,
  min = 0,
  max,
  step = "any",
  placeholder,
  required = true,
  disabled = false,
}: {
  label: string;
  value: string;
  set: (value: string) => void;
  min?: number;
  max?: number;
  step?: number | "any";
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <Field label={label}>
      <input
        className="input"
        type="number"
        inputMode={step === 1 ? "numeric" : "decimal"}
        value={value}
        onChange={(event) => set(event.target.value)}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
      />
    </Field>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return message ? (
    <p className="error-text" role="alert">
      {message}
    </p>
  ) : null;
}

function CategoryPicker({ value, onChange, options }: {
  value: FoodIconCategory;
  onChange: (value: FoodIconCategory) => void;
  options: { id: FoodIconCategory; label: string }[];
}) {
  return (
    <fieldset className="food-category-picker">
      <legend>Категория</legend>
      <div className="food-category-grid">
        {options.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={`food-category-option${value === id ? " selected" : ""}`}
            aria-pressed={value === id}
            onClick={() => onChange(id)}
          >
            <FoodIcon food={{ iconCategory: id }} size={40} />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Actions({
  onCancel,
  label = "Сохранить",
  disabled = false,
}: {
  onCancel?: () => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <div className="form-actions">
      {onCancel && (
        <button type="button" className="button secondary" onClick={onCancel}>
          Отмена
        </button>
      )}
      <button type="submit" className="button primary" disabled={disabled}>
        {label}
      </button>
    </div>
  );
}

function NutrientPreview({
  nutrients,
  label,
}: {
  nutrients: Nutrients;
  label: string;
}) {
  return (
    <div className="nutrient-preview" aria-live="polite">
      <strong>
        {label}: {fmt(nutrients.kcal)} ккал
      </strong>
      <span>
        Б {fmt(nutrients.protein)} г · Ж {fmt(nutrients.fat)} г · У{" "}
        {fmt(nutrients.carbs)} г
      </span>
    </div>
  );
}

async function compressImage(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Выберите изображение JPEG, PNG или WebP.");
  if (file.size > 5 * 1024 * 1024)
    throw new Error("Исходное фото должно быть не больше 5 МБ.");
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every(
    (value, index) => bytes[index] === value,
  );
  const webp =
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!(
    (file.type === "image/jpeg" && jpeg) ||
    (file.type === "image/png" && png) ||
    (file.type === "image/webp" && webp)
  ))
    throw new Error(
      "Формат файла не соответствует изображению. Выберите другое фото.",
    );
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(
      "Не удалось прочитать изображение. Попробуйте другое фото.",
    );
  }
  try {
    const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Браузеру не удалось обработать фото.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.75),
    );
    if (!blob || blob.type !== "image/webp")
      throw new Error("Этот браузер не поддерживает сохранение фото в WebP.");
    if (blob.size > 350 * 1024)
      throw new Error(
        "После сжатия фото больше 350 КБ. Выберите более простое изображение.",
      );
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        typeof reader.result === "string"
          ? resolve(reader.result)
          : reject(new Error("Не удалось сохранить фото."));
      reader.onerror = () => reject(new Error("Не удалось прочитать фото."));
      reader.readAsDataURL(blob);
    });
  } finally {
    bitmap.close();
  }
}

export function ProductForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Product;
  onSave: (product: Product) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [iconCategory, setIconCategory] = useState<FoodIconCategory>(initial ? resolveFoodCategory(initial) : "other");
  const [note, setNote] = useState(initial?.note ?? "");
  const [image, setImage] = useState(initial?.image);
  const [values, setValues] = useState({
    kcal: initial ? String(initial.kcal) : "",
    protein: initial ? String(initial.protein) : "",
    fat: initial ? String(initial.fat) : "",
    carbs: initial ? String(initial.carbs) : "",
    fiber: initial?.fiber ? String(initial.fiber) : "",
  });
  const [error, setError] = useState("");
  const [imageBusy, setImageBusy] = useState(false);
  const imageRequest = useRef(0);
  function submit(event: FormEvent<HTMLFormElement>) {
    stop(event);
    setError("");
    if (!name.trim()) return setError("Введите название продукта.");
    if (
      !inRange(values.kcal, 0, 1000) ||
      !["protein", "fat", "carbs"].every((key) =>
        inRange(values[key as "protein" | "fat" | "carbs"], 0, 100),
      )
    )
      return setError(
        "Укажите ккал от 0 до 1000 и каждый показатель БЖУ от 0 до 100 г.",
      );
    if (
      Number(values.protein) + Number(values.fat) + Number(values.carbs) >
      110
    )
      return setError(
        "Сумма белков, жиров и углеводов не может превышать 110 г на 100 г продукта. Проверьте упаковку.",
      );
    if (values.fiber !== "" && !inRange(values.fiber, 0, 100))
      return setError(
        "Клетчатка должна быть от 0 до 100 г; если данных нет, оставьте поле пустым.",
      );
    if (imageBusy) return setError("Дождитесь обработки фото.");
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      name: name.trim(),
      category: foodCategoryLabel(iconCategory),
      iconCategory,
      emoji: initial?.emoji ?? "",
      note: note.trim(),
      image,
      custom: true,
      kcal: Number(values.kcal),
      protein: Number(values.protein),
      fat: Number(values.fat),
      carbs: Number(values.carbs),
      fiber: values.fiber === "" ? 0 : Number(values.fiber),
    });
  }
  async function chooseImage(file?: File) {
    if (!file) return;
    const request = ++imageRequest.current;
    setImageBusy(true);
    setError("");
    try {
      const result = await compressImage(file);
      if (request === imageRequest.current) setImage(result);
    } catch (cause) {
      if (request === imageRequest.current)
        setError(
          cause instanceof Error ? cause.message : "Не удалось загрузить фото.",
        );
    } finally {
      if (request === imageRequest.current) setImageBusy(false);
    }
  }
  return (
    <form className="form-stack" onSubmit={submit} noValidate>
      <Field label="Название продукта">
        <input
          className="input"
          value={name}
          maxLength={100}
          onChange={(event) => setName(event.target.value)}
          placeholder="Например, сыр гауда"
          required
          autoFocus
        />
      </Field>
      <CategoryPicker value={iconCategory} onChange={setIconCategory} options={[...PRODUCT_CATEGORIES, ...RECIPE_CATEGORIES]} />
      <p className="helper">
        Все значения — на 100 г. Перенесите их с упаковки продукта.
      </p>
      <div className="form-grid">
        {(
          [
            ["kcal", "Калорийность, ккал"],
            ["protein", "Белки, г"],
            ["fat", "Жиры, г"],
            ["carbs", "Углеводы, г"],
            ["fiber", "Клетчатка, г (необязательно)"],
          ] as const
        ).map(([key, label]) => (
          <NumberField
            key={key}
            label={label}
            value={values[key]}
            set={(value) =>
              setValues((current) => ({ ...current, [key]: value }))
            }
            max={key === "kcal" ? 1000 : 100}
            required={key !== "fiber"}
          />
        ))}
      </div>
      <p className="helper">
        Пустая клетчатка означает «нет данных». В суммах используется 0, но это
        не подтверждённое отсутствие клетчатки; рекомендации не делают выводов
        из этого нуля.
      </p>
      <Field label="Заметка">
        <textarea
          className="input"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={500}
          rows={2}
          placeholder="Бренд, способ приготовления, что учесть"
        />
      </Field>
      <label className="file-drop">
        <Camera size={22} />
        <span>
          {imageBusy ? "Обрабатываем фото…" : "Добавить фото продукта"}
        </span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={imageBusy}
          onChange={(event) => {
            void chooseImage(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <span className="helper">Необязательно. Фото заменит значок категории. JPEG, PNG или WebP, до 5 МБ.</span>
      </label>
      {image && (
        <div className="ingredient-row">
          <img
            src={image}
            alt="Фото продукта"
            width={72}
            height={72}
            style={{ objectFit: "cover", borderRadius: 12 }}
          />
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              imageRequest.current += 1;
              setImage(undefined);
              setImageBusy(false);
            }}
          >
            Удалить фото
          </button>
        </div>
      )}
      <ErrorMessage message={error} />
      <Actions
        onCancel={onCancel}
        disabled={imageBusy}
        label={initial ? "Сохранить изменения" : "Добавить продукт"}
      />
    </form>
  );
}

interface IngredientDraft {
  key: string;
  productId: string;
  grams: string;
}
export function RecipeForm({
  products,
  initial,
  onSave,
  onCancel,
}: {
  products: Product[];
  initial?: Recipe;
  onSave: (recipe: Recipe) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [iconCategory, setIconCategory] = useState<FoodIconCategory>(() => {
    const category = initial ? resolveFoodCategory(initial, products) : "main";
    if (category.startsWith("sandwich")) return "sandwich";
    return RECIPE_CATEGORIES.some(({ id }) => id === category) ? category : "main";
  });
  const [servings, setServings] = useState(String(initial?.servings ?? 2));
  const [cookedWeight, setCookedWeight] = useState(
    initial ? String(initial.cookedWeight) : "",
  );
  const [ingredients, setIngredients] = useState<IngredientDraft[]>(() =>
    initial?.ingredients.length
      ? initial.ingredients.map((item) => ({
          key: crypto.randomUUID(),
          productId: item.productId,
          grams: String(item.grams),
        }))
      : [
          {
            key: crypto.randomUUID(),
            productId: products[0]?.id ?? "",
            grams: "100",
          },
        ],
  );
  const [error, setError] = useState("");
  const ingredientValues: Ingredient[] = ingredients.map((item) => ({
    productId: item.productId,
    grams: Number(item.grams),
  }));
  const previewRecipe: Recipe = {
    id: initial?.id ?? "",
    name,
    emoji: initial?.emoji ?? "",
    iconCategory,
    servings: Number(servings),
    cookedWeight: Number(cookedWeight),
    ingredients: ingredientValues,
  };
  const nutrients = recipeNutrients(previewRecipe, products);
  function updateIngredient(key: string, changes: Partial<IngredientDraft>) {
    setIngredients((current) =>
      current.map((item) =>
        item.key === key ? { ...item, ...changes } : item,
      ),
    );
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    stop(event);
    setError("");
    if (!name.trim()) return setError("Введите название рецепта.");
    if (
      !ingredients.length ||
      ingredients.some(
        (item) =>
          !products.some((product) => product.id === item.productId) ||
          !inRange(item.grams, 1, 100000),
      )
    )
      return setError(
        "Выберите существующий продукт и укажите от 1 до 100 000 г для каждого ингредиента.",
      );
    if (!inRange(servings, 1, 100) || !Number.isInteger(Number(servings)))
      return setError("Количество порций — целое число от 1 до 100.");
    if (!inRange(cookedWeight, 1, 100000))
      return setError(
        "Укажите фактический вес готового блюда от 1 до 100 000 г.",
      );
    onSave({
      ...previewRecipe,
      id: initial?.id ?? crypto.randomUUID(),
      name: name.trim(),
    });
  }
  return (
    <form className="form-stack" onSubmit={submit} noValidate>
      <Field label="Название рецепта">
        <input
          className="input"
          value={name}
          maxLength={100}
          onChange={(event) => setName(event.target.value)}
          placeholder="Например, сэндвич с курицей"
          autoFocus
          required
        />
      </Field>
      <CategoryPicker value={iconCategory} onChange={setIconCategory} options={RECIPE_CATEGORIES} />
      <div className="food-selection-preview">
        <FoodIcon food={previewRecipe} products={products} size={64} />
        <div>
          <strong>{foodCategoryLabel(resolveFoodCategory(previewRecipe, products))}</strong>
          {iconCategory === "sandwich" && <p className="helper">Начинка значка определяется по ингредиентам. Если есть и птица, и колбаса, используется та, которой больше по весу.</p>}
        </div>
      </div>
      {!products.length && (
        <p className="notice">
          Сначала добавьте хотя бы один продукт в раздел «Продукты».
        </p>
      )}
      {ingredients.map((item, index) => (
        <div className="ingredient-row" key={item.key}>
          <Field label={`Ингредиент ${index + 1}`}>
            <select
              className="input"
              value={item.productId}
              onChange={(event) =>
                updateIngredient(item.key, { productId: event.target.value })
              }
              required
            >
              <option value="" disabled>
                Выберите продукт
              </option>
              {!products.some((product) => product.id === item.productId) &&
                item.productId && (
                  <option value={item.productId} disabled>
                    Продукт удалён — замените его
                  </option>
                )}
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </Field>
          <NumberField
            label="Вес, г"
            value={item.grams}
            set={(grams) => updateIngredient(item.key, { grams })}
            min={1}
            max={100000}
          />
          <button
            type="button"
            className="button secondary"
            aria-label={`Удалить ингредиент ${index + 1}`}
            disabled={ingredients.length === 1}
            onClick={() =>
              setIngredients((current) =>
                current.filter((ingredient) => ingredient.key !== item.key),
              )
            }
          >
            <Trash2 size={18} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="button secondary"
        disabled={!products.length}
        onClick={() =>
          setIngredients((current) => [
            ...current,
            {
              key: crypto.randomUUID(),
              productId: products[0]?.id ?? "",
              grams: "100",
            },
          ])
        }
      >
        <Plus size={17} /> Добавить ингредиент
      </button>
      <div className="form-grid">
        <NumberField
          label="Вес готового блюда, г"
          value={cookedWeight}
          set={setCookedWeight}
          min={1}
          max={100000}
        />
        <NumberField
          label="Количество порций"
          value={servings}
          set={setServings}
          min={1}
          max={100}
          step={1}
        />
      </div>
      <p className="helper">
        Взвесьте готовое блюдо без посуды. Вода меняет его вес, поэтому сумма
        веса ингредиентов может отличаться.
      </p>
      <NutrientPreview nutrients={nutrients} label="Весь рецепт" />
      {Number(cookedWeight) > 0 && (
        <NutrientPreview
          nutrients={scaleNutrients(nutrients, 100 / Number(cookedWeight))}
          label="На 100 г готового блюда"
        />
      )}
      <ErrorMessage message={error} />
      <Actions
        onCancel={onCancel}
        disabled={!products.length}
        label={initial ? "Сохранить рецепт" : "Создать рецепт"}
      />
    </form>
  );
}

export function FoodForm({
  products,
  recipes,
  date,
  meal,
  onSave,
  onCancel,
}: {
  products: Product[];
  recipes: Recipe[];
  date: string;
  meal: MealType;
  onSave: (entry: FoodEntry) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<"product" | "recipe">("product");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [grams, setGrams] = useState("100");
  const [mealType, setMealType] = useState<MealType>(meal);
  const [error, setError] = useState("");
  const filtered = (mode === "product" ? products : recipes).filter((item) =>
    item.name
      .toLocaleLowerCase("ru")
      .includes(search.trim().toLocaleLowerCase("ru")),
  );
  const selected =
    filtered.find((item) => item.id === selectedId) ?? filtered[0];
  const selectedProduct =
    mode === "product"
      ? products.find((item) => item.id === selected?.id)
      : undefined;
  const selectedRecipe =
    mode === "recipe"
      ? recipes.find((item) => item.id === selected?.id)
      : undefined;
  const missingIngredient = selectedRecipe?.ingredients.some(
    (item) => !products.some((product) => product.id === item.productId),
  );
  const nutrients = selectedProduct
    ? scaleNutrients(selectedProduct, Number(grams) / 100)
    : selectedRecipe && selectedRecipe.cookedWeight > 0
      ? scaleNutrients(
          recipeNutrients(selectedRecipe, products),
          Number(grams) / selectedRecipe.cookedWeight,
        )
      : { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 };
  function submit(event: FormEvent<HTMLFormElement>) {
    stop(event);
    setError("");
    if (!selected)
      return setError(
        mode === "recipe"
          ? "Выберите рецепт или сначала создайте его в разделе «Рецепты»."
          : "Выберите продукт.",
      );
    if (!inRange(grams, 1, 5000))
      return setError("Укажите порцию от 1 до 5000 г.");
    if (
      missingIngredient ||
      (selectedRecipe && !(selectedRecipe.cookedWeight > 0))
    )
      return setError(
        "В рецепте отсутствует продукт или вес готового блюда. Сначала исправьте рецепт.",
      );
    onSave({
      id: crypto.randomUUID(),
      date,
      meal: mealType,
      name: selected.name,
      emoji: selected.emoji,
      iconCategory: resolveFoodCategory(selected, products),
      productId: selectedProduct?.id,
      grams: Number(grams),
      nutrients,
    });
  }
  return (
    <form className="form-stack" onSubmit={submit} noValidate>
      <div className="segmented" role="group" aria-label="Что добавить">
        {(["product", "recipe"] as const).map((value) => (
          <button
            type="button"
            key={value}
            className={mode === value ? "active" : ""}
            aria-pressed={mode === value}
            onClick={() => {
              setMode(value);
              setSelectedId("");
              setSearch("");
              setError("");
            }}
          >
            {value === "product" ? "Продукт" : "Рецепт"}
          </button>
        ))}
      </div>
      <Field label="Поиск">
        <input
          className="input"
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setSelectedId("");
          }}
          placeholder="Введите название"
          autoFocus
        />
      </Field>
      <Field label={mode === "product" ? "Продукт" : "Рецепт"}>
        <select
          className="input"
          value={selected?.id ?? ""}
          onChange={(event) => setSelectedId(event.target.value)}
          required
        >
          {!filtered.length && <option value="">Ничего не найдено</option>}
          {filtered.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </Field>
      {selected && <div className="food-selection-preview"><FoodIcon food={selected} products={products} size={52} /><div><strong>{selected.name}</strong><p className="helper">{foodCategoryLabel(resolveFoodCategory(selected, products))}</p></div></div>}
      {!filtered.length && (
        <p className="helper">
          {search
            ? "Попробуйте изменить запрос."
            : mode === "recipe"
              ? "Создайте свой первый рецепт в разделе «Рецепты»."
              : "Добавьте продукт в разделе «Продукты»."}
        </p>
      )}
      <div className="form-grid">
        <Field label="Приём пищи">
          <select
            className="input"
            value={mealType}
            onChange={(event) => setMealType(event.target.value as MealType)}
          >
            {Object.entries(mealNames).map(([key, name]) => (
              <option value={key} key={key}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        <NumberField
          label="Размер порции, г"
          value={grams}
          set={setGrams}
          min={1}
          max={5000}
        />
      </div>
      {selectedRecipe && selectedRecipe.servings > 0 && (
        <button
          type="button"
          className="button secondary"
          onClick={() =>
            setGrams(
              String(
                Math.round(
                  (selectedRecipe.cookedWeight / selectedRecipe.servings) * 10,
                ) / 10,
              ),
            )
          }
        >
          Одна порция рецепта ·{" "}
          {fmt(selectedRecipe.cookedWeight / selectedRecipe.servings)} г
        </button>
      )}
      {missingIngredient && (
        <p className="notice">
          В этом рецепте есть удалённый продукт. Замените его в редакторе
          рецепта.
        </p>
      )}
      <NutrientPreview nutrients={nutrients} label="Ваша порция" />
      <ErrorMessage message={error} />
      <Actions onCancel={onCancel} label="Добавить в дневник" />
    </form>
  );
}

export function ProfileForm({
  profile,
  onSave,
}: {
  profile: Profile;
  onSave: (profile: Profile) => void;
}) {
  const [name, setName] = useState(profile.name);
  const [sex, setSex] = useState<Profile["sex"]>(profile.sex);
  const [goal, setGoal] = useState<Profile["goal"]>(profile.goal);
  const [values, setValues] = useState({
    age: String(profile.age),
    height: String(profile.height),
    weight: String(profile.weight),
    targetWeight: String(profile.targetWeight),
    activity: String(profile.activity),
    stepsGoal: String(profile.stepsGoal),
    stride: String(profile.stride),
  });
  const [error, setError] = useState("");
  const nextProfile: Profile = {
    name: name.trim(),
    sex,
    goal,
    age: Number(values.age),
    height: Number(values.height),
    weight: Number(values.weight),
    targetWeight: Number(values.targetWeight),
    activity: Number(values.activity),
    stepsGoal: Number(values.stepsGoal),
    stride: Number(values.stride),
    configured: true,
  };
  const estimate = calculateProfile(nextProfile);
  const setValue = (key: keyof typeof values, value: string) =>
    setValues((current) => ({ ...current, [key]: value }));
  function submit(event: FormEvent<HTMLFormElement>) {
    stop(event);
    setError("");
    if (!inRange(values.age, 20, 78) || !Number.isInteger(nextProfile.age))
      return setError("Модель рассчитана на возраст от 20 до 78 полных лет.");
    if (!inRange(values.weight, 30, 350) || !inRange(values.height, 120, 230))
      return setError("Укажите вес от 30 до 350 кг и рост от 120 до 230 см.");
    if (!inRange(values.targetWeight, 30, 350))
      return setError("Укажите целевой вес от 30 до 350 кг.");
    if (
      goal === "lose" &&
      nextProfile.targetWeight / (nextProfile.height / 100) ** 2 < 18.5
    )
      return setError(
        "Для снижения веса целевой ИМТ должен быть не ниже 18,5. Выберите другую цель или поддержание веса.",
      );
    if (goal === "lose" && nextProfile.targetWeight >= nextProfile.weight)
      return setError(
        "Целевой вес для снижения должен быть меньше текущего. Для сохранения веса выберите «Поддержание».",
      );
    if (![1.2, 1.375, 1.55, 1.725].includes(nextProfile.activity))
      return setError("Выберите уровень повседневной активности.");
    if (
      !inRange(values.stepsGoal, 1000, 30000) ||
      !Number.isInteger(nextProfile.stepsGoal) ||
      !inRange(values.stride, 0.3, 1.2)
    )
      return setError(
        "Цель шагов — целое число от 1000 до 30 000, длина шага — от 0,3 до 1,2 м.",
      );
    onSave(nextProfile);
  }
  return (
    <form className="form-stack" onSubmit={submit} noValidate>
      <Field label="Как вас называть">
        <input
          className="input"
          value={name}
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ваше имя (необязательно)"
          autoComplete="given-name"
        />
      </Field>
      <div className="form-grid">
        <NumberField
          label="Возраст, лет"
          value={values.age}
          set={(value) => setValue("age", value)}
          min={20}
          max={78}
          step={1}
        />
        <Field label="Пол для расчёта обмена">
          <select
            className="input"
            value={sex}
            onChange={(event) => setSex(event.target.value as Profile["sex"])}
          >
            <option value="female">Женский</option>
            <option value="male">Мужской</option>
          </select>
        </Field>
        <NumberField
          label="Рост, см"
          value={values.height}
          set={(value) => setValue("height", value)}
          min={120}
          max={230}
        />
        <NumberField
          label="Текущий вес, кг"
          value={values.weight}
          set={(value) => setValue("weight", value)}
          min={30}
          max={350}
        />
      </div>
      <Field label="Повседневная активность">
        <select
          className="input"
          value={values.activity}
          onChange={(event) => setValue("activity", event.target.value)}
        >
          <option value="1.2">Низкая — преимущественно сидячий день</option>
          <option value="1.375">Лёгкая — немного ходьбы и занятий</option>
          <option value="1.55">Средняя — регулярная активность</option>
          <option value="1.725">Высокая — много движения каждый день</option>
        </select>
      </Field>
      <div className="form-grid">
        <Field label="Цель">
          <select
            className="input"
            value={goal}
            onChange={(event) => setGoal(event.target.value as Profile["goal"])}
          >
            <option value="lose">Плавное снижение веса</option>
            <option value="maintain">Поддержание веса</option>
          </select>
        </Field>
        <NumberField
          label="Целевой вес, кг"
          value={values.targetWeight}
          set={(value) => setValue("targetWeight", value)}
          min={30}
          max={350}
        />
      </div>
      <div className="form-grid">
        <NumberField
          label="Цель шагов в день"
          value={values.stepsGoal}
          set={(value) => setValue("stepsGoal", value)}
          min={1000}
          max={30000}
          step={1}
        />
        <NumberField
          label="Длина одного шага, м"
          value={values.stride}
          set={(value) => setValue("stride", value)}
          min={0.3}
          max={1.2}
        />
      </div>
      <p className="helper">
        Длина шага нужна для примерного расстояния. Её можно измерить: пройдите
        10 шагов и разделите расстояние на 10. Цель шагов — личный ориентир, а
        не гарантия похудения.
      </p>
      {estimate.target > 0 && (
        <div className="nutrient-preview" aria-live="polite">
          <strong>Ориентир: {fmt(estimate.target)} ккал в день</strong>
          <span>
            ИМТ{" "}
            {estimate.bmi.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}{" "}
            · {estimate.bmiLabel}
          </span>
          <span>
            Белки {estimate.protein} г · Жиры {estimate.fat} г · Углеводы{" "}
            {estimate.carbs} г
          </span>
        </div>
      )}
      <p className="notice">
        Расчёт приблизительный, для взрослых 20–78 лет вне беременности и
        грудного вскармливания. ИМТ — ориентир, не диагноз. При снижении веса
        используется умеренное уменьшение расчётных калорий; при ИМТ ниже 18,5
        оно отключается.
      </p>
      <ErrorMessage message={error} />
      <Actions label="Сохранить профиль" />
    </form>
  );
}

export function WalkForm({
  profile,
  date,
  onSave,
  onCancel,
}: {
  profile: Profile;
  date: string;
  onSave: (entry: WalkEntry) => void;
  onCancel: () => void;
}) {
  const [minutes, setMinutes] = useState("30");
  const [steps, setSteps] = useState("3000");
  const [distance, setDistance] = useState("");
  const [pace, setPace] = useState<WalkEntry["pace"]>("moderate");
  const [time, setTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  });
  const [error, setError] = useState("");
  const estimatedDistance = (Number(steps) * profile.stride) / 1000;
  const preview: WalkEntry = {
    id: "",
    date,
    time,
    minutes: Number(minutes),
    steps: Number(steps),
    distance: distance.trim() === "" ? estimatedDistance : Number(distance),
    pace,
    weight: profile.weight,
  };
  const calories = walkStats(preview);
  function submit(event: FormEvent<HTMLFormElement>) {
    stop(event);
    setError("");
    if (!inRange(minutes, 1, 600))
      return setError("Укажите длительность от 1 до 600 минут.");
    if (!inRange(steps, 1, 100000) || !Number.isInteger(Number(steps)))
      return setError("Укажите целое количество шагов от 1 до 100 000.");
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
      return setError("Укажите время начала прогулки.");
    if (distance.trim() !== "" && !inRange(distance, 0.001, 300))
      return setError(
        "Расстояние должно быть больше 0 и не больше 300 км. Или оставьте поле пустым для расчёта по шагам.",
      );
    onSave({ ...preview, id: crypto.randomUUID() });
  }
  return (
    <form className="form-stack" onSubmit={submit} noValidate>
      <div className="form-grid">
        <Field label="Время начала">
          <input
            className="input"
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            required
          />
        </Field>
        <NumberField
          label="Длительность, мин"
          value={minutes}
          set={setMinutes}
          min={1}
          max={600}
        />
        <NumberField
          label="Количество шагов"
          value={steps}
          set={setSteps}
          min={1}
          max={100000}
          step={1}
        />
        <NumberField
          label="Расстояние, км (необязательно)"
          value={distance}
          set={setDistance}
          min={0.001}
          max={300}
          placeholder={fmt(estimatedDistance)}
          required={false}
        />
      </div>
      <p className="helper">
        Без расстояния используем шаги ×{" "}
        {profile.stride.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}{" "}
        м: примерно {fmt(estimatedDistance)} км. Шаги этой прогулки войдут в
        дневной итог.
      </p>
      <Field label="Темп по ровной поверхности">
        <select
          className="input"
          value={pace}
          onChange={(event) => setPace(event.target.value as WalkEntry["pace"])}
        >
          <option value="easy">Спокойный · примерно 3,2–3,9 км/ч</option>
          <option value="moderate">Умеренный · примерно 4,5–5,5 км/ч</option>
          <option value="brisk">Быстрый · примерно 5,6–6,3 км/ч</option>
        </select>
      </Field>
      <div className="nutrient-preview" aria-live="polite">
        <strong>Активный расход ≈ {calories.active} ккал</strong>
        <span>Общий за время прогулки ≈ {calories.gross} ккал</span>
      </div>
      <p className="helper">
        Оценка по темпу, времени и весу. Расход в покое вычтен из активных
        калорий. Запись не увеличивает лимит питания: обычное движение уже
        учтено в профиле.
      </p>
      <ErrorMessage message={error} />
      <Actions onCancel={onCancel} label="Записать прогулку" />
    </form>
  );
}

export function SleepForm({
  profile,
  date,
  onSave,
  onCancel,
}: {
  profile: Profile;
  date: string;
  onSave: (entry: SleepEntry) => void;
  onCancel: () => void;
}) {
  const [bedtime, setBedtime] = useState(`${dateOffset(date, -1)}T23:00`);
  const [wakeTime, setWakeTime] = useState(`${date}T07:00`);
  const [error, setError] = useState("");
  const hours = sleepHours(bedtime, wakeTime);
  const recordDate = wakeTime.slice(0, 10);
  const preview: SleepEntry = {
    id: "",
    date: recordDate,
    bedtime,
    wakeTime,
    weight: profile.weight,
  };
  function submit(event: FormEvent<HTMLFormElement>) {
    stop(event);
    setError("");
    if (
      !bedtime ||
      !wakeTime ||
      !Number.isFinite(new Date(bedtime).getTime()) ||
      !Number.isFinite(new Date(wakeTime).getTime())
    )
      return setError("Укажите дату и время засыпания и пробуждения.");
    if (!(hours > 0 && hours <= 24))
      return setError(
        "Пробуждение должно быть позже засыпания, длительность — не больше 24 часов. Проверьте обе даты.",
      );
    onSave({ ...preview, id: crypto.randomUUID() });
  }
  return (
    <form className="form-stack" onSubmit={submit} noValidate>
      <Field label="Когда уснули">
        <input
          className="input"
          type="datetime-local"
          value={bedtime}
          onChange={(event) => setBedtime(event.target.value)}
          required
        />
      </Field>
      <Field label="Когда проснулись">
        <input
          className="input"
          type="datetime-local"
          value={wakeTime}
          onChange={(event) => setWakeTime(event.target.value)}
          required
        />
      </Field>
      {recordDate && recordDate !== date && (
        <p className="notice">
          Запись будет сохранена за {recordDate.split("-").reverse().join(".")},
          по дате пробуждения.
        </p>
      )}
      <div className="nutrient-preview" aria-live="polite">
        <strong>Продолжительность: {fmt(hours)} ч</strong>
        <span>Примерный расход во сне: {sleepCalories(preview)} ккал</span>
      </div>
      <p className="helper">
        Это справочная оценка. Расход во сне уже входит в суточный обмен и не
        увеличивает лимит питания. Записывайте фактическое время сна.
      </p>
      <ErrorMessage message={error} />
      <Actions onCancel={onCancel} label="Записать сон" />
    </form>
  );
}
