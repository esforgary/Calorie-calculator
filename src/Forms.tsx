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
} from "./types";
import {
  calculateProfile,
  dateOffset,
  recipeNutrients,
  scaleNutrients,
  sleepCalories,
  sleepHours,
} from "./nutrition";
import { FoodIcon } from "./FoodIcon";
import { CustomSelect } from "./Select";
import { productUnitGrams, recipeUnitGrams, quantityGramsByWeight, type ProductUnit } from "./portions";
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
  const [servingGrams, setServingGrams] = useState(initial?.servingGrams ? String(initial.servingGrams) : "");
  const [pieceGrams, setPieceGrams] = useState(initial?.pieceGrams ? String(initial.pieceGrams) : "");
  const [basis, setBasis] = useState<ProductUnit>("grams");
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
  const basisWeight = basis === "grams" ? 100 : Number(basis === "serving" ? servingGrams : pieceGrams);
  const validBasis = Number.isFinite(basisWeight) && basisWeight > 0 && basisWeight <= 5000;
  const lastValidBasisWeight = useRef(100);
  if (validBasis) lastValidBasisWeight.current = basisWeight;
  const enteredNutrients: Nutrients = {
    kcal: Number(values.kcal), protein: Number(values.protein), fat: Number(values.fat),
    carbs: Number(values.carbs), fiber: Number(values.fiber),
  };
  const per100 = scaleNutrients(enteredNutrients, validBasis ? 100 / basisWeight : 0);
  const hasNutrients = [values.kcal, values.protein, values.fat, values.carbs].every(value => value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0);
  function changeBasis(next: ProductUnit) {
    const nextWeight = next === "grams" ? 100 : Number(next === "serving" ? servingGrams : pieceGrams);
    if (!Number.isFinite(nextWeight) || nextWeight <= 0 || nextWeight > 5000) return;
    const previousWeight = validBasis ? basisWeight : lastValidBasisWeight.current;
    setValues(current => Object.fromEntries(Object.entries(current).map(([key, value]) => [key,
      value.trim() === "" ? "" : String(Number((Number(value) * nextWeight / previousWeight).toPrecision(12))),
    ])) as typeof current);
    setBasis(next);
    setError("");
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    stop(event);
    setError("");
    if (!name.trim()) return setError("Введите название продукта.");
    if ([servingGrams, pieceGrams].some(value => value !== "" && !inRange(value, 0.01, 5000)))
      return setError("Вес порции и одной штуки должен быть от 0,01 до 5000 г. Если не нужен — оставьте поле пустым.");
    if (!validBasis) return setError("Укажите вес для выбранной порции или штуки.");
    if (
      !inRange(values.kcal, 0, 1000 * basisWeight / 100) ||
      !["protein", "fat", "carbs"].every((key) =>
        inRange(values[key as "protein" | "fat" | "carbs"], 0, basisWeight),
      )
    )
      return setError(
        "Проверьте значения: в пересчёте на 100 г допустимо до 1000 ккал и до 100 г каждого показателя БЖУ.",
      );
    if (
      per100.protein + per100.fat + per100.carbs >
      110
    )
      return setError(
        "Сумма белков, жиров и углеводов не может превышать 110 г на 100 г продукта. Проверьте упаковку.",
      );
    if (values.fiber !== "" && !inRange(values.fiber, 0, basisWeight))
      return setError(
        "Клетчатка не может превышать вес выбранного количества продукта; если данных нет, оставьте поле пустым.",
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
      servingGrams: servingGrams === "" ? undefined : Number(servingGrams),
      pieceGrams: pieceGrams === "" ? undefined : Number(pieceGrams),
      ...per100,
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
      <section className="product-portions" aria-label="Порции и штуки">
        <div className="portion-heading"><h3>Порции и штуки</h3><span className="helper">Необязательно</span></div>
        <div className="form-grid">
          <NumberField label="Вес одной порции, г" value={servingGrams} set={setServingGrams} min={0.01} max={5000} required={false} placeholder="Например, 40" />
          <NumberField label="Вес одной штуки, г" value={pieceGrams} set={setPieceGrams} min={0.01} max={5000} required={false} placeholder="Например, 25" />
        </div>
        <p className="helper">Укажите вес, чтобы видеть БЖУ порции или одной штуки и добавлять их в дневник без взвешивания каждый раз.</p>
      </section>
      <div className="nutrition-basis">
        <span className="field-label">Пищевая ценность</span>
        <div className="segmented portion-segmented" role="group" aria-label="На какое количество указаны значения">
          {([['grams', 'На 100 г'], ['serving', 'На порцию'], ['piece', 'На 1 штуку']] as const).map(([unit, label]) => (
            <button key={unit} type="button" className={basis === unit ? 'active' : ''} aria-pressed={basis === unit}
              disabled={unit !== 'grams' && unit !== basis && !inRange(unit === 'serving' ? servingGrams : pieceGrams, 0.01, 5000)}
              onClick={() => changeBasis(unit)}>{label}</button>
          ))}
        </div>
        <p className="helper">{!validBasis ? 'Укажите вес выше или переключитесь на 100 г.' : basis === 'grams' ? 'Введите значения на 100 г с упаковки. Порция и штука рассчитаются автоматически.' : `Введите значения ${basis === 'serving' ? 'на одну порцию' : 'на одну штуку'} (${fmt(basisWeight)} г). На 100 г пересчитаем автоматически.`}</p>
      </div>
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
            max={validBasis ? (key === "kcal" ? 10 * basisWeight : basisWeight) : undefined}
            required={key !== "fiber"}
          />
        ))}
      </div>
      {hasNutrients && validBasis && (servingGrams !== "" || pieceGrams !== "") && (
        <div className="portion-previews" aria-label="Пересчёт пищевой ценности">
          <NutrientPreview nutrients={per100} label="На 100 г" />
          {inRange(servingGrams, 0.01, 5000) && <NutrientPreview nutrients={scaleNutrients(per100, Number(servingGrams) / 100)} label={`1 порция · ${fmt(Number(servingGrams))} г`} />}
          {inRange(pieceGrams, 0.01, 5000) && <NutrientPreview nutrients={scaleNutrients(per100, Number(pieceGrams) / 100)} label={`1 штука · ${fmt(Number(pieceGrams))} г`} />}
        </div>
      )}
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
  const [pieceGrams, setPieceGrams] = useState(initial?.pieceGrams ? String(initial.pieceGrams) : "");
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
    pieceGrams: pieceGrams === "" ? undefined : Number(pieceGrams),
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
    if (pieceGrams !== "" && !inRange(pieceGrams, 0.01, Math.min(5000, Number(cookedWeight))))
      return setError("Вес одной штуки должен быть от 0,01 до 5000 г и не больше веса готового блюда.");
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
            <CustomSelect
              aria-label={`Ингредиент ${index + 1}`}
              className="input"
              value={item.productId}
              onValueChange={(productId) =>
                updateIngredient(item.key, { productId })
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
            </CustomSelect>
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
      <NumberField label="Вес одной штуки, г" value={pieceGrams} set={setPieceGrams} min={0.01} max={5000} required={false} placeholder="Например, один блин — 65 г" />
      <p className="helper">Для блинов, котлет и других штучных блюд. Порция рассчитывается из веса готового блюда и количества порций.</p>
      <NutrientPreview nutrients={nutrients} label="Весь рецепт" />
      {Number(cookedWeight) > 0 && (
        <NutrientPreview
          nutrients={scaleNutrients(nutrients, 100 / Number(cookedWeight))}
          label="На 100 г готового блюда"
        />
      )}
      {Number(servings) > 0 && <NutrientPreview nutrients={scaleNutrients(nutrients, 1 / Number(servings))} label="На одну порцию" />}
      {inRange(pieceGrams, 0.01, 5000) && Number(cookedWeight) > 0 && <NutrientPreview nutrients={scaleNutrients(nutrients, Number(pieceGrams) / Number(cookedWeight))} label="На одну штуку" />}
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
  const [amount, setAmount] = useState("100");
  const [unit, setUnit] = useState<ProductUnit>("grams");
  const [unitWeights, setUnitWeights] = useState<Partial<Record<"serving" | "piece", string>>>({});
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
  const savedUnitGrams = selectedProduct
    ? productUnitGrams(selectedProduct, unit)
    : selectedRecipe ? recipeUnitGrams(selectedRecipe, unit) : null;
  const unitWeightInput = unit === "grams" ? "1" : unitWeights[unit] ?? (savedUnitGrams === null ? "" : String(savedUnitGrams));
  const unitGrams = inRange(unitWeightInput, 0.01, 5000) ? Number(unitWeightInput) : null;
  const totalGrams = quantityGramsByWeight(unitGrams, Number(amount));
  const nutrients = selectedProduct
    ? scaleNutrients(selectedProduct, (totalGrams ?? 0) / 100)
    : selectedRecipe && selectedRecipe.cookedWeight > 0
      ? scaleNutrients(
          recipeNutrients(selectedRecipe, products),
          (totalGrams ?? 0) / selectedRecipe.cookedWeight,
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
    if (unit !== "grams" && unitGrams === null)
      return setError(`Укажите вес одной ${unit === "serving" ? "порции" : "штуки"} от 0,01 до 5000 г.`);
    if (totalGrams === null)
      return setError("Укажите количество больше нуля. Общий вес должен быть от 0,01 до 5000 г.");
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
      grams: totalGrams,
      ...(unit !== "grams" ? { quantity: { unit, amount: Number(amount) } } : {}),
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
              setUnit("grams");
              setAmount("100");
              setUnitWeights({});
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
            setUnit("grams");
            setAmount("100");
            setUnitWeights({});
          }}
          placeholder="Введите название"
          autoFocus
        />
      </Field>
      <Field label={mode === "product" ? "Продукт" : "Рецепт"}>
        <CustomSelect
          aria-label={mode === "product" ? "Продукт" : "Рецепт"}
          className="input"
          value={selected?.id ?? ""}
          onValueChange={(value) => { setSelectedId(value); setUnit("grams"); setAmount("100"); setUnitWeights({}); setError(""); }}
          required
        >
          {!filtered.length && <option value="">Ничего не найдено</option>}
          {filtered.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </CustomSelect>
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
      {selected && (
        <div className="food-quantity-units">
          <div className="segmented portion-segmented" role="group" aria-label="Единица количества">
            {([['grams', 'Граммы'], ['serving', 'Порции'], ['piece', 'Штуки']] as const).map(([value, label]) => (
              <button type="button" key={value} className={unit === value ? 'active' : ''} aria-pressed={unit === value}
                onClick={() => { if (unit === value) return; setUnit(value); setAmount(value === 'grams' ? '100' : '1'); setError(''); }}>{label}</button>
            ))}
          </div>
        </div>
      )}
      <div className={`food-quantity-fields${unit !== "grams" ? " with-units" : ""}`}>
        <Field label="Приём пищи">
          <CustomSelect
            aria-label="Приём пищи"
            className="input"
            value={mealType}
            onValueChange={(value) => setMealType(value as MealType)}
          >
            {Object.entries(mealNames).map(([key, name]) => (
              <option value={key} key={key}>
                {name}
              </option>
            ))}
          </CustomSelect>
        </Field>
        <div className={`food-amount-input${unit !== "grams" ? " has-stepper" : ""}`}>
          <NumberField
            label={unit === "serving" ? "Количество порций" : unit === "piece" ? "Количество штук" : "Вес, г"}
            value={amount}
            set={setAmount}
            min={0.01}
            max={unit === "grams" ? 5000 : undefined}
          />
          {unit !== "grams" && <>
            <button type="button" className="quantity-step down" aria-label="Уменьшить количество" disabled={!Number.isFinite(Number(amount)) || Number(amount) <= 1} onClick={() => setAmount(String(Math.max(0.01, Math.round((Number(amount) - 1) * 100) / 100)))}>−</button>
            <button type="button" className="quantity-step up" aria-label="Увеличить количество" onClick={() => setAmount(String(Math.round(((Number(amount) || 0) + 1) * 100) / 100))}>+</button>
          </>}
        </div>
        {unit !== "grams" && <NumberField
          label={unit === "serving" ? "Вес одной порции, г" : "Вес одной штуки, г"}
          value={unitWeightInput}
          set={value => setUnitWeights(current => ({ ...current, [unit]: value }))}
          min={0.01}
          max={5000}
          placeholder="Укажите вес в граммах"
        />}
      </div>
      {selected && unit !== "grams" && <div className="food-quantity-summary" aria-live="polite">
        <p className="helper">{savedUnitGrams === null ? "Задайте вес одной единицы для этой записи." : "Вес подставлен автоматически. Для этой записи его можно изменить."} Можно вводить дробное количество: 0,5 или 1,5.</p>
        {totalGrams !== null && <p className="quantity-weight">{Number(amount).toLocaleString("ru-RU", { maximumFractionDigits: 6 })} {unit === "serving" ? "порц." : "шт."} × {fmt(unitGrams!)} г <span>Всего: {fmt(totalGrams)} г</span></p>}
      </div>}
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
  const isWeightLoss = goal === "lose" || goal === "lose_fast";
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
      isWeightLoss &&
      nextProfile.targetWeight / (nextProfile.height / 100) ** 2 < 18.5
    )
      return setError(
        "Для снижения веса целевой ИМТ должен быть не ниже 18,5. Выберите другую цель или поддержание веса.",
      );
    if (isWeightLoss && nextProfile.targetWeight >= nextProfile.weight)
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
    <form className="form-stack profile-fields" onSubmit={submit} noValidate>
      <section className="profile-section" aria-labelledby="profile-body-title">
        <div className="profile-section-heading"><span>01</span><h3 id="profile-body-title">Личные параметры</h3></div>
        <div className="form-grid">
          <Field label="Имя">
            <input className="input" value={name} maxLength={60} onChange={(event) => setName(event.target.value)} placeholder="Необязательно" autoComplete="given-name" />
          </Field>
          <Field label="Пол для расчёта обмена">
            <CustomSelect aria-label="Пол для расчёта обмена" value={sex} onValueChange={(value) => setSex(value as Profile["sex"])}>
              <option value="female">Женский</option>
              <option value="male">Мужской</option>
            </CustomSelect>
          </Field>
        </div>
        <div className="form-grid profile-measurements">
        <NumberField
          label="Возраст, лет"
          value={values.age}
          set={(value) => setValue("age", value)}
          min={20}
          max={78}
          step={1}
        />
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
      </section>
      <section className="profile-section" aria-labelledby="profile-goal-title">
        <div className="profile-section-heading"><span>02</span><h3 id="profile-goal-title">Цель и образ жизни</h3></div>
      <div className="form-grid">
        <Field label="Цель">
          <CustomSelect
            aria-label="Цель"
            aria-describedby={goal === "lose_fast" ? "profile-fast-goal-help" : undefined}
            className="input"
            value={goal}
            onValueChange={(value) => setGoal(value as Profile["goal"])}
          >
            <option value="lose">Плавное снижение веса</option>
            <option value="lose_fast">Быстрое похудение</option>
            <option value="maintain">Поддержание веса</option>
          </CustomSelect>
        </Field>
        <NumberField
          label="Целевой вес, кг"
          value={values.targetWeight}
          set={(value) => setValue("targetWeight", value)}
          min={30}
          max={350}
        />
      </div>
        {goal === "lose_fast" && (
          <p className="helper" id="profile-fast-goal-help">Дефицит до 30%, максимум 750 ккал в сутки, без снижения лимита ниже оценки расхода в покое. Скорость снижения веса индивидуальна.</p>
        )}
        <Field label="Повседневная активность">
          <CustomSelect aria-label="Повседневная активность" value={values.activity} onValueChange={(value) => setValue("activity", value)}>
            <option value="1.2">Низкая — преимущественно сидячий день</option>
            <option value="1.375">Лёгкая — немного ходьбы и занятий</option>
            <option value="1.55">Средняя — регулярная активность</option>
            <option value="1.725">Высокая — много движения каждый день</option>
          </CustomSelect>
        </Field>
      </section>
      <section className="profile-section" aria-labelledby="profile-steps-title">
        <div className="profile-section-heading"><span>03</span><h3 id="profile-steps-title">Шаги и расстояние</h3></div>
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
        Чтобы измерить длину шага, пройдите 10 шагов и разделите расстояние на 10.
      </p>
      </section>
      {estimate.target > 0 && (
        <div className="profile-estimate" aria-live="polite">
          <div><span>Ориентир на день</span><strong>{fmt(estimate.target)} <small>ккал</small></strong></div>
          <div><span>Индекс массы тела</span><strong>{estimate.bmi.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}</strong><small>{estimate.bmiLabel}</small></div>
          <div className="profile-estimate-macros"><span>БЖУ на день</span><strong>{estimate.protein} / {estimate.fat} / {estimate.carbs} <small>г</small></strong><small>Белки / жиры / углеводы</small></div>
        </div>
      )}
      <details className="profile-method">
        <summary>Как рассчитывается цель</summary>
        <p className="helper">Расчёт учитывает возраст, пол, рост, вес и обычную активность. Для плавного снижения веса применяется дефицит 10%, для быстрого — до 30%, максимум 750 ккал в сутки. В обоих режимах лимит не опускается ниже оценки расхода в покое; при ИМТ ниже 18,5 дефицит отключается. Расход тренировок и сна не прибавляется к лимиту питания.</p>
        <p className="helper">Модель приблизительная: для взрослых 20–78 лет вне беременности и грудного вскармливания. ИМТ — ориентир, а не диагноз; цель шагов — личный ориентир движения.</p>
      </details>
      <ErrorMessage message={error} />
      <Actions label="Сохранить профиль" />
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
  const [weight, setWeight] = useState(profile.configured ? String(profile.weight) : "");
  const [error, setError] = useState("");
  const hours = sleepHours(bedtime, wakeTime);
  const recordDate = wakeTime.slice(0, 10);
  const preview: SleepEntry = {
    id: "",
    date: recordDate,
    bedtime,
    wakeTime,
    weight: Number(weight),
  };
  function submit(event: FormEvent<HTMLFormElement>) {
    stop(event);
    setError("");
    if (!inRange(weight, 30, 350))
      return setError("Укажите текущий вес от 30 до 350 кг для расчёта расхода во сне.");
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
      <NumberField label="Текущий вес, кг" value={weight} set={setWeight} min={30} max={350} placeholder="Укажите вес" />
      {recordDate && recordDate !== date && (
        <p className="notice">
          Запись будет сохранена за {recordDate.split("-").reverse().join(".")},
          по дате пробуждения.
        </p>
      )}
      <div className="nutrient-preview" aria-live="polite">
        <strong>Продолжительность: {fmt(hours)} ч</strong>
        <span>{inRange(weight, 30, 350) ? `Примерный расход во сне: ${sleepCalories(preview)} ккал` : "Укажите вес для расчёта расхода"}</span>
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
