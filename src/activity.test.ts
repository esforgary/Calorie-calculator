import { describe, expect, it, vi } from "vitest";
import { ACTIVITY_KINDS, activityDefinition, activityStats, activityValidationError, isStepActivity } from "./activity";
import { walkStats } from "./nutrition";
import { createInitialData } from "./seed";
import type { ActivityKind, WalkEntry } from "./types";

vi.mock("./supabase", () => ({ configured: false, supabase: null, sessionPolicy: null, supabaseConfigurationError: null }));
import { isAppData } from "./useAppData";

const entry: WalkEntry = { id: "activity", date: "2026-10-11", time: "14:30", minutes: 60, steps: 0, distance: 0, weight: 70, pace: "moderate" };

describe("activity estimates", () => {
  it("preserves saved walks without a kind and separates resting expenditure", () => {
    expect(activityDefinition().kind).toBe("walk");
    expect(activityStats(entry)).toEqual({ gross: 266, active: 196 });
    expect(walkStats(entry)).toEqual(activityStats({ ...entry, kind: "walk" }));
    expect(isStepActivity()).toBe(true);
    expect(isStepActivity("running")).toBe(true);
  });

  it("uses the selected sport and duration without adding resting energy to active energy", () => {
    const running = { ...entry, kind: "running" as const, weight: 80, minutes: 30 };
    expect(activityStats(running)).toEqual({ gross: 340, active: 300 });
    expect(activityStats({ ...running, minutes: 60 })).toEqual({ gross: 680, active: 600 });
    expect(activityStats({ ...entry, kind: "swimming", pace: "brisk", weight: 80, minutes: 30 })).toEqual({ gross: 392, active: 352 });
    expect(activityStats({ ...entry, kind: "dumbbells", pace: "easy", weight: 80, minutes: 30 })).toEqual({ gross: 140, active: 100 });
    expect(activityStats({ ...entry, kind: "cycling" })).toEqual({ gross: 490, active: 420 });
    for (const kind of ACTIVITY_KINDS) {
      const result = activityStats({ ...entry, kind });
      expect(result.gross - result.active).toBe(70);
    }
  });

  it("does not create calorie estimates from invalid durations or weights", () => {
    for (const minutes of [NaN, Infinity, -10, 0, 601]) {
      expect(activityStats({ ...entry, minutes })).toEqual({ gross: 0, active: 0 });
      expect(activityValidationError({ ...entry, minutes })).not.toBeNull();
    }
    for (const weight of [NaN, Infinity, 0, -1, 29, 351]) {
      expect(activityStats({ ...entry, weight })).toEqual({ gross: 0, active: 0 });
      expect(activityValidationError({ ...entry, weight })).not.toBeNull();
    }
    expect(activityValidationError({ ...entry, time: "24:10" })).not.toBeNull();
    expect(activityValidationError({ ...entry, time: "12:80" })).not.toBeNull();
    expect(activityValidationError({ ...entry, steps: 1.5 })).not.toBeNull();
    expect(activityValidationError({ ...entry, distance: 301 })).not.toBeNull();
  });

  it("requires zero steps and walking distance for other sports", () => {
    for (const kind of ACTIVITY_KINDS.filter(kind => !isStepActivity(kind))) {
      expect(activityValidationError({ ...entry, kind })).toBeNull();
      expect(activityValidationError({ ...entry, kind, steps: 100 })).not.toBeNull();
      expect(activityValidationError({ ...entry, kind, distance: 2 })).not.toBeNull();
    }
  });
});

describe("version 1 diary compatibility", () => {
  it("loads old walks and new activity types without changing the diary format", () => {
    const data = createInitialData();
    expect(isAppData({ ...data, walks: [entry] })).toBe(true);
    for (const kind of ACTIVITY_KINDS) expect(isAppData({ ...data, walks: [{ ...entry, kind }] })).toBe(true);
    expect(isAppData({ ...data, walks: [{ ...entry, kind: "unknown" as ActivityKind }] })).toBe(false);
    expect(isAppData({ ...data, walks: [{ ...entry, kind: "running", minutes: 0 }] })).toBe(false);
    expect(isAppData({ ...data, walks: [{ ...entry, kind: "swimming", steps: 500 }] })).toBe(false);
  });

  it("accepts optional complete hex themes and rejects incomplete or non-color values", () => {
    const data = createInitialData();
    expect(isAppData(data)).toBe(true);
    const theme = { accent: "#B7FF39", background: "#14171c", surface: "#fdfdfd" };
    expect(isAppData({ ...data, theme })).toBe(true);
    expect(isAppData({ ...data, theme: { ...theme, accent: "#fff" } })).toBe(false);
    expect(isAppData({ ...data, theme: { ...theme, background: "url(test)" } })).toBe(false);
    expect(isAppData({ ...data, theme: { accent: "#ffffff" } })).toBe(false);
    expect(isAppData({ ...data, theme: null })).toBe(false);
  });
});
