// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { contrastRatio, contrastText, DEFAULT_THEME, normalizeHex, sanitizeTheme, themeTokens, useTheme } from "./theme";

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

afterEach(() => { document.documentElement.removeAttribute("style"); document.documentElement.removeAttribute("data-diary-theme"); });

describe("authenticated theme lifecycle", () => {
  it("updates portal/body colors and restores the default document on logout", async () => {
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
