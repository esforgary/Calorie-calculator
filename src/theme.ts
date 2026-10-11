import { useLayoutEffect, useState } from "react";
import type { CSSProperties } from "react";

export interface ThemeColors { accent: string; background: string; surface: string }
export const DEFAULT_THEME: ThemeColors = { accent: "#b7ff39", background: "#14171c", surface: "#ffffff" };
export const THEME_STORAGE_KEY = "ritm:appearance:v1";

/** Accept plain, opaque hex colors only; imported diaries must never inject CSS. */
export function normalizeHex(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  const text = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(text)) return text.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(text)) return `#${[...text.slice(1)].map(char => char + char).join("")}`.toLowerCase();
}

export function sanitizeTheme(value?: Partial<ThemeColors> | null): ThemeColors {
  return {
    accent: normalizeHex(value?.accent) ?? DEFAULT_THEME.accent,
    background: normalizeHex(value?.background) ?? DEFAULT_THEME.background,
    surface: normalizeHex(value?.surface) ?? DEFAULT_THEME.surface,
  };
}

/** The pre-login cache contains only three colors, never diary or account data. */
export function readSavedTheme(): ThemeColors {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(THEME_STORAGE_KEY) ?? "null");
    if (value && typeof value === "object" && !Array.isArray(value)
      && ["accent", "background", "surface"].every(key => normalizeHex((value as Record<string, unknown>)[key]))) {
      return sanitizeTheme(value as ThemeColors);
    }
  } catch { /* Storage can be unavailable or contain an invalid previous value. */ }
  return { ...DEFAULT_THEME };
}

function rememberTheme(value: ThemeColors): void {
  try { window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(sanitizeTheme(value))); }
  catch { /* Color caching must not block login or diary use. */ }
}

function channels(hex: string): number[] {
  const color = normalizeHex(hex) ?? "#000000";
  return [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16));
}

export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map(channel => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(first: string, second: string): number {
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** The stronger of black/white always provides at least 4.58:1 on opaque sRGB. */
export function contrastText(fill: string): "#000000" | "#ffffff" {
  return contrastRatio(fill, "#000000") >= contrastRatio(fill, "#ffffff") ? "#000000" : "#ffffff";
}

export function mixColor(first: string, second: string, amount: number): string {
  const a = channels(first), b = channels(second);
  const weight = Math.max(0, Math.min(1, amount));
  return `#${a.map((channel, index) => Math.round(channel * (1 - weight) + b[index] * weight).toString(16).padStart(2, "0")).join("")}`;
}

function mutedText(fill: string): string {
  const ink = contrastText(fill);
  for (let amount = 0.64; amount < 1; amount += 0.04) {
    const candidate = mixColor(fill, ink, amount);
    if (contrastRatio(fill, candidate) >= 4.5) return candidate;
  }
  return ink;
}

export function themeTokens(value?: Partial<ThemeColors> | null): Record<string, string> {
  const theme = sanitizeTheme(value);
  const backgroundInk = contrastText(theme.background), surfaceInk = contrastText(theme.surface);
  // The original palette uses dark metric panels. A custom block color also colors those panels.
  const panel = theme.surface === DEFAULT_THEME.surface
    ? mixColor(theme.background, backgroundInk, 0.08)
    : mixColor(theme.surface, theme.background, 0.12);
  const panelInk = contrastText(panel);
  const accentHover = mixColor(theme.accent, contrastText(theme.accent), 0.08);
  const surfaceSoft = mixColor(theme.surface, surfaceInk, 0.055);
  const tint = mixColor(theme.surface, theme.accent, 0.15);
  return {
    "--green": theme.accent,
    "--green-dark": accentHover,
    "--accent": theme.accent,
    "--accent-text": contrastText(theme.accent),
    "--accent-hover-text": contrastText(accentHover),
    "--app-background": theme.background,
    "--background-ink": backgroundInk,
    "--background-muted": mutedText(theme.background),
    "--background-line": mixColor(theme.background, backgroundInk, 0.15),
    "--background-glow": mixColor(theme.background, backgroundInk, 0.055),
    "--card": theme.surface,
    "--text": surfaceInk,
    "--border": mixColor(theme.surface, surfaceInk, 0.15),
    "--line": mixColor(theme.surface, surfaceInk, 0.13),
    "--surface": theme.surface,
    "--surface-ink": surfaceInk,
    "--surface-muted": mutedText(theme.surface),
    "--surface-soft": surfaceSoft,
    "--surface-soft-ink": contrastText(surfaceSoft),
    "--surface-tint": tint,
    "--surface-tint-ink": contrastText(tint),
    "--panel": panel,
    "--panel-ink": panelInk,
    "--panel-muted": mutedText(panel),
    "--panel-line": mixColor(panel, panelInk, 0.18),
    "--panel-soft": mixColor(panel, panelInk, 0.07),
    "--panel-track": mixColor(panel, panelInk, 0.16),
    "--focus-ring": contrastRatio(theme.accent, theme.surface) >= 3 ? theme.accent : surfaceInk,
    "--surface-scheme": surfaceInk === "#ffffff" ? "dark" : "light",
  };
}

export function themeStyle(value?: Partial<ThemeColors> | null): CSSProperties {
  return themeTokens(value) as CSSProperties;
}

function applyTheme(value: ThemeColors): void {
  for (const [name, color] of Object.entries(themeTokens(value))) document.documentElement.style.setProperty(name, color);
  document.documentElement.setAttribute("data-diary-theme", "active");
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", value.background);
}

/** Run synchronously before React paints its session-check screen. */
export function initializeTheme(): void {
  applyTheme(readSavedTheme());
}

/** Keep the last palette through loading/logout; cloud colors take over once the diary is ready. */
export function useApplicationTheme(value: Partial<ThemeColors> | null | undefined, ready: boolean): void {
  const [remembered, setRemembered] = useState(readSavedTheme);
  const { accent, background, surface } = sanitizeTheme(ready ? value : remembered);
  useTheme({ accent, background, surface });
  useLayoutEffect(() => {
    if (!ready) return;
    const next = { accent, background, surface };
    rememberTheme(next);
    setRemembered(previous => previous.accent === accent && previous.background === background && previous.surface === surface ? previous : next);
  }, [ready, accent, background, surface]);
}

/** Apply one palette to document backgrounds and portal content, restoring the host on unmount. */
export function useTheme(value?: Partial<ThemeColors> | null): void {
  const { accent, background, surface } = sanitizeTheme(value);
  useLayoutEffect(() => {
    const element = document.documentElement;
    const tokens = themeTokens({ accent, background, surface });
    const previous = Object.keys(tokens).map(name => ({ name, value: element.style.getPropertyValue(name), priority: element.style.getPropertyPriority(name) }));
    const oldAttribute = element.getAttribute("data-diary-theme");
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const oldMetaColor = meta?.getAttribute("content");
    applyTheme({ accent, background, surface });
    return () => {
      for (const property of previous) {
        if (property.value) element.style.setProperty(property.name, property.value, property.priority);
        else element.style.removeProperty(property.name);
      }
      if (oldAttribute === null) element.removeAttribute("data-diary-theme");
      else element.setAttribute("data-diary-theme", oldAttribute);
      if (meta) {
        if (oldMetaColor == null) meta.removeAttribute("content");
        else meta.setAttribute("content", oldMetaColor);
      }
    };
  }, [accent, background, surface]);
}
