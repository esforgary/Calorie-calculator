// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MacroRing, macroComposition, calorieProgress } from "./MacroRing";
import type { Nutrients } from "./types";

const empty: Nutrients = { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 };
const eaten: Nutrients = { kcal: 403, protein: 14, fat: 7, carbs: 65, fiber: 0 };
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
});

async function render(nutrients: Nutrients, target?: number | null) {
  await act(async () => { root.render(<MacroRing nutrients={nutrients} target={target} />); });
}

async function toggle() {
  await act(async () => { container.querySelector<HTMLButtonElement>(".macro-ring")!.click(); });
}

describe("calorieProgress", () => {
  it.each([
    [0, 0, 0, 0, 0],
    [775, 775 / 1816 * 100, 0, 0, 43],
    [1816, 100, 0, 0, 100],
    [2724, 100, 50, 0, 150],
    [3632, 100, 100, 0, 200],
    [4540, 100, 100, 50, 250],
    [5448, 100, 100, 100, 300],
    [7264, 100, 100, 100, 400],
  ])("draws %i kcal against an 1816 kcal goal in successive laps", (kcal, green, yellow, red, percent) => {
    const progress = calorieProgress(kcal, 1816);
    expect(progress.green).toBeCloseTo(green);
    expect(progress.yellow).toBeCloseTo(yellow);
    expect(progress.red).toBeCloseTo(red);
    expect(progress.percent).toBe(percent);
  });

  it.each([undefined, null, 0, -100, NaN, Infinity])("keeps an invalid goal %s neutral", target => {
    expect(calorieProgress(775, target)).toEqual({ target: null, percent: null, green: 0, yellow: 0, red: 0 });
  });

  it("ignores invalid eaten kcal and starts the next lap only above the boundary", () => {
    for (const kcal of [-1, NaN, Infinity]) expect(calorieProgress(kcal, 1816).green).toBe(0);
    expect(calorieProgress(1817, 1816).yellow).toBeCloseTo(100 / 1816);
    expect(calorieProgress(3633, 1816).red).toBeCloseTo(100 / 1816);
  });
});

describe("macroComposition", () => {
  it("uses the eaten macro energy, without requiring a calorie goal", () => {
    const result = macroComposition(eaten);
    expect(result.map(macro => macro.energy)).toEqual([56, 63, 260]);
    expect(result[0].share).toBeCloseTo(56 / 379 * 100);
    expect(result[1].share).toBeCloseTo(63 / 379 * 100);
    expect(result[2].share).toBeCloseTo(260 / 379 * 100);
    expect(result.reduce((sum, macro) => sum + macro.share, 0)).toBeCloseTo(100);
    expect(macroComposition({ ...eaten, kcal: 0 })).toEqual(result);
  });

  it("keeps an empty day neutral and ignores invalid or negative grams", () => {
    expect(macroComposition(empty).every(macro => macro.share === 0)).toBe(true);
    const result = macroComposition({ ...empty, protein: -3, fat: Infinity, carbs: NaN });
    expect(result.every(macro => macro.grams === 0 && macro.energy === 0 && macro.share === 0)).toBe(true);
  });

  it("gives one eaten macro the whole circle", () => {
    expect(macroComposition({ ...empty, fat: 5 }).map(macro => macro.share)).toEqual([0, 100, 0]);
  });
});

describe("MacroRing", () => {
  it("switches between macro composition and calorie progress using a native button", async () => {
    await render({ ...eaten, kcal: 775 }, 1816);
    const button = container.querySelector<HTMLButtonElement>("button")!;
    expect(button.type).toBe("button");
    expect(button.getAttribute("data-mode")).toBe("macros");
    expect(button.getAttribute("aria-label")).toContain("Показать прогресс калорий");
    expect(container.querySelector(".ring-label strong")?.textContent).toBe("775/1816");
    expect(container.querySelector('[role="img"]')?.getAttribute("aria-label")).toContain("Состав съеденного");

    await toggle();
    expect(button.getAttribute("data-mode")).toBe("calories");
    expect(button.getAttribute("aria-label")).toContain("Показать состав БЖУ");
    expect(container.querySelector(".ring-mode-label")?.textContent).toBe("43% от цели");
    expect(container.querySelector('[role="img"]')?.getAttribute("aria-label")).toContain("43% дневного ориентира");
    const progress = container.querySelector('[data-progress="green"]')!;
    expect(progress.parentElement?.classList.contains("is-visible")).toBe(true);
    expect(Number(progress.getAttribute("stroke-dasharray")!.split(" ")[0])).toBeCloseTo(775 / 1816 * 100);
    expect(container.querySelector(".macro-ring-segment")?.parentElement?.getAttribute("aria-hidden")).toBe("true");

    await toggle();
    expect(button.getAttribute("data-mode")).toBe("macros");
    expect(container.querySelector(".ring-label strong")?.textContent).toBe("775/1816");
  });

  it("updates the current calorie mode as food or the goal changes", async () => {
    await render({ ...eaten, kcal: 775 }, 1816);
    await toggle();
    await render({ ...eaten, kcal: 4540 }, 1816);
    expect(container.querySelector(".macro-ring")?.getAttribute("data-mode")).toBe("calories");
    expect(container.querySelector('[data-progress="red"]')?.getAttribute("stroke-dasharray")).toBe("50 50");
    expect(container.querySelector(".ring-label strong")?.textContent).toBe("4540/1816");
    expect(container.querySelector(".ring-mode-label")?.textContent).toBe("250% от цели");

    await render({ ...eaten, kcal: 4540 }, 4540);
    expect(container.querySelector('[data-progress="green"]')?.getAttribute("stroke-dasharray")).toBe("100 0");
    expect(container.querySelector('[data-progress="yellow"]')?.getAttribute("stroke-dasharray")).toBe("0 100");
    expect(container.querySelector('[data-progress="red"]')?.getAttribute("stroke-dasharray")).toBe("0 100");
    expect(container.querySelector(".ring-mode-label")?.textContent).toBe("100% от цели");
  });

  it("keeps calories readable with no goal, including after removing a saved goal", async () => {
    await render(eaten, 1816);
    await toggle();
    await render(eaten, 0);
    expect(container.querySelector(".ring-label strong")?.textContent).toBe("403");
    expect(container.querySelector(".ring-mode-label")?.textContent).toBe("Цель не задана");
    expect(container.querySelector('[role="img"]')?.getAttribute("aria-label")).toContain("Дневной ориентир не задан");
    for (const segment of container.querySelectorAll(".calorie-progress-segment")) {
      expect(segment.getAttribute("stroke-dasharray")).toBe("0 100");
    }
  });

  it("renders three contiguous colored sections and keeps recorded kcal in the center", async () => {
    await render(eaten);
    const segments = [...container.querySelectorAll<SVGCircleElement>(".macro-ring-segment")];
    expect(segments.map(segment => segment.getAttribute("stroke"))).toEqual([
      "var(--protein)", "var(--fat)", "var(--carbs)",
    ]);
    let offset = 0;
    for (const segment of segments) {
      const [share, remaining] = segment.getAttribute("stroke-dasharray")!.split(" ").map(Number);
      expect(share + remaining).toBeCloseTo(100);
      expect(Number(segment.getAttribute("stroke-dashoffset"))).toBeCloseTo(-offset);
      offset += share;
    }
    expect(offset).toBeCloseTo(100);
    expect(container.querySelector(".ring-label strong")?.textContent).toBe("403");
    const label = container.querySelector('[role="img"]')?.getAttribute("aria-label");
    expect(label).toContain("Белки — 14 г");
    expect(label).toContain("Жиры — 7 г");
    expect(label).toContain("Углеводы — 65 г");
    expect(container.querySelector(".ring-label > svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("has no colored dots when macros are zero", async () => {
    await render(empty);
    expect(container.querySelectorAll(".macro-ring-segment")).toHaveLength(0);
    expect(container.querySelectorAll(".ring-track")).toHaveLength(1);
    expect(container.querySelector('[role="img"]')?.getAttribute("aria-label")).toContain("0 г");
  });

  it("does not render zero-length sections next to a single macro", async () => {
    await render({ ...empty, fat: 5, kcal: 45 });
    const segments = container.querySelectorAll(".macro-ring-segment");
    expect(segments).toHaveLength(1);
    expect(segments[0].getAttribute("data-macro")).toBe("fat");
    expect(segments[0].getAttribute("stroke-dasharray")).toBe("100 0");
    expect(segments[0].getAttribute("stroke-dashoffset")).toBe("0");
  });
});
