import type { ActivityKind, WalkEntry } from "./types";

export const ACTIVITY_KINDS: ActivityKind[] = [
  "walk", "running", "dumbbells", "cycling", "gym", "swimming", "tennis", "basketball",
];
export const ACTIVITY_INTENSITIES: WalkEntry["pace"][] = ["easy", "moderate", "brisk"];

interface Intensity {
  label: string;
  detail: string;
  met: number;
  code: string;
}
export interface ActivityDefinition {
  kind: ActivityKind;
  label: string;
  source: string;
  intensity: Record<WalkEntry["pace"], Intensity>;
}

// 2024 Adult Compendium, checked 2026-10-11. Each option identifies the
// actual activity used in the estimate; MET values are not personalized measurements.
const definitions: Record<ActivityKind, ActivityDefinition> = {
  walk: {
    kind: "walk", label: "Ходьба", source: "https://pacompendium.com/walking/",
    intensity: {
      easy: { label: "Спокойная", detail: "3,2–3,9 км/ч", met: 2.8, code: "17152" },
      moderate: { label: "Умеренная", detail: "4,5–5,5 км/ч", met: 3.8, code: "17190" },
      brisk: { label: "Быстрая", detail: "5,6–6,3 км/ч", met: 4.8, code: "17200" },
    },
  },
  running: {
    kind: "running", label: "Пробежка", source: "https://pacompendium.com/running/",
    intensity: {
      easy: { label: "Лёгкая", detail: "6,4–6,8 км/ч", met: 6.5, code: "12028" },
      moderate: { label: "Умеренная", detail: "8–8,4 км/ч", met: 8.5, code: "12030" },
      brisk: { label: "Быстрая", detail: "9,7–10,1 км/ч", met: 9.3, code: "12050" },
    },
  },
  dumbbells: {
    kind: "dumbbells", label: "Гантели", source: "https://pacompendium.com/conditioning-exercise/",
    intensity: {
      easy: { label: "Обычные подходы", detail: "8–15 повторений", met: 3.5, code: "02054" },
      moderate: { label: "Приседания и тяги", detail: "С дополнительным весом", met: 5, code: "02052" },
      brisk: { label: "Интенсивная", detail: "Тяжёлая силовая работа", met: 6, code: "02050" },
    },
  },
  cycling: {
    kind: "cycling", label: "Велосипед", source: "https://pacompendium.com/bicycling/",
    intensity: {
      easy: { label: "Спокойная", detail: "Лёгкое усилие", met: 4.3, code: "01015" },
      moderate: { label: "Умеренная", detail: "Среднее усилие", met: 7, code: "01016" },
      brisk: { label: "Интенсивная", detail: "Высокое усилие", met: 9, code: "01017" },
    },
  },
  gym: {
    kind: "gym", label: "Занятие в зале", source: "https://pacompendium.com/conditioning-exercise/",
    intensity: {
      easy: { label: "Лёгкая", detail: "Спокойная круговая", met: 3.5, code: "02034" },
      moderate: { label: "Смешанная", detail: "Тренажёры и силовая", met: 5, code: "02061" },
      brisk: { label: "Интенсивная", detail: "Круговая, мало отдыха", met: 7.5, code: "02040" },
    },
  },
  swimming: {
    kind: "swimming", label: "Плавание", source: "https://pacompendium.com/water-activities/",
    intensity: {
      easy: { label: "Спокойное", detail: "Свободный стиль, медленно", met: 5.8, code: "18240" },
      moderate: { label: "Средний темп", detail: "Кроль ≈ 46 м/мин", met: 8, code: "18290" },
      brisk: { label: "Быстрое", detail: "Свободный стиль, интенсивно", met: 9.8, code: "18230" },
    },
  },
  tennis: {
    kind: "tennis", label: "Теннис", source: "https://pacompendium.com/sports/",
    intensity: {
      easy: { label: "Удары по мячу", detail: "Без полноценной игры", met: 5, code: "15695" },
      moderate: { label: "Обычная игра", detail: "Умеренное усилие", met: 6.8, code: "15675" },
      brisk: { label: "Соревнование", detail: "Интенсивная игра", met: 8, code: "15676" },
    },
  },
  basketball: {
    kind: "basketball", label: "Баскетбол", source: "https://pacompendium.com/sports/",
    intensity: {
      easy: { label: "Броски", detail: "Отработка попаданий", met: 5, code: "15070" },
      moderate: { label: "Свободная игра", detail: "Без матча", met: 6, code: "15050" },
      brisk: { label: "Матч", detail: "Полноценная игра", met: 8, code: "15040" },
    },
  },
};

export function isActivityKind(value: unknown): value is ActivityKind {
  return typeof value === "string" && ACTIVITY_KINDS.includes(value as ActivityKind);
}
export function activityDefinition(kind?: ActivityKind): ActivityDefinition {
  return definitions[kind ?? "walk"] ?? definitions.walk;
}
export function isStepActivity(kind?: ActivityKind): boolean {
  return kind === undefined || kind === "walk" || kind === "running";
}

type ActivityInput = Pick<WalkEntry, "kind" | "pace" | "minutes" | "weight" | "time" | "steps" | "distance">;
export function activityValidationError(entry: ActivityInput): string | null {
  if (entry.kind !== undefined && !isActivityKind(entry.kind)) return "Выберите вид активности.";
  if (!ACTIVITY_INTENSITIES.includes(entry.pace)) return "Выберите интенсивность.";
  if (!Number.isFinite(entry.minutes) || entry.minutes < 1 || entry.minutes > 600)
    return "Укажите длительность от 1 до 600 минут.";
  if (!Number.isFinite(entry.weight) || entry.weight < 30 || entry.weight > 350)
    return "Укажите свой вес от 30 до 350 кг для расчёта расхода.";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(entry.time)) return "Укажите время начала занятия.";
  if (!Number.isSafeInteger(entry.steps) || entry.steps < 0 || entry.steps > 100000)
    return "Количество шагов должно быть целым числом от 0 до 100 000.";
  if (!Number.isFinite(entry.distance) || entry.distance < 0 || entry.distance > 300)
    return "Расстояние должно быть от 0 до 300 км.";
  if (!isStepActivity(entry.kind) && (entry.steps !== 0 || entry.distance !== 0))
    return "Шаги и расстояние записываются отдельно для ходьбы и пробежек.";
  return null;
}

export function activityStats(entry: Pick<WalkEntry, "kind" | "pace" | "minutes" | "weight">): { gross: number; active: number } {
  if (!Number.isFinite(entry.minutes) || entry.minutes <= 0 || entry.minutes > 600
    || !Number.isFinite(entry.weight) || entry.weight < 30 || entry.weight > 350
    || (entry.kind !== undefined && !isActivityKind(entry.kind))
    || !ACTIVITY_INTENSITIES.includes(entry.pace)) return { gross: 0, active: 0 };
  const met = activityDefinition(entry.kind).intensity[entry.pace].met;
  // The conventional MET × kg × hours approximation is deliberately consistent
  // with existing walking records. Subtract resting 1 MET for active energy.
  const weightHours = entry.weight * entry.minutes / 60;
  return { gross: Math.round(met * weightHours), active: Math.round((met - 1) * weightHours) };
}
