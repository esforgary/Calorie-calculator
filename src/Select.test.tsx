// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CustomSelect } from "./Select";

let root: Root;
let container: HTMLDivElement;
let changed = vi.fn<(value: string) => void>();

function Fixture({ modal = false }: { modal?: boolean }) {
  const [value, setValue] = useState("apple");
  return <div role={modal ? "dialog" : undefined} aria-modal={modal || undefined}>
    <CustomSelect value={value} onValueChange={(next) => { changed(next); setValue(next); }} aria-label="Продукт">
      <option value="apple">Яблоко</option>
      <option value="removed" disabled>Удалённый продукт</option>
      <option value="cheese">Сыр</option>
      <option value="chicken">Курица</option>
    </CustomSelect>
    <button type="button">Далее</button>
  </div>;
}

function trigger() { return container.querySelector<HTMLButtonElement>('[role="combobox"]')!; }
async function key(value: string) {
  await act(async () => { trigger().dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true })); });
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  changed = vi.fn();
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("CustomSelect", () => {
  it("skips disabled options, keeps focus on the trigger and commits with Enter", async () => {
    await act(async () => root.render(<Fixture />));
    trigger().focus();
    await key("ArrowDown");
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    await key("ArrowDown");
    const activeId = trigger().getAttribute("aria-activedescendant")!;
    expect(document.getElementById(activeId)?.textContent).toBe("Сыр");
    expect(document.activeElement).toBe(trigger());
    await key("Enter");
    expect(changed).toHaveBeenCalledWith("cheese");
    expect(trigger().textContent).toBe("Сыр");
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
  });

  it("supports Home, End and Cyrillic typeahead", async () => {
    await act(async () => root.render(<Fixture />));
    await key(" ");
    await key("End");
    await key("Enter");
    expect(changed).toHaveBeenLastCalledWith("chicken");
    await key(" ");
    await key("Home");
    await key("Enter");
    expect(changed).toHaveBeenLastCalledWith("apple");
    await key("с");
    await key("ы");
    await key("Enter");
    expect(changed).toHaveBeenLastCalledWith("cheese");
  });

  it("keeps the portal inside a modal and Escape closes only the select", async () => {
    await act(async () => root.render(<Fixture modal />));
    const modalEscape = vi.fn();
    document.addEventListener("keydown", modalEscape);
    await act(async () => trigger().click());
    expect(container.querySelector('[role="dialog"] [role="listbox"]')).not.toBeNull();
    await key("Escape");
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(modalEscape).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
    document.removeEventListener("keydown", modalEscape);
  });

  it("allows pointer choice and closes on an outside press", async () => {
    await act(async () => root.render(<Fixture />));
    await act(async () => trigger().click());
    const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((node) => node.textContent === "Курица")!;
    await act(async () => option.click());
    expect(changed).toHaveBeenLastCalledWith("chicken");
    await act(async () => trigger().click());
    await act(async () => document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
  });

  it("Tab leaves the select without changing its value", async () => {
    await act(async () => root.render(<Fixture />));
    await key("ArrowDown");
    await key("ArrowDown");
    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    await act(async () => trigger().dispatchEvent(event));
    expect(event.defaultPrevented).toBe(false);
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(changed).not.toHaveBeenCalled();
  });
});
