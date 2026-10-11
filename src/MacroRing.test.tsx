// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MacroRing, macroComposition } from "./MacroRing";
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

async function render(nutrients: Nutrients) {
  await act(async () => { root.render(<MacroRing nutrients={nutrients} />); });
}

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
