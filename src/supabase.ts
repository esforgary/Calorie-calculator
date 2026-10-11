import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSessionPolicy } from './authSession';

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";
const memory = new Map<string, string | null>();

// Private browsing and full/disabled storage must not crash authentication.
const authStorage = {
  getItem(name: string): string | null {
    if (memory.has(name)) return memory.get(name) ?? null;
    try {
      return window.localStorage.getItem(name);
    } catch {
      return memory.get(name) ?? null;
    }
  },
  setItem(name: string, value: string): void {
    try {
      window.localStorage.setItem(name, value);
      memory.delete(name);
    } catch {
      memory.set(name, value);
    }
  },
  removeItem(name: string): void {
    try {
      window.localStorage.removeItem(name);
      memory.delete(name);
    } catch {
      memory.set(name, null);
    }
  },
};

function isPrivateKey(value: string): boolean {
  if (value.startsWith("sb_secret_")) return true;
  try {
    const payload = value.split(".")[1];
    return payload
      ? JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))).role ===
          "service_role"
      : false;
  } catch {
    return false;
  }
}

let client: SupabaseClient | null = null;
let configurationError: string | null = null;
if (url || key) {
  try {
    if (!url || !key)
      throw new Error("Укажите обе переменные Supabase в .env.local.");
    if (isPrivateKey(key))
      throw new Error(
        "Секретный ключ запрещён в браузере. Используйте publishable или anon key.",
      );
    const parsed = new URL(url);
    if (!["https:", "http:"].includes(parsed.protocol))
      throw new Error("Неверный URL проекта Supabase.");
    client = createClient(url, key, {
      auth: {
        storage: authStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  } catch (error) {
    configurationError =
      error instanceof Error ? error.message : "Проверьте настройки Supabase.";
  }
}

export const supabase = client;
export const configured = Boolean(client);
export const supabaseConfigurationError = configurationError;
export const sessionPolicy = createSessionPolicy(authStorage);
