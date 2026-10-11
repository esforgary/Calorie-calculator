import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Droplets,
  Flame,
  Footprints,
  LayoutDashboard,
  Leaf,
  LogOut,
  Moon,
  Pencil,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Sun,
  Sunrise,
  Trash2,
  Utensils,
  LockKeyhole,
  X,
} from "lucide-react";
import { isAppData, useAppData } from "./useAppData";
import { FoodIcon } from "./FoodIcon";
import { ProductCard } from "./ProductCard";
import { ActivityForm, ActivityIcon } from "./ActivityForm";
import { ACTIVITY_KINDS, activityDefinition, isStepActivity } from "./activity";
import { ThemeSettings } from "./ThemeSettings";
import { themeStyle, useTheme } from "./theme";
import { OWNER_LOGIN, OWNER_AUTH_EMAIL } from "./ownerAuth";
import {
  calculateProfile,
  dateOffset,
  productInsights,
  recipeNutrients,
  scaleNutrients,
  sleepCalories,
  sleepHours,
  sumNutrients,
  today,
  walkStats,
} from "./nutrition";
import {
  FoodForm,
  ProductForm,
  ProfileForm,
  RecipeForm,
  SleepForm,
} from "./Forms";
import type {
  ActivityKind,
  FoodEntry,
  MealType,
  Product,
  Recipe,
  SleepEntry,
  WalkEntry,
} from "./types";

type Page =
  "dashboard" | "products" | "recipes" | "activity" | "sleep" | "profile";
type ModalState =
  | { type: "food"; meal: MealType }
  | { type: "product"; product?: Product }
  | { type: "recipe"; recipe?: Recipe }
  | { type: "walk"; kind?: ActivityKind }
  | { type: "sleep" | "auth" | "about" }
  | null;
const pages = [
  { id: "dashboard", name: "Мой день", icon: LayoutDashboard },
  { id: "products", name: "Продукты", icon: Utensils },
  { id: "recipes", name: "Мои рецепты", icon: BookOpen },
  { id: "activity", name: "Активность", icon: Footprints },
  { id: "sleep", name: "Сон и отдых", icon: Moon },
] as const;
const meals: { id: MealType; name: string; time: string; icon: typeof Sun }[] =
  [
    {
      id: "breakfast",
      name: "Завтрак",
      time: "Нет записей",
      icon: Sunrise,
    },
    { id: "lunch", name: "Обед", time: "Нет записей", icon: Sun },
    {
      id: "dinner",
      name: "Ужин",
      time: "Нет записей",
      icon: Moon,
    },
    { id: "snack", name: "Перекус", time: "Нет записей", icon: Leaf },
  ];
const number = (n: number, digits = 0) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: digits }).format(n);
const dateLabel = (date: string, long = false) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(
    "ru-RU",
    long
      ? { day: "numeric", month: "long", weekday: "long" }
      : { day: "numeric", month: "long" },
  );
const percent = (n: number, total: number) =>
  total > 0 ? Math.min(100, Math.max(0, (n / total) * 100)) : 0;

function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const requestClose = () => {
    if (closeTimer.current) return;
    setClosing(true);
    closeTimer.current = setTimeout(() => close.current(), window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : 160);
  };
  useEffect(() => {
    const active = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const element = box.current;
    element
      ?.querySelector<HTMLElement>("input, button, select, textarea")
      ?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) requestClose();
      if (event.key === "Tab" && element) {
        const nodes = [
          ...element.querySelectorAll<HTMLElement>(
            "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]",
          ),
        ].filter((node) => node.getClientRects().length);
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener("keydown", handleKey);
      if (closeTimer.current) clearTimeout(closeTimer.current);
      active?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      data-closing={closing}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        className={`modal ${wide ? "wide" : ""}`}
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="modal-heading">
          <div>
            <h2 id="modal-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            className="icon-button"
            onClick={requestClose}
            aria-label="Закрыть окно"
          >
            <X size={21} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Ring({ value, total }: { value: number; total: number }) {
  const filled = percent(value, total);
  return (
    <div className="calorie-ring">
      <svg viewBox="0 0 220 220" aria-hidden="true">
        <circle cx="110" cy="110" r="94" className="ring-track" />
        <circle
          cx="110"
          cy="110"
          r="94"
          className={`ring-value ${value > total && total > 0 ? "over" : ""}`}
          strokeDasharray={`${filled * 5.906} 590.6`}
        />
      </svg>
      <div className="ring-label">
        <Flame size={21} />
        <strong>{number(value)}</strong>
        <span>ккал съедено</span>
      </div>
    </div>
  );
}

function Macro({
  label,
  value,
  goal,
  color,
}: {
  label: string;
  value: number;
  goal: number;
  color: string;
}) {
  return (
    <div className="macro">
      <div>
        <span>
          <i style={{ background: color }} />
          {label}
        </span>
        <strong>
          {number(value)} <small>/ {goal || "—"} г</small>
        </strong>
      </div>
      <div className="track">
        <span
          style={{ width: `${percent(value, goal)}%`, background: color }}
        />
      </div>
    </div>
  );
}

function AuthPanel({ configured, onSignIn, onDone }: {
  configured: boolean;
  onSignIn: (login: string, password: string) => Promise<void>;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const values = new FormData(event.currentTarget);
    try {
      await onSignIn(String(values.get("login")).trim(), String(values.get("password")));
      onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось войти. Попробуйте ещё раз.");
    } finally { setBusy(false); }
  }
  if (!configured) return <div className="notice">Подключение авторизации не настроено. Проверьте конфигурацию Supabase.</div>;
  return <form className="form-stack" onSubmit={submit}>
    <label className="field">Логин
      <input name="login" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} required defaultValue={OWNER_LOGIN} />
    </label>
    <label className="field">Пароль
      <input name="password" type="password" maxLength={128} required autoComplete="current-password" placeholder="Введите пароль" />
    </label>
    <p className="helper">Вход сохраняется на этом устройстве на 30 дней.</p>
    {error && <p className="error-text" role="alert">{error}</p>}
    <button className="button primary full-width" disabled={busy}>{busy ? "Вход…" : "Войти в дневник"}<ArrowRight size={17} /></button>
  </form>;
}

export default function App() {
  const store = useAppData();
  useEffect(() => {
    if (!store.authenticated) document.title = "Вход · Ритм";
  }, [store.authenticated]);
  if (!store.authReady || !store.authenticated) {
    return (
      <div className="auth-page">
        <div className="auth-brand"><Flame size={26} /><span>РИТМ<span className="brand-dot">.</span></span></div>
        <main className="auth-card">
          <span className="auth-lock"><LockKeyhole size={26} /></span>
          <span className="eyebrow">ЛИЧНЫЙ ДНЕВНИК ПИТАНИЯ</span>
          <h1>Вход в аккаунт</h1>
          {!store.authReady ? <p className="auth-loading" role="status">Проверка сессии…</p> : <>
            {store.error && <p className="error-text" role="alert">{store.error}</p>}
            <AuthPanel configured={store.configured} onSignIn={store.signIn} onDone={() => {}} />
          </>}
        </main>
        <p className="auth-caption">Калории / БЖУ / Активность / Сон</p>
      </div>
    );
  }
  return <Diary key={store.user?.id} store={store} />;
}

export function Diary({ store }: { store: ReturnType<typeof useAppData> }) {
  const { data, setData, user } = store;
  useTheme(data.theme);
  const identityRef = useRef(user?.id ?? "guest");
  identityRef.current = user?.id ?? "guest";
  const editableRef = useRef(store.editable);
  editableRef.current = store.editable;
  const [page, setPage] = useState<Page>("dashboard");
  const [settingsTab, setSettingsTab] = useState<"profile" | "appearance" | "account">("profile");
  const [date, setDate] = useState(today());
  const [modal, setModal] = useState<ModalState>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Все");
  const [toast, setToast] = useState("");
  const [confirm, setConfirm] = useState<{
    text: string;
    action: () => void;
  } | null>(null);
  const [insight, setInsight] = useState<Product | null>(null);
  const profile = calculateProfile(data.profile);
  const hasProfile = data.profile.configured;
  const nutrients = sumNutrients(
    data.food.filter((e) => e.date === date).map((e) => e.nutrients),
  );
  const walks = data.walks.filter((e) => e.date === date);
  const sleep = data.sleep.filter((e) => e.date === date);
  const totalSteps = walks.filter(w => isStepActivity(w.kind)).reduce((sum, w) => sum + w.steps, 0);
  const activeCalories = walks.reduce((sum, w) => sum + walkStats(w).active, 0);
  const totalMinutes = walks.reduce((sum, w) => sum + w.minutes, 0);
  const totalDistance = walks.filter(w => isStepActivity(w.kind)).reduce((sum, w) => sum + w.distance, 0);
  const totalSleep = sleep.reduce(
    (sum, s) => sum + sleepHours(s.bedtime, s.wakeTime),
    0,
  );
  const water = data.water[date] || 0;
  const target = hasProfile ? profile.target : 0;
  const isToday = date === today();
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timeout);
  }, [toast]);
  useEffect(() => {
    document.title = `${page === "profile" ? "Настройки" : pages.find((p) => p.id === page)?.name} · Ритм`;
  }, [page]);
  useEffect(() => {
    setModal(null);
    setConfirm(null);
    setInsight(null);
  }, [user?.id]);
  const notify = (message: string) => {
    setToast(message);
    setModal(null);
  };
  const go = (next: Page) => {
    setPage(next);
    setSearch("");
  };
  const openTracked = (type: "walk" | "sleep") => {
    setModal({ type });
  };
  function canEdit() {
    if (editableRef.current) return true;
    setToast("Дождитесь загрузки дневника или повторите подключение");
    return false;
  }
  function saveFood(entry: FoodEntry) {
    if (!canEdit()) return;
    setData((d) => ({ ...d, food: [...d.food, entry] }));
    notify("Добавлено в дневник");
  }
  function saveProduct(product: Product) {
    if (!canEdit()) return;
    setData((d) => ({
      ...d,
      products: d.products.some((p) => p.id === product.id)
        ? d.products.map((p) => (p.id === product.id ? product : p))
        : [...d.products, product],
    }));
    notify("Продукт сохранён");
  }
  function saveRecipe(recipe: Recipe) {
    if (!canEdit()) return;
    setData((d) => ({
      ...d,
      recipes: d.recipes.some((r) => r.id === recipe.id)
        ? d.recipes.map((r) => (r.id === recipe.id ? recipe : r))
        : [...d.recipes, recipe],
    }));
    notify("Рецепт сохранён");
  }
  function saveWalk(entry: WalkEntry) {
    if (!canEdit()) return;
    setData((d) => ({ ...d, walks: [...d.walks, entry] }));
    notify("Активность записана");
  }
  function saveSleep(entry: SleepEntry) {
    if (!canEdit()) return;
    if (
      data.sleep.some(
        (s) =>
          new Date(entry.bedtime) < new Date(s.wakeTime) &&
          new Date(entry.wakeTime) > new Date(s.bedtime),
      )
    ) {
      setToast("Этот интервал пересекается с уже записанным сном");
      return;
    }
    setData((d) => ({ ...d, sleep: [...d.sleep, entry] }));
    setDate(entry.date);
    notify("Сон записан");
  }
  function exportData() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `ritm-diary-${today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast("Резервная копия дневника скачана");
  }
  async function importData(file?: File) {
    if (!file || !canEdit()) return;
    if (file.size > 50_000_000) {
      setToast("Файл больше 50 МБ. Проверьте, что выбран экспорт дневника.");
      return;
    }
    const owner = identityRef.current;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (identityRef.current !== owner) {
        setToast(
          "Аккаунт изменился. Выберите файл повторно в нужном дневнике.",
        );
        return;
      }
      if (!isAppData(parsed))
        throw new Error("Файл не похож на резервную копию дневника Ритм.");
      setConfirm({
        text: "Заменить текущий дневник данными из файла? Перед заменой автоматически скачается копия текущих записей.",
        action: () => {
          if (identityRef.current !== owner || !canEdit()) return;
          exportData();
          setData(parsed);
          setToast("Дневник восстановлен из файла");
        },
      });
    } catch (cause) {
      setToast(
        cause instanceof Error
          ? cause.message
          : "Не удалось прочитать резервную копию",
      );
    }
  }
  function removeProduct(p: Product) {
    if (
      data.recipes.some((r) => r.ingredients.some((i) => i.productId === p.id))
    ) {
      setToast("Продукт используется в рецепте. Сначала измените рецепт.");
      return;
    }
    setConfirm({
      text: `Удалить «${p.name}» из каталога? Записи в дневнике сохранятся.`,
      action: () =>
        setData((d) => ({
          ...d,
          products: d.products.filter((x) => x.id !== p.id),
        })),
    });
  }
  const datePicker = (
    <div className="date-picker">
      <button
        className="icon-button"
        onClick={() => setDate(dateOffset(date, -1))}
        aria-label="Предыдущий день"
      >
        <ChevronLeft size={17} />
      </button>
      <label className="date-label">
        <span>
          {isToday ? "Сегодня, " : ""}
          {dateLabel(date)}
        </span>
        <input
          aria-label="Выбрать дату дневника"
          type="date"
          value={date}
          onChange={(e) => {
            if (e.target.value) setDate(e.target.value);
          }}
        />
      </label>
      <button
        className="icon-button"
        disabled={isToday}
        onClick={() => setDate(dateOffset(date, 1))}
        aria-label="Следующий день"
      >
        <ChevronRight size={17} />
      </button>
    </div>
  );

  return (
    <div className="app-shell" style={themeStyle(data.theme)}>
      <header className="app-header">
        <button className="brand" onClick={() => go("dashboard")} aria-label="Ритм — дневник">
          <span className="brand-mark"><Flame size={23} /></span>
          РИТМ<span className="brand-dot">.</span>
        </button>
        <nav className="primary-nav" aria-label="Главная навигация">
          {pages.map((item) => (
            <button key={item.id} onClick={() => go(item.id)}
              className={`nav-link ${page === item.id ? "selected" : ""}`}
              aria-current={page === item.id ? "page" : undefined}>
              <item.icon size={17} /><span>{item.name}</span>
            </button>
          ))}
        </nav>
        <div className="header-tools">
          <span className={`save-status ${store.error ? "has-error" : ""}`} title={store.syncStatus}>
            <span /><span className="status-label">{store.syncStatus}</span>
          </span>
          <button className={`account-avatar ${page === "profile" ? "selected" : ""}`} onClick={() => go("profile")} aria-label="Профиль и цели" title={user?.email === OWNER_AUTH_EMAIL ? OWNER_LOGIN : user?.email}>
            {data.profile.name?.[0]?.toUpperCase() || <Settings2 size={18} />}
          </button>
        </div>
      </header>
      <div className="workspace">
        <main>
          {store.error && (
            <div className="sync-banner" role="alert">
              <span>{store.error}</span>
              <button className="text-button" onClick={store.retrySync}>
                Повторить
              </button>
              {store.conflict && (
                <button
                  className="text-button"
                  onClick={() =>
                    setConfirm({
                      text: "Сначала скачайте текущий дневник. Загрузить облачную версию вместо локальной?",
                      action: () => {
                        exportData();
                        void store
                          .useCloudVersion()
                          .catch((e: unknown) =>
                            setToast(
                              e instanceof Error
                                ? e.message
                                : "Ошибка загрузки",
                            ),
                          );
                      },
                    })
                  }
                >
                  Загрузить из облака
                </button>
              )}
            </div>
          )}
          <div className="page-heading" key={`heading-${page}`}>
            <div>
              <h1>{page === "dashboard" ? "Дневник питания" : page === "profile" ? "Настройки" : pages.find((p) => p.id === page)?.name}</h1>
              <p>{{ dashboard: "Калории и состав рациона за день", products: "Пищевая ценность на 100 г, порцию или штуку", recipes: "Состав, порции и пищевая ценность блюд", activity: "Занятия, шаги и расход энергии", sleep: "Продолжительность и расход энергии", profile: "Параметры, оформление и ваш аккаунт" }[page]}</p>
            </div>
            {["dashboard", "activity", "sleep"].includes(page) ? (
              datePicker
            ) : page === "products" ? (
              <button
                className="button primary"
                onClick={() => setModal({ type: "product" })}
              >
                <Plus size={18} />
                Свой продукт
              </button>
            ) : page === "recipes" ? (
              <button
                className="button primary"
                onClick={() => setModal({ type: "recipe" })}
              >
                <Plus size={18} />
                Создать рецепт
              </button>
            ) : null}
          </div>

          <div className="page-view" key={`content-${page}`}>
          {page === "dashboard" && (
            <>
              {!hasProfile && (
                <div className="welcome-banner">
                  <div className="welcome-icon">
                    <Sparkles size={23} />
                  </div>
                  <div>
                    <strong>Настройте дневной лимит</strong>
                    <p>
                      Заполните профиль, чтобы узнать свою цель по калориям и
                      БЖУ.
                    </p>
                  </div>
                  <button
                    className="button secondary"
                    onClick={() => go("profile")}
                  >
                    Настроить цель
                    <ArrowRight size={16} />
                  </button>
                </div>
              )}
              <div className="dashboard-grid">
                <div className="dashboard-main">
                  <section className="card nutrition-card">
                    <div className="card-heading">
                      <h2>Баланс на день</h2>
                      <span className="pill">
                        <span />
                        {target ? "Суточная цель" : "Цель не задана"}
                      </span>
                    </div>
                    <div className="nutrition-content">
                      <div className="ring-column">
                        <Ring value={nutrients.kcal} total={target} />
                        <div className="calorie-remaining">
                          {target ? (
                            <>
                              <strong>
                                {number(Math.abs(target - nutrients.kcal))}
                              </strong>{" "}
                              ккал{" "}
                              {nutrients.kcal > target
                                ? "сверх ориентира"
                                : "осталось"}
                            </>
                          ) : (
                            <button
                              className="text-button"
                              onClick={() => go("profile")}
                            >
                              Настроить лимит →
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="macro-column">
                        <div className="daily-limit">
                          <span>Дневной ориентир</span>
                          <strong>
                            {target ? number(target) : "—"} <small>ккал</small>
                          </strong>
                        </div>
                        <Macro
                          label="Белки"
                          value={nutrients.protein}
                          goal={hasProfile ? profile.protein : 0}
                          color="var(--protein)"
                        />
                        <Macro
                          label="Жиры"
                          value={nutrients.fat}
                          goal={hasProfile ? profile.fat : 0}
                          color="var(--fat)"
                        />
                        <Macro
                          label="Углеводы"
                          value={nutrients.carbs}
                          goal={hasProfile ? profile.carbs : 0}
                          color="var(--carbs)"
                        />
                        <p className="mini-note">
                          БЖУ указаны в граммах.
                        </p>
                      </div>
                    </div>
                  </section>
                  <section className="card diary-card">
                    <div className="card-heading">
                      <div>
                        <h2>Дневник питания</h2>
                        <p>{dateLabel(date, true)}</p>
                      </div>
                      <button
                        className="button primary small"
                        onClick={() =>
                          setModal({ type: "food", meal: "breakfast" })
                        }
                      >
                        <Plus size={17} />
                        Добавить еду
                      </button>
                    </div>
                    <div className="meal-list">
                      {meals.map((meal) => {
                        const entries = data.food.filter(
                          (e) => e.date === date && e.meal === meal.id,
                        );
                        const total = sumNutrients(
                          entries.map((e) => e.nutrients),
                        );
                        return (
                          <div className="meal-group" key={meal.id}>
                            <div className="meal-row">
                              <span className={`meal-icon ${meal.id}`}>
                                <meal.icon size={21} />
                              </span>
                              <div className="meal-text">
                                <h3>{meal.name}</h3>
                                <p>
                                  {entries.length
                                    ? `${number(total.protein)} Б · ${number(total.fat)} Ж · ${number(total.carbs)} У`
                                    : meal.time}
                                </p>
                              </div>
                              <strong className="meal-calories">
                                {number(total.kcal)} <span>ккал</span>
                              </strong>
                              <button
                                className="add-meal"
                                onClick={() =>
                                  setModal({ type: "food", meal: meal.id })
                                }
                                aria-label={`Добавить еду: ${meal.name}`}
                              >
                                <Plus size={18} />
                              </button>
                            </div>
                            {entries.map((entry) => (
                              <div className="food-entry" key={entry.id}>
                                <FoodIcon food={{ ...entry, image: entry.image ?? data.products.find(p => p.id === entry.productId)?.image }} products={data.products} size={40} />
                                <div>
                                  <strong>{entry.name}</strong>
                                  <span>
                                    {entry.quantity && `${number(entry.quantity.amount, 2)} ${entry.quantity.unit === "serving" ? "порц." : "шт."} · `}{number(entry.grams, 1)} г · Б{" "}
                                    {number(entry.nutrients.protein, 1)} · Ж{" "}
                                    {number(entry.nutrients.fat, 1)} · У{" "}
                                    {number(entry.nutrients.carbs, 1)}
                                  </span>
                                </div>
                                <b>{number(entry.nutrients.kcal)}</b>
                                <button
                                  className="icon-button delete"
                                  aria-label={`Удалить запись ${entry.name}`}
                                  onClick={() =>
                                    setConfirm({
                                      text: `Удалить «${entry.name}» из дневника за ${dateLabel(date)}?`,
                                      action: () =>
                                        setData((d) => ({
                                          ...d,
                                          food: d.food.filter(
                                            (x) => x.id !== entry.id,
                                          ),
                                        })),
                                    })
                                  }
                                >
                                  <X size={15} />
                                </button>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                    <div className="diary-footer">
                      <Leaf size={15} />
                      <span>
                        {data.food.some((e) => e.date === date)
                          ? "Все записанные порции учтены в итогах дня."
                          : "Добавьте продукт или блюдо в приём пищи."}
                      </span>
                    </div>
                  </section>
                  <section className="card chart-card">
                    <div className="card-heading">
                      <div>
                        <h2>БЖУ за неделю</h2>
                        <p>За последние 7 дней · доля энергии</p>
                      </div>
                      <div className="chart-legend">
                        <span>
                          <i className="protein-bg" />Б
                        </span>
                        <span>
                          <i className="fat-bg" />Ж
                        </span>
                        <span>
                          <i className="carbs-bg" />У
                        </span>
                      </div>
                    </div>
                    <div className="weekly-chart">
                      {Array.from({ length: 7 }, (_, i) =>
                        dateOffset(date, i - 6),
                      ).map((day) => {
                        const value = sumNutrients(
                          data.food
                            .filter((e) => e.date === day)
                            .map((e) => e.nutrients),
                        );
                        const energy =
                          value.protein * 4 + value.fat * 9 + value.carbs * 4;
                        return (
                          <button
                            key={day}
                            className={`chart-day ${day === date ? "chosen" : ""}`}
                            onClick={() => setDate(day)}
                            aria-label={`${dateLabel(day)}: белки ${number(value.protein)} г, жиры ${number(value.fat)} г, углеводы ${number(value.carbs)} г`}
                            title={`Б ${number(value.protein)} г · Ж ${number(value.fat)} г · У ${number(value.carbs)} г`}
                          >
                            <span className="chart-value">
                              {energy ? number(value.kcal) : "—"}
                            </span>
                            <span
                              className={`chart-bar ${!energy ? "empty" : ""}`}
                            >
                              <i
                                className="protein-bg"
                                style={{
                                  height: `${percent(value.protein * 4, energy)}%`,
                                }}
                              />
                              <i
                                className="fat-bg"
                                style={{
                                  height: `${percent(value.fat * 9, energy)}%`,
                                }}
                              />
                              <i
                                className="carbs-bg"
                                style={{
                                  height: `${percent(value.carbs * 4, energy)}%`,
                                }}
                              />
                            </span>
                            <span>
                              {new Date(`${day}T12:00:00`).toLocaleDateString(
                                "ru-RU",
                                { weekday: "short" },
                              )}
                            </span>
                            <small>
                              {new Date(`${day}T12:00:00`).getDate()}
                            </small>
                          </button>
                        );
                      })}
                    </div>
                    <p className="chart-caption">
                      {data.food.some(
                        (e) => e.date >= dateOffset(date, -6) && e.date <= date,
                      )
                        ? "Над столбцами — ккал из дневника. Нажмите на день, чтобы открыть его."
                        : "Добавьте еду в дневник — здесь появится ваша история питания."}
                    </p>
                  </section>
                </div>
                <div className="dashboard-side">
                  <section className="card compact-card movement-card">
                    <div className="card-heading">
                      <h2>
                        <span className="section-icon green">
                          <Footprints size={19} />
                        </span>
                        Движение
                      </h2>
                      <button
                        className="icon-button"
                        onClick={() => go("activity")}
                        aria-label="Открыть активность"
                      >
                        <ArrowRight size={18} />
                      </button>
                    </div>
                    <div className="metric">
                      <strong>{number(totalSteps)}</strong>
                      <span>
                        / {hasProfile ? number(data.profile.stepsGoal) : "—"}{" "}
                        шагов
                      </span>
                    </div>
                    <div className="track">
                      <span
                        style={{
                          width: `${percent(totalSteps, hasProfile ? data.profile.stepsGoal : 0)}%`,
                        }}
                      />
                    </div>
                    <div className="metric-details">
                      <span>{number(totalDistance, 2)} км</span>
                      <span>
                        <Flame size={13} />
                        {number(activeCalories)} активных ккал
                      </span>
                    </div>
                    <div className="tip-box">
                      <Sun size={18} />
                      <p>
                        {hasProfile && totalSteps >= data.profile.stepsGoal
                          ? "Дневная цель по шагам выполнена."
                          : "Ориентир: прогулка после обеда в 13:00."}
                      </p>
                    </div>
                    <button
                      className="button secondary full-width"
                      onClick={() => openTracked("walk")}
                    >
                      <Plus size={16} />
                      Записать активность
                    </button>
                  </section>
                  <section className="card compact-card sleep-card">
                    <div className="card-heading">
                      <h2>
                        <span className="section-icon purple">
                          <Moon size={19} />
                        </span>
                        Сон и отдых
                      </h2>
                      <button
                        className="icon-button"
                        onClick={() => go("sleep")}
                        aria-label="Открыть дневник сна"
                      >
                        <ArrowRight size={18} />
                      </button>
                    </div>
                    <div className="sleep-summary">
                      <strong>
                        {totalSleep
                          ? `${Math.floor(totalSleep)} ч ${Math.round((totalSleep % 1) * 60)} мин`
                          : "Нет записей"}
                      </strong>
                      <p>
                        {totalSleep
                          ? `≈ ${number(sleep.reduce((sum, s) => sum + sleepCalories(s), 0))} ккал за время сна`
                          : "Запишите время сна и пробуждения"}
                      </p>
                    </div>
                    <button
                      className="button secondary full-width"
                      onClick={() => openTracked("sleep")}
                    >
                      <Plus size={16} />
                      Записать сон
                    </button>
                  </section>
                  <section className="card water-card">
                    <div className="card-heading">
                      <h2>
                        <span className="section-icon blue">
                          <Droplets size={18} />
                        </span>
                        Вода
                      </h2>
                      <span className="water-total">
                        {number(water / 1000, 2)} л
                      </span>
                    </div>
                    <p>Учёт выпитой воды за день.</p>
                    <div className="water-actions">
                      <div className="water-drops" aria-hidden="true">
                        {Array.from({ length: 6 }, (_, i) => (
                          <Droplets
                            key={i}
                            size={23}
                            className={water >= (i + 1) * 250 ? "filled" : ""}
                          />
                        ))}
                      </div>
                      <button
                        className="water-add"
                        disabled={!store.editable || water >= 10000}
                        onClick={() =>
                          setData((d) => ({
                            ...d,
                            water: {
                              ...d.water,
                              [date]: Math.min(
                                10000,
                                (d.water[date] || 0) + 250,
                              ),
                            },
                          }))
                        }
                        aria-label="Добавить 250 мл воды"
                      >
                        <Plus size={16} />
                        250 мл
                      </button>
                    </div>
                    {water > 0 && (
                      <button
                        className="text-button tiny"
                        onClick={() =>
                          setData((d) => ({
                            ...d,
                            water: {
                              ...d.water,
                              [date]: Math.max(0, (d.water[date] || 0) - 250),
                            },
                          }))
                        }
                      >
                        Убрать 250 мл
                      </button>
                    )}
                  </section>
                </div>
              </div>
            </>
          )}

          {page === "products" && (
            <>
              <div className="catalog-toolbar">
                <label className="search-field">
                  <Search size={19} />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Найти продукт…"
                    aria-label="Поиск продуктов"
                  />
                </label>
                <span className="helper">Вес порции и штуки можно задать в редакторе продукта</span>
              </div>
              <div className="filters">
                {["Все", "Мои продукты", ...new Set(data.products.map(p => p.category))].map((c) => (
                  <button
                    key={c}
                    className={category === c ? "active" : ""}
                    onClick={() => setCategory(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <div className="product-grid">
                {data.products
                  .filter(
                    (p) =>
                      p.name.toLowerCase().includes(search.toLowerCase()) &&
                      (category === "Все" ||
                        (category === "Мои продукты" && p.custom) ||
                        p.category === category),
                  )
                  .map((p) => (
                    <ProductCard key={p.id} product={p}
                      onEdit={product => setModal({ type: "product", product })}
                      onDelete={removeProduct} onInsight={setInsight} />
                  ))}
              </div>
              {!data.products.some(
                (p) =>
                  p.name.toLowerCase().includes(search.toLowerCase()) &&
                  (category === "Все" ||
                    (category === "Мои продукты" && p.custom) ||
                    p.category === category),
              ) && (
                <div className="empty-state">
                  <Utensils size={35} />
                  <h3>Пока ничего не найдено</h3>
                  <p>Измените поиск или добавьте свой продукт.</p>
                  <button
                    className="button primary"
                    onClick={() => setModal({ type: "product" })}
                  >
                    <Plus size={17} />
                    Добавить продукт
                  </button>
                </div>
              )}
              <p className="page-footnote">
                Значения в базовом каталоге усреднены. Для точного учёта
                добавляйте данные с упаковки своего продукта.
              </p>
            </>
          )}

          {page === "recipes" && (
            <>
              {data.recipes.length ? (
                <div className="product-grid">
                  {data.recipes.map((r) => {
                    const total = recipeNutrients(r, data.products);
                    const portion = scaleNutrients(total, 1 / r.servings);
                    return (
                      <article key={r.id} className="card recipe-card">
                        <div className="recipe-art">
                          <FoodIcon food={r} products={data.products} size={90} />
                          <span className="pill">{r.servings} порц.</span>
                        </div>
                        <div className="recipe-body">
                          <h3>{r.name}</h3>
                          <p>
                            {r.ingredients.length} ингредиентов ·{" "}
                            {number(r.cookedWeight)} г готового блюда
                          </p>
                          <div className="product-energy">
                            <strong>{number(portion.kcal)}</strong> ккал{" "}
                            <span>/ порция</span>
                          </div>
                          <div className="product-macros">
                            <span>
                              Б <b>{number(portion.protein, 1)}</b>
                            </span>
                            <span>
                              Ж <b>{number(portion.fat, 1)}</b>
                            </span>
                            <span>
                              У <b>{number(portion.carbs, 1)}</b>
                            </span>
                          </div>
                          <div className="recipe-actions">
                            <button
                              className="text-button"
                              onClick={() =>
                                setModal({ type: "recipe", recipe: r })
                              }
                            >
                              <Pencil size={14} />
                              Изменить рецепт
                            </button>
                            <button
                              className="icon-button delete"
                              aria-label={`Удалить рецепт ${r.name}`}
                              onClick={() =>
                                setConfirm({
                                  text: `Удалить рецепт «${r.name}»? Записи в дневнике сохранятся.`,
                                  action: () =>
                                    setData((d) => ({
                                      ...d,
                                      recipes: d.recipes.filter(
                                        (x) => x.id !== r.id,
                                      ),
                                    })),
                                })
                              }
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="card empty-state spacious">
                  <span className="empty-illustration"><FoodIcon food={{ name: "Второе блюдо", iconCategory: "main" }} size={90} /></span>
                  <span className="eyebrow">РЕЦЕПТЫ</span>
                  <h2>Рецепты пока не добавлены</h2>
                  <p>
                    Соберите блюдо из продуктов, укажите вес после
                    приготовления.
                    <br />
                    Калории и БЖУ на порцию рассчитаются автоматически.
                  </p>
                  <button
                    className="button primary"
                    onClick={() => setModal({ type: "recipe" })}
                  >
                    <Plus size={18} />
                    Создать первый рецепт
                  </button>
                </div>
              )}
              <div className="notice recipe-notice">
                <BookOpen size={20} />
                <p>
                  Приготовление меняет вес за счёт воды. Укажите итоговый вес
                  блюда, чтобы правильно считать калории на 100 г. Масло и соусы
                  добавляйте отдельными ингредиентами.
                </p>
              </div>
            </>
          )}

          {page === "activity" && (
            <>
              <section className="activity-launcher" aria-label="Виды активности">
                {ACTIVITY_KINDS.map(kind => (
                  <button key={kind} onClick={() => setModal({ type: "walk", kind })}>
                    <ActivityIcon kind={kind} size={23} />
                    <span>{activityDefinition(kind).label}</span>
                    <Plus size={15} />
                  </button>
                ))}
              </section>
              <div className="stats-grid">
                <div className="card stat-card">
                  <span className="section-icon green">
                    <Footprints size={22} />
                  </span>
                  <p>Пройдено шагов</p>
                  <strong>
                    {number(totalSteps)}{" "}
                    <small>
                      / {hasProfile ? number(data.profile.stepsGoal) : "—"}
                    </small>
                  </strong>
                  <div className="track">
                    <span
                      style={{
                        width: `${percent(totalSteps, data.profile.stepsGoal)}%`,
                      }}
                    />
                  </div>
                </div>
                <div className="card stat-card">
                  <span className="section-icon peach">
                    <Flame size={22} />
                  </span>
                  <p>Активный расход</p>
                  <strong>
                    {number(activeCalories)} <small>ккал</small>
                  </strong>
                  <span className="helper">Сверх расхода в покое</span>
                </div>
                <div className="card stat-card">
                  <span className="section-icon blue">
                    <Sun size={22} />
                  </span>
                  <p>Время активности</p>
                  <strong>
                    {number(totalMinutes)} <small>мин</small>
                  </strong>
                  <span className="helper">
                    {number(totalDistance, 2)} км ходьбы и бега
                  </span>
                </div>
              </div>
              <div className="two-column">
                <section className="card">
                  <div className="card-heading">
                    <h2>Записи за день</h2>
                    <button
                      className="button primary small"
                      onClick={() => openTracked("walk")}
                    >
                      <Plus size={16} />
                      Записать
                    </button>
                  </div>
                  {walks.length ? (
                    walks.map((w) => (
                      <div className="log-row" key={w.id}>
                        <span className="section-icon green">
                          <ActivityIcon kind={w.kind} size={21} />
                        </span>
                        <div>
                          <h3>{activityDefinition(w.kind).label} <span>· {w.time}</span></h3>
                          <p>
                            {w.minutes} мин{isStepActivity(w.kind) && <> · {number(w.steps)} шагов · {number(w.distance, 2)} км</>}
                          </p>
                          <small>
                            {activityDefinition(w.kind).intensity[w.pace].label}{" "}
                            · всего ≈ {walkStats(w).gross} ккал
                          </small>
                        </div>
                        <strong>
                          {walkStats(w).active}
                          <small>активных ккал</small>
                        </strong>
                        <button
                          className="icon-button delete"
                          aria-label={`Удалить запись: ${activityDefinition(w.kind).label}`}
                          onClick={() =>
                            setConfirm({
                              text: "Удалить эту запись активности?",
                              action: () =>
                                setData((d) => ({
                                  ...d,
                                  walks: d.walks.filter((x) => x.id !== w.id),
                                })),
                            })
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="empty-state">
                      <Footprints size={32} />
                      <h3>Пока нет активности</h3>
                      <p>Выберите занятие выше или нажмите «Записать».</p>
                    </div>
                  )}
                </section>
                <section className="card schedule-card">
                  <h2>Движение в течение дня</h2>
                  <p className="helper">
                    Пример удобного расписания, без привязки к «сжиганию жира»
                    по часам.
                  </p>
                  {[
                    {
                      time: "08:00",
                      title: "Мягкое начало",
                      text: "10 минут спокойной прогулки",
                      Icon: Sunrise,
                    },
                    {
                      time: "13:00",
                      title: "Дневная прогулка",
                      text: "15 минут движения после обеда",
                      Icon: Sun,
                    },
                    {
                      time: "18:30",
                      title: "Выдохнуть после дня",
                      text: "20 минут прогулки в удобном темпе",
                      Icon: Moon,
                    },
                  ].map((s) => (
                    <div className="schedule-item" key={s.time}>
                      <span>{s.time}</span>
                      <s.Icon size={20} />
                      <div>
                        <strong>{s.title}</strong>
                        <p>{s.text}</p>
                      </div>
                    </div>
                  ))}
                  <div className="tip-box">
                    <Leaf size={20} />
                    <p>
                      {hasProfile
                        ? `Ваш ориентир: ${number(data.profile.stepsGoal)} шагов, примерно ${number((data.profile.stepsGoal * data.profile.stride) / 1000, 1)} км. `
                        : ""}
                      Начинайте с посильной нагрузки и наращивайте её
                      постепенно.
                    </p>
                  </div>
                </section>
              </div>
              <p className="page-footnote">
                Расход рассчитан по MET, длительности и весу на момент записи.
                Дневной лимит уже учитывает обычную активность. Шаги и километры
                — ориентир привычки, а не гарантия похудения.
              </p>
            </>
          )}

          {page === "sleep" && (
            <>
              <div className="sleep-hero">
                <div>
                  <span className="eyebrow">
                    ЖУРНАЛ СНА
                  </span>
                  <h2>Запись сна</h2>
                  <p>
                    Записывайте время, когда уснули и проснулись,
                    <br />
                    для расчёта длительности и расхода энергии.
                  </p>
                  <button
                    className="button primary"
                    onClick={() => openTracked("sleep")}
                  >
                    <Plus size={17} />
                    Записать сон
                  </button>
                </div>
                <Moon size={120} strokeWidth={0.7} aria-hidden="true" />
              </div>
              <div className="stats-grid">
                <div className="card stat-card">
                  <p>Продолжительность сна</p>
                  <strong>
                    {number(totalSleep, 1)} <small>часов</small>
                  </strong>
                  <span className="helper">По дате пробуждения</span>
                </div>
                <div className="card stat-card">
                  <p>Расход за время сна</p>
                  <strong>
                    ≈{" "}
                    {number(
                      sleep.reduce((sum, s) => sum + sleepCalories(s), 0),
                    )}{" "}
                    <small>ккал</small>
                  </strong>
                  <span className="helper">Уже входит в суточный обмен</span>
                </div>
                <div className="card stat-card">
                  <p>Количество записей</p>
                  <strong>
                    {sleep.length} <small>записей</small>
                  </strong>
                  <span className="helper">Сон ночью и дневной отдых</span>
                </div>
              </div>
              <section className="card">
                <div className="card-heading">
                  <h2>История сна</h2>
                  <span className="pill">{dateLabel(date)}</span>
                </div>
                {sleep.length ? (
                  sleep.map((s) => (
                    <div className="log-row" key={s.id}>
                      <span className="section-icon purple">
                        <Moon size={23} />
                      </span>
                      <div>
                        <h3>
                          {new Date(s.bedtime).toLocaleTimeString("ru-RU", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}{" "}
                          —{" "}
                          {new Date(s.wakeTime).toLocaleTimeString("ru-RU", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </h3>
                        <p>
                          {dateLabel(s.bedtime.slice(0, 10))} →{" "}
                          {dateLabel(s.wakeTime.slice(0, 10))}
                        </p>
                      </div>
                      <strong>
                        {number(sleepHours(s.bedtime, s.wakeTime), 1)} ч
                        <small>≈ {sleepCalories(s)} ккал</small>
                      </strong>
                      <button
                        className="icon-button delete"
                        aria-label="Удалить запись сна"
                        onClick={() =>
                          setConfirm({
                            text: "Удалить эту запись сна?",
                            action: () =>
                              setData((d) => ({
                                ...d,
                                sleep: d.sleep.filter((x) => x.id !== s.id),
                              })),
                          })
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">
                    <Moon size={34} />
                    <h3>Здесь будет ваша история отдыха</h3>
                    <p>Добавьте время сна и пробуждения за выбранную дату.</p>
                  </div>
                )}
              </section>
              <p className="page-footnote">
                Расход во сне — грубая оценка: 1 MET × вес × часы. Он не
                прибавляется к лимиту питания. Потребность во сне индивидуальна;
                приложение не оценивает его качество.
              </p>
            </>
          )}

          {page === "profile" && (
            <div className="settings-page">
              <div className="settings-tabs" role="tablist" aria-label="Разделы настроек">
                {([{id:"profile",label:"Параметры"},{id:"appearance",label:"Оформление"},{id:"account",label:"Аккаунт и данные"}] as const).map(tab => (
                  <button key={tab.id} id={`settings-${tab.id}`} role="tab" aria-selected={settingsTab === tab.id} aria-controls={`panel-${tab.id}`} onClick={() => setSettingsTab(tab.id)}>{tab.label}</button>
                ))}
              </div>
              {settingsTab === "profile" && <div id="panel-profile" role="tabpanel" aria-labelledby="settings-profile" className="profile-layout">
              <section className="card profile-form">
                <div className="card-heading">
                  <h2>Параметры и цели</h2>
                  <span className="pill">Для взрослых 20–78 лет</span>
                </div>
                <ProfileForm
                  key={(user?.id ?? "guest") + JSON.stringify(data.profile)}
                  profile={data.profile}
                  onSave={(p) => {
                    if (!canEdit()) return;
                    setData((d) => ({ ...d, profile: p }));
                    setToast("Профиль и цели сохранены");
                  }}
                />
              </section>
                <div className="profile-aside">
                <section className="card bmi-card">
                  <span className="eyebrow">ИНДЕКС МАССЫ ТЕЛА</span>
                  <div className="bmi-value">
                    {hasProfile ? number(profile.bmi, 2) : "—"}
                    <span>ИМТ</span>
                  </div>
                  <div className="bmi-scale">
                    <span
                      style={{
                        left: `${hasProfile ? Math.min(96, Math.max(4, ((profile.bmi - 15) / 25) * 100)) : 40}%`,
                      }}
                    />
                  </div>
                  <div className="bmi-labels">
                    <span>18,5</span>
                    <span>25</span>
                    <span>30</span>
                  </div>
                  <h3>{hasProfile ? profile.bmiLabel : "Заполните профиль"}</h3>
                  <p>
                    ИМТ — ориентир для взрослых, а не диагноз. Он не различает
                    мышечную и жировую массу.
                  </p>
                  {hasProfile && (
                    <div className="estimate-list">
                      <div>
                        <span>Расход в покое</span>
                        <strong>{profile.bmr} ккал</strong>
                      </div>
                      <div>
                        <span>С учётом активности</span>
                        <strong>{profile.tdee} ккал</strong>
                      </div>
                      <div>
                        <span>Дневной ориентир</span>
                        <strong>{profile.target} ккал</strong>
                      </div>
                      <p>
                        {profile.deficit
                          ? "Умеренное снижение: 10% от расчётного расхода, не ниже оценки обмена в покое."
                          : "Поддержание веса без автоматического дефицита."}{" "}
                        Это настройка модели, а не медицинское назначение.
                      </p>
                    </div>
                  )}
                </section>
                </div>
              </div>}
              {settingsTab === "appearance" && <div id="panel-appearance" role="tabpanel" aria-labelledby="settings-appearance" className="appearance-panel">
                <ThemeSettings value={data.theme} disabled={!store.editable} onSave={theme => { if (!canEdit()) return false; setData(d => ({...d, theme})); setToast("Цвета сохранены"); return true; }} />
              </div>}
              {settingsTab === "account" && <div id="panel-account" role="tabpanel" aria-labelledby="settings-account" className="account-panel">
                <section className="card account-card">
                  <h2>
                    <Cloud size={19} />
                    Ваш дневник
                  </h2>
                  <p>
                    {user
                      ? (user.email === OWNER_AUTH_EMAIL ? OWNER_LOGIN : user.email)
                      : "Пока записи хранятся только в этом браузере. Войдите, чтобы вести отдельный дневник в облаке."}
                  </p>
                  <span className="pill">
                    {user ? store.syncStatus : "Локальное сохранение"}
                  </span>
                  {store.sessionExpiresAt && <p className="session-expiry">Вход сохранён до {new Date(store.sessionExpiresAt).toLocaleDateString("ru-RU")}.</p>}
                  {user ? (
                    <button
                      className="button secondary full-width"
                      onClick={() =>
                        setConfirm({
                          text: "Выйти из облачного дневника? Убедитесь, что записи синхронизированы.",
                          action: () => {
                            void store
                              .signOut()
                              .catch((e: unknown) =>
                                setToast(
                                  e instanceof Error
                                    ? e.message
                                    : "Не удалось выйти",
                                ),
                              );
                          },
                        })
                      }
                    >
                      <LogOut size={16} />
                      Выйти из аккаунта
                    </button>
                  ) : (
                    <button
                      className="button primary full-width"
                      disabled={!store.authReady}
                      onClick={() => setModal({ type: "auth" })}
                    >
                      Войти
                      <ArrowRight size={16} />
                    </button>
                  )}
                  <button
                    className="text-button export-button"
                    onClick={exportData}
                  >
                    <ArrowDownToLine size={16} />
                    Скачать дневник (JSON)
                  </button>
                  <label className="import-button">
                    Восстановить из JSON
                    <input
                      aria-label="Восстановить дневник из JSON"
                      type="file"
                      accept="application/json,.json"
                      disabled={!store.editable}
                      onChange={(e) => {
                        void importData(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </section>
              </div>}
            </div>
          )}
          </div>
          <footer className="main-footer">
            <span>
              <Leaf size={14} />
              РИТМ · Личный дневник
            </span>
            <button
              className="text-button"
              onClick={() => setModal({ type: "about" })}
            >
              Методика расчёта
              <ArrowRight size={13} />
            </button>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          <span>{toast}</span>
          <button
            className="icon-button"
            aria-label="Скрыть уведомление"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {modal && (
        <Modal
          title={
            modal.type === "food"
              ? "Добавить еду"
              : modal.type === "product"
                ? modal.product
                  ? "Изменить продукт"
                  : "Новый продукт"
                : modal.type === "recipe"
                  ? modal.recipe
                    ? "Изменить рецепт"
                    : "Ваш новый рецепт"
                  : modal.type === "walk"
                    ? "Записать активность"
                    : modal.type === "sleep"
                      ? "Записать сон"
                      : modal.type === "auth"
                        ? "Ваш дневник, где бы вы ни были"
                        : "Понятные расчёты"
          }
          subtitle={
            modal.type === "food"
              ? `${dateLabel(date)} · ${meals.find((m) => m.id === modal.meal)?.name}`
              : undefined
          }
          wide={modal.type === "recipe" || modal.type === "walk"}
          onClose={() => setModal(null)}
        >
          {modal.type === "food" && (
            <FoodForm
              products={data.products}
              recipes={data.recipes}
              date={date}
              meal={modal.meal}
              onSave={saveFood}
              onCancel={() => setModal(null)}
            />
          )}
          {modal.type === "product" && (
            <ProductForm
              initial={modal.product}
              onSave={saveProduct}
              onCancel={() => setModal(null)}
            />
          )}
          {modal.type === "recipe" && (
            <RecipeForm
              products={data.products}
              initial={modal.recipe}
              onSave={saveRecipe}
              onCancel={() => setModal(null)}
            />
          )}
          {modal.type === "walk" && (
            <ActivityForm
              profile={data.profile}
              date={date}
              initialKind={modal.kind}
              onSave={saveWalk}
              onCancel={() => setModal(null)}
            />
          )}
          {modal.type === "sleep" && (
            <SleepForm
              profile={data.profile}
              date={date}
              onSave={saveSleep}
              onCancel={() => setModal(null)}
            />
          )}
          {modal.type === "auth" && (
            <AuthPanel
              configured={store.configured}
              onSignIn={store.signIn}

              onDone={() => notify("Вы вошли в дневник")}
            />
          )}
          {modal.type === "about" && (
            <div className="about-content">
              <p>
                Цифры помогают видеть привычки, но не описывают самочувствие
                целиком. Это ориентировочные расчёты для взрослых.
              </p>
              <h3>Калории и ИМТ</h3>
              <p>
                ИМТ = вес / рост². Расход в покое — формула Mifflin–St Jeor;
                затем применяем выбранный коэффициент активности. Для снижения
                веса используем дефицит 10%, без снижения ниже оценки обмена в
                покое. При ИМТ ниже 18,5 дефицит отключён.
              </p>
              <h3>Белки, жиры и углеводы</h3>
              <p>
                Базовые ориентиры: 25%, 30% и 45% энергии. Белки и углеводы — 4
                ккал/г, жиры — 9 ккал/г. Ккал с упаковки могут отличаться из-за
                клетчатки и округления.
              </p>
              <h3>Активность и сон</h3>
              <p>
                Используем MET из Compendium 2024 для выбранного занятия и нагрузки. Активный расход = (MET
                − 1) × вес × часы. Сон = 1 MET × вес × часы. Эти значения не
                увеличивают калорийную цель: обычная активность и сон уже учтены
                в суточном обмене.
              </p>
              <h3>Питание и самочувствие</h3>
              <p>
                Нет продукта, который сам по себе гарантирует или блокирует
                похудение. Мы показываем калорийность, белок, клетчатку и размер
                порции. По БЖУ нельзя оценить аллергены, витамины, соль и все
                индивидуальные реакции.
              </p>
              <p className="helper">
                Автоматические цели не предназначены для беременности, лактации
                и состояний, требующих лечебного питания.
              </p>
              <div className="source-links">
                <a
                  href="https://www.cdc.gov/bmi/adult-calculator/bmi-categories.html"
                  target="_blank"
                  rel="noreferrer"
                >
                  CDC · ИМТ ↗
                </a>
                <a
                  href="https://pubmed.ncbi.nlm.nih.gov/2305711/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Mifflin–St Jeor ↗
                </a>
                <a
                  href="https://pacompendium.com/walking/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Расход при ходьбе ↗
                </a>
                <a
                  href="https://pacompendium.com/inactivity/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Расход во сне ↗
                </a>
                <a
                  href="https://www.who.int/news-room/fact-sheets/detail/healthy-diet"
                  target="_blank"
                  rel="noreferrer"
                >
                  ВОЗ · Питание ↗
                </a>
              </div>
            </div>
          )}
        </Modal>
      )}
      {insight && (
        <Modal
          title={insight.name}
          subtitle="Пищевая ценность и место в рационе"
          onClose={() => setInsight(null)}
        >
          <div className="insight-header">
            <FoodIcon food={insight} size={72} />
            <div>
              <strong>{insight.kcal} ккал / 100 г</strong>
              <p>
                Б {insight.protein} · Ж {insight.fat} · У {insight.carbs}
              </p>
            </div>
          </div>
          {insight.note && <p className="notice">{insight.note}</p>}
          <ul className="insight-list">
            {productInsights(insight).map((i) => (
              <li key={i}>
                <Leaf size={17} />
                <span>{i}</span>
              </li>
            ))}
          </ul>
          <p className="helper">
            Данных о соли, добавленном сахаре, насыщенных жирах и аллергенах в
            этой карточке нет. Сверяйтесь с упаковкой.
          </p>
        </Modal>
      )}
      {confirm && (
        <Modal title="Подтвердите действие" onClose={() => setConfirm(null)}>
          <p className="confirm-text">{confirm.text}</p>
          <div className="form-actions">
            <button
              className="button secondary"
              onClick={() => setConfirm(null)}
            >
              Отмена
            </button>
            <button
              className="button primary"
              onClick={() => {
                confirm.action();
                setConfirm(null);
              }}
            >
              Подтвердить
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
