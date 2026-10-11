// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { contrastRatio, contrastText, DEFAULT_THEME, initializeTheme, normalizeHex, readSavedTheme, sanitizeTheme, THEME_STORAGE_KEY, themeTokens, useTheme } from "./theme";

describe("theme colors", () => {
  it("normalizes shorthand and rejects CSS expressions, alpha colors and malformed imported values", () => {
    expect(normalizeHex(" #aBc ")).toBe("#aabbcc");
    expect(normalizeHex("#12A0fF")).toBe("#12a0ff");
    for (const color of ["red", "var(--color)", "#12345678", "#zzzzzz", "#fff;display:none", 12, null]) expect(normalizeHex(color)).toBeUndefined();
    expect(sanitizeTheme({ accent: "url(https://example.com)", surface: "#000" })).toEqual({ ...DEFAULT_THEME, surface: "#000000" });
  });

  it("chooses truly contrasting black or white rather than a brightness threshold", () => {
    expect(contrastText("#b7ff39")).toBe("#000000");
    expect(contrastText("#16131e")).toBe("#ffffff");
    expect(contrastText("#ff0000")).toBe("#000000");
    expect(contrastRatio("#000000", "#ffffff")).toBe(21);
    for (let r = 0; r <= 255; r += 17) {
      for (let g = 0; g <= 255; g += 17) {
        for (let b = 0; b <= 255; b += 17) {
          const fill = `#${[r, g, b].map(value => value.toString(16).padStart(2, "0")).join("")}`;
          expect(contrastRatio(fill, contrastText(fill))).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it("keeps derived surfaces, selected fills, hover buttons and secondary text readable across custom palettes", () => {
    for (const color of ["#ffffff", "#000000", "#757575", "#ff0000", "#00ff00", "#0000ff", "#b7ff39"]) {
      const tokens = themeTokens({ accent: color, surface: color, background: color });
      for (const [fill, text] of [
        ["--accent", "--accent-text"], ["--green-dark", "--accent-hover-text"],
        ["--surface", "--surface-ink"], ["--surface", "--surface-muted"],
        ["--app-background", "--background-ink"], ["--app-background", "--background-muted"],
        ["--panel", "--panel-ink"], ["--panel", "--panel-muted"],
        ["--surface-soft", "--surface-soft-ink"], ["--surface-tint", "--surface-tint-ink"],
      ]) expect(contrastRatio(tokens[fill], tokens[text])).toBeGreaterThanOrEqual(4.5);
    }
    const defaults = themeTokens();
    expect(defaults["--panel"]).not.toBe(defaults["--surface"]);
    expect(defaults["--panel-ink"]).toBe("#ffffff");
    expect(defaults["--surface-ink"]).toBe("#000000");
  });
});

afterEach(() => {
  vi.restoreAllMocks(); localStorage.clear();
  document.documentElement.removeAttribute("style"); document.documentElement.removeAttribute("data-diary-theme");
  document.querySelector('meta[name="theme-color"]')?.remove();
});

describe("startup appearance", () => {
  it("applies saved colors and browser chrome before React or session checks run", () => {
    const palette = { accent: "#7bb8ff", background: "#101c2b", surface: "#edf4fc" };
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ ...palette, unrelated: "discard" }));
    const meta = document.createElement('meta'); meta.name = 'theme-color'; meta.content = '#14171c'; document.head.append(meta);
    initializeTheme();
    expect(readSavedTheme()).toEqual(palette);
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe(palette.accent);
    expect(document.documentElement.style.getPropertyValue('--app-background')).toBe(palette.background);
    expect(document.documentElement.style.getPropertyValue('--surface')).toBe(palette.surface);
    expect(meta.content).toBe(palette.background);
  });
  it("ignores broken, partial or CSS-injecting palette caches", () => {
    for (const invalid of ['{bad', 'null', '[]', JSON.stringify({accent:'#fff'}), JSON.stringify({...DEFAULT_THEME, background:'url(https://example.test)'})]) {
      localStorage.setItem(THEME_STORAGE_KEY, invalid);
      expect(readSavedTheme()).toEqual(DEFAULT_THEME);
      expect(() => initializeTheme()).not.toThrow();
    }
  });
  it("can start when browser storage is disabled", () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Denied', 'SecurityError'); });
    expect(readSavedTheme()).toEqual(DEFAULT_THEME);
    expect(() => initializeTheme()).not.toThrow();
  });
});

describe("document theme lifecycle", () => {
  it("updates portal/body colors and restores the host document on unmount", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    document.documentElement.style.setProperty("--green", "#123456");
    function Fixture({ color }: { color: string }) { useTheme({ ...DEFAULT_THEME, accent: color }); return null; }
    await act(async () => root.render(<Fixture color="#0000ff" />));
    expect(document.documentElement.style.getPropertyValue("--green")).toBe("#0000ff");
    expect(document.documentElement.style.getPropertyValue("--accent-text")).toBe("#ffffff");
    await act(async () => root.render(<Fixture color="#ffff00" />));
    expect(document.documentElement.style.getPropertyValue("--green")).toBe("#ffff00");
    expect(document.documentElement.style.getPropertyValue("--accent-text")).toBe("#000000");
    await act(async () => root.unmount());
    expect(document.documentElement.style.getPropertyValue("--green")).toBe("#123456");
    expect(document.documentElement.style.getPropertyValue("--accent-text")).toBe("");
    expect(document.documentElement.hasAttribute("data-diary-theme")).toBe(false);
    host.remove();
  });
});
