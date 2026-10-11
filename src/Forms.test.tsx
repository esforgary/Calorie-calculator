// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SleepForm } from "./Forms";
import { createInitialData } from "./seed";
import type { SleepEntry } from "./types";

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("SleepForm", () => {
  it("requires an explicit weight before saving sleep for an unconfigured profile", async () => {
    const profile = createInitialData().profile;
    const save = vi.fn<(entry: SleepEntry) => void>();
    await act(async () => root.render(<SleepForm profile={{ ...profile, configured: false }} date="2026-10-11" onSave={save} onCancel={() => {}} />));
    const weight = container.querySelector<HTMLInputElement>('input[type="number"]')!;
    expect(weight.value).toBe("");
    expect(container.textContent).toContain("Укажите вес для расчёта расхода");
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(save).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Укажите текущий вес");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(weight, "82");
      weight.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0][0]).toMatchObject({ weight: 82, date: "2026-10-11" });
  });

  it("prefills an established profile weight", async () => {
    const profile = { ...createInitialData().profile, configured: true, weight: 91 };
    await act(async () => root.render(<SleepForm profile={profile} date="2026-10-11" onSave={() => {}} onCancel={() => {}} />));
    expect(container.querySelector<HTMLInputElement>('input[type="number"]')?.value).toBe("91");
    expect(container.textContent).toContain("Примерный расход во сне:");
  });
});
