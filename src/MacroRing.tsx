import { useState } from "react";
import { Flame } from "lucide-react";
import type { Nutrients } from "./types";
import "./macroRing.css";

type MacroKey = "protein" | "fat" | "carbs";
export interface MacroComposition {
  key: MacroKey;
  label: string;
  grams: number;
  energy: number;
  share: number;
}

const macros: { key: MacroKey; label: string; kcalPerGram: number }[] = [
  { key: "protein", label: "Белки", kcalPerGram: 4 },
  { key: "fat", label: "Жиры", kcalPerGram: 9 },
  { key: "carbs", label: "Углеводы", kcalPerGram: 4 },
];
const nonnegative = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0;
const number = (value: number, digits = 0) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: digits }).format(value);

/** Shares describe energy from the eaten macros, independently of a daily goal. */
export function macroComposition(nutrients: Nutrients): MacroComposition[] {
  const composition = macros.map(({ key, label, kcalPerGram }) => {
    const grams = nonnegative(nutrients[key]);
    return { key, label, grams, energy: grams * kcalPerGram, share: 0 };
  });
  const total = composition.reduce((sum, macro) => sum + macro.energy, 0);
  return composition.map(macro => ({
    ...macro,
    share: total > 0 ? macro.energy / total * 100 : 0,
  }));
}

/** Each extra daily allowance covers the previous lap with the next color. */
export function calorieProgress(kcal: number, target?: number | null) {
  const goal = typeof target === "number" && Number.isFinite(target) && target > 0 ? target : null;
  const ratio = goal ? Math.min(nonnegative(kcal) / goal, Number.MAX_SAFE_INTEGER / 100) : 0;
  const lap = (index: number) => Math.min(1, Math.max(0, ratio - index)) * 100;
  return { target: goal, percent: goal ? Math.round(ratio * 100) : null, green: lap(0), yellow: lap(1), red: lap(2) };
}

export function MacroRing({ nutrients, target }: { nutrients: Nutrients; target?: number | null }) {
  const [mode, setMode] = useState<"macros" | "calories">("macros");
  const composition = macroComposition(nutrients);
  const progress = calorieProgress(nutrients.kcal, target);
  const isCalories = mode === "calories";
  const kcal = nonnegative(nutrients.kcal);
  const centerNumber = (value: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0, useGrouping: false }).format(value);
  const hasMacros = composition.some(macro => macro.share > 0);
  const macroSummary = hasMacros
    ? `Состав съеденного по доле энергии: ${composition.map(macro =>
      `${macro.label} — ${number(macro.grams, 1)} г, ${number(macro.share, 1)}%`
    ).join("; ")}`
    : "Состав съеденного: белки, жиры и углеводы — 0 г";
  const calorieSummary = progress.target
    ? `Съедено ${number(kcal)} из ${number(progress.target)} ккал — ${progress.percent}% дневного ориентира`
    : `Съедено ${number(kcal)} ккал. Дневной ориентир не задан`;
  const summary = isCalories ? calorieSummary : macroSummary;
  const action = isCalories ? "Показать состав БЖУ" : "Показать прогресс калорий";
  let offset = 0;

  return (
    <button
      type="button"
      className="calorie-ring macro-ring"
      data-mode={mode}
      aria-label={`${isCalories ? "Калории" : "Состав БЖУ"}. ${calorieSummary}. ${action}`}
      title={action}
      onClick={() => setMode(isCalories ? "macros" : "calories")}
    >
      <svg className="macro-ring-chart" viewBox="0 0 220 220" role="img" aria-label={summary}>
        <title>{summary}</title>
        <circle cx="110" cy="110" r="94" className="ring-track" />
        <g className={`ring-layer${!isCalories ? " is-visible" : ""}`} aria-hidden={isCalories}>
          {composition.map(macro => {
            const start = offset;
            offset += macro.share;
            if (macro.share <= 0) return null;
            return (
              <circle
                key={macro.key}
                cx="110"
                cy="110"
                r="94"
                pathLength="100"
                className="macro-ring-segment"
                data-macro={macro.key}
                stroke={`var(--${macro.key})`}
                strokeDasharray={`${macro.share} ${100 - macro.share}`}
                strokeDashoffset={-start}
              >
                <title>{macro.label}: {number(macro.grams, 1)} г · {number(macro.share, 1)}% энергии</title>
              </circle>
            );
          })}
        </g>
        <g className={`ring-layer${isCalories ? " is-visible" : ""}`} aria-hidden={!isCalories}>
          {(["green", "yellow", "red"] as const).map(color => (
            <circle
              key={color}
              cx="110"
              cy="110"
              r="94"
              pathLength="100"
              className={`calorie-progress-segment calorie-progress-${color}`}
              data-progress={color}
              strokeDasharray={`${progress[color]} ${100 - progress[color]}`}
            />
          ))}
        </g>
      </svg>
      <span className="ring-label" aria-hidden="true">
        <Flame size={21} aria-hidden="true" />
        <strong>{centerNumber(kcal)}</strong>
        <span className="ring-mode-label">{isCalories
          ? progress.percent === null ? "Цель не задана" : `${progress.percent}% от цели`
          : "ккал · состав БЖУ"}</span>
      </span>
    </button>
  );
}
