// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityForm } from "./ActivityForm";
import { DEFAULT_PROFILE } from "./seed";

let root: Root;
let host: HTMLDivElement;
const save = vi.fn();
const cancel = vi.fn();

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  vi.clearAllMocks();
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

async function click(text: string) {
  const button = [...host.querySelectorAll("button")].find(node => node.textContent?.trim() === text);
  expect(button).toBeDefined();
  await act(async () => button!.click());
}
function input(label: string) {
  const element = [...host.querySelectorAll("label")].find(node => node.querySelector("span")?.textContent === label)?.querySelector("input");
  expect(element).toBeDefined(); return element!;
}
async function fill(label: string, value: string) {
  const element = input(label);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("activity form", () => {
  it("requires a real weight when profile is unconfigured, then records a sport without fake steps", async () => {
    await act(async () => root.render(<ActivityForm profile={{ ...DEFAULT_PROFILE, configured: false }} date="2026-10-11" onSave={save} onCancel={cancel} />));
    expect(input("Ваш вес, кг").value).toBe("");
    expect(host.querySelector("select")).toBeNull();
    expect(host.querySelectorAll(".activity-type")).toHaveLength(8);
    await click("Записать активность");
    expect(save).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("вес");
    await fill("Ваш вес, кг", "80");
    await fill("Шаги, если считали", "2500");
    await click("Плавание");
    expect(host.textContent).not.toContain("Шаги, если считали");
    await click("Записать активность");
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ kind: "swimming", weight: 80, minutes: 30, steps: 0, distance: 0 }));
  });

  it("starts with the selected sport and recorded profile weight while leaving optional measurements blank", async () => {
    await act(async () => root.render(<ActivityForm profile={{ ...DEFAULT_PROFILE, configured: true, weight: 75 }} date="2026-10-11" initialKind="running" onSave={save} onCancel={cancel} />));
    expect(input("Ваш вес, кг").value).toBe("75");
    expect(input("Шаги, если считали").value).toBe("");
    expect(host.querySelector('.activity-type[aria-pressed="true"]')?.textContent).toBe("Пробежка");
    await fill("Длительность, мин", "45");
    await click("Записать активность");
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ kind: "running", weight: 75, minutes: 45, steps: 0, distance: 0 }));
  });
});
