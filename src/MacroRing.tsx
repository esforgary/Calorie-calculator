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

export function MacroRing({ nutrients }: { nutrients: Nutrients }) {
  const composition = macroComposition(nutrients);
  const hasMacros = composition.some(macro => macro.share > 0);
  const summary = hasMacros
    ? `Состав съеденного по доле энергии: ${composition.map(macro =>
      `${macro.label} — ${number(macro.grams, 1)} г, ${number(macro.share, 1)}%`
    ).join("; ")}`
    : "Состав съеденного: белки, жиры и углеводы — 0 г";
  let offset = 0;

  return (
    <div className="calorie-ring macro-ring">
      <svg className="macro-ring-chart" viewBox="0 0 220 220" role="img" aria-label={summary}>
        <title>{summary}</title>
        <circle cx="110" cy="110" r="94" className="ring-track" />
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
      </svg>
      <div className="ring-label">
        <Flame size={21} aria-hidden="true" />
        <strong>{number(nonnegative(nutrients.kcal))}</strong>
        <span>ккал съедено</span>
      </div>
    </div>
  );
}
