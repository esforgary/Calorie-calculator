// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeSettings } from "./ThemeSettings";
import { DEFAULT_THEME } from "./theme";
import type { ThemeColors } from "./theme";
import type { SavedThemePreset } from "./types";

type PresetUpdate = (current: SavedThemePreset[]) => SavedThemePreset[];
const evening: SavedThemePreset = {
  id: "evening", name: "Вечер", colors: { accent: "#bbaaff", background: "#112233", surface: "#334455" },
};
const morning: SavedThemePreset = {
  id: "morning", name: "Утро", colors: { accent: "#ffaa77", background: "#223344", surface: "#ddeeff" },
};
const save = vi.fn<(theme: ThemeColors) => boolean>();
const changePresets = vi.fn<(update: PresetUpdate) => boolean>();
let root: Root;
let host: HTMLDivElement;

function Fixture({ initialPresets = [], value = DEFAULT_THEME, disabled = false }: {
  initialPresets?: SavedThemePreset[]; value?: ThemeColors; disabled?: boolean;
}) {
  const [theme, setTheme] = useState(value);
  const [presets, setPresets] = useState(initialPresets);
  return <ThemeSettings value={theme} customPresets={presets} disabled={disabled}
    onSave={next => { if (!save(next)) return false; setTheme(next); return true; }}
    onPresetsChange={update => { if (!changePresets(update)) return false; setPresets(update); return true; }} />;
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  save.mockReset().mockReturnValue(true);
  changePresets.mockReset().mockReturnValue(true);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

function button(label: string) {
  const element = [...host.querySelectorAll("button")].find(node => node.textContent?.trim() === label || node.getAttribute("aria-label") === label);
  expect(element, `Button ${label}`).toBeDefined();
  return element!;
}
async function click(label: string) { await act(async () => button(label).click()); }
function input(selector: string) {
  const element = host.querySelector<HTMLInputElement>(selector);
  expect(element, `Input ${selector}`).not.toBeNull();
  return element!;
}
async function fill(selector: string, value: string) {
  await act(async () => {
    const element = input(selector);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const presetStatus = () => host.querySelector(".theme-preset-status")?.textContent;
const themeStatus = () => host.querySelector(".theme-save-status")?.textContent;

describe("named theme presets", () => {
  it("saves the current draft with a trimmed name and normalized colors without applying it", async () => {
    await act(async () => root.render(<Fixture initialPresets={[evening]} />));
    await fill("#theme-accent", "#AbC");
    await fill("#theme-background", "#102030");
    await fill("#theme-surface", "#EEDDCC");
    await fill("#theme-preset-name", "  Мой шаблон  ");
    await click("Сохранить шаблон");

    expect(changePresets).toHaveBeenCalledTimes(1);
    const next = changePresets.mock.calls[0][0]([evening]);
    expect(next).toEqual([evening, {
      id: expect.any(String), name: "Мой шаблон",
      colors: { accent: "#aabbcc", background: "#102030", surface: "#eeddcc" },
    }]);
    expect(next[1].id).not.toBe(evening.id);
    expect(button("Мой шаблон")).toBeDefined();
    expect(input("#theme-preset-name").value).toBe("");
    expect(presetStatus()).toBe("Шаблон «Мой шаблон» сохранён");
    expect(save).not.toHaveBeenCalled();
    expect(themeStatus()).toBe("Есть изменения");
  });

  it("previews a selected preset and only applies its colors after clicking Apply", async () => {
    await act(async () => root.render(<Fixture initialPresets={[evening]} />));
    await click("Вечер");
    expect(button("Вечер").getAttribute("aria-pressed")).toBe("true");
    expect(input("#theme-accent").value).toBe(evening.colors.accent);
    expect(input("#theme-background").value).toBe(evening.colors.background);
    expect(input("#theme-surface").value).toBe(evening.colors.surface);
    expect(save).not.toHaveBeenCalled();
    expect(changePresets).not.toHaveBeenCalled();

    await click("Применить");
    expect(save).toHaveBeenCalledExactlyOnceWith(evening.colors);
    expect(themeStatus()).toBe("Цвета сохранены");
    expect(button("Применить").disabled).toBe(true);
  });

  it("rejects an existing name regardless of case when saving a new preset", async () => {
    await act(async () => root.render(<Fixture initialPresets={[{ ...evening, name: " Вечер " }]} />));
    await fill("#theme-preset-name", "  вЕчЕр  ");
    await click("Сохранить шаблон");
    expect(changePresets).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("уже есть");
    expect(presetStatus()).toBe("");
    expect(host.querySelectorAll(".theme-custom-list > li")).toHaveLength(1);
  });

  it("rejects a duplicate rename and then saves a trimmed name while preserving the preset colors and id", async () => {
    await act(async () => root.render(<Fixture initialPresets={[evening, morning]} />));
    await click("Переименовать шаблон «Вечер»");
    await fill('[aria-label="Новое название шаблона"]', " уТрО ");
    await click("Сохранить название");
    expect(changePresets).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("уже есть");

    await fill('[aria-label="Новое название шаблона"]', "  Поздний вечер  ");
    await click("Сохранить название");
    expect(changePresets).toHaveBeenCalledTimes(1);
    expect(changePresets.mock.calls[0][0]([evening, morning])).toEqual([{ ...evening, name: "Поздний вечер" }, morning]);
    expect(button("Поздний вечер")).toBeDefined();
    expect(host.querySelector('[aria-label="Новое название шаблона"]')).toBeNull();
    expect(presetStatus()).toBe("Название шаблона изменено");
    expect(save).not.toHaveBeenCalled();
  });

  it("requires confirmation to delete a preset and keeps its applied colors", async () => {
    await act(async () => root.render(<Fixture initialPresets={[evening]} value={evening.colors} />));
    await click("Удалить шаблон «Вечер»");
    expect(host.textContent).toContain("Удалить «Вечер»? Текущие цвета останутся.");
    expect(changePresets).not.toHaveBeenCalled();
    await click("Отмена");
    expect(host.querySelector(".theme-preset-confirm")).toBeNull();
    expect(button("Вечер")).toBeDefined();
    await click("Удалить шаблон «Вечер»");
    await click("Удалить шаблон");

    expect(changePresets).toHaveBeenCalledTimes(1);
    expect(changePresets.mock.calls[0][0]([evening])).toEqual([]);
    expect(host.querySelector(".theme-custom-list")).toBeNull();
    expect(presetStatus()).toBe("Шаблон удалён");
    expect(save).not.toHaveBeenCalled();
    expect(input("#theme-accent").value).toBe(evening.colors.accent);
    expect(input("#theme-background").value).toBe(evening.colors.background);
    expect(input("#theme-surface").value).toBe(evening.colors.surface);
    expect(button("Применить").disabled).toBe(true);
  });

  it("disables persisted changes and never reports success when editing is unavailable", async () => {
    await act(async () => root.render(<Fixture initialPresets={[evening]} disabled />));
    expect(input("#theme-preset-name").disabled).toBe(true);
    for (const label of ["Сохранить шаблон", "Переименовать шаблон «Вечер»", "Удалить шаблон «Вечер»"]) {
      expect(button(label).disabled).toBe(true);
      await click(label);
    }
    await click("Вечер");
    expect(button("Применить").disabled).toBe(true);
    await click("Применить");
    await act(async () => { host.querySelector(".theme-preset-save")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(changePresets).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(presetStatus()).toBe("");
    expect(themeStatus()).not.toContain("сохранены");
  });

  it("retains pending input and confirmation without success messages when callbacks reject changes", async () => {
    save.mockReturnValue(false);
    changePresets.mockReturnValue(false);
    await act(async () => root.render(<Fixture initialPresets={[evening]} />));
    await fill("#theme-preset-name", "Новый");
    await click("Сохранить шаблон");
    expect(input("#theme-preset-name").value).toBe("Новый");
    expect(presetStatus()).toBe("");
    expect(host.querySelectorAll(".theme-custom-list > li")).toHaveLength(1);

    await click("Переименовать шаблон «Вечер»");
    await fill('[aria-label="Новое название шаблона"]', "Другое имя");
    await click("Сохранить название");
    expect(input('[aria-label="Новое название шаблона"]').value).toBe("Другое имя");
    expect(presetStatus()).toBe("");
    await click("Отменить переименование");
    await click("Удалить шаблон «Вечер»");
    await click("Удалить шаблон");
    expect(host.querySelector(".theme-preset-confirm")).not.toBeNull();
    expect(button("Вечер")).toBeDefined();
    expect(presetStatus()).toBe("");
    expect(changePresets).toHaveBeenCalledTimes(3);

    await click("Вечер");
    await click("Применить");
    expect(save).toHaveBeenCalledExactlyOnceWith(evening.colors);
    expect(themeStatus()).toBe("Есть изменения");
    expect(button("Применить").disabled).toBe(false);
  });
});
