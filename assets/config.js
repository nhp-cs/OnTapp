import { safeJsonParse } from "./lib.js";

const LS_SUPABASE = "ontap_supabase_cfg_v1";

// Default (hardcoded) Supabase config.
// If you change project/key, update these two values.
const DEFAULT_SUPABASE = {
  url: "https://jjmqzurnwoddwxuatrig.supabase.co",
  anonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqbXF6dXJud29kZHd4dWF0cmlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMjMwNTMsImV4cCI6MjA5MDY5OTA1M30.OaA6UxsgamyKdw8Yn9C5rVfECO_94b2kh9UVVU5R360",
};

// Optional: fallback to repo file when DEFAULT_SUPABASE is empty.
const BUNDLED_PATH = "./data/backend.json";

let bundledTried = false;
let bundledPromise = null;

function normalizeConfig(cfg) {
  if (!cfg || typeof cfg !== "object") return null;
  const url = String(cfg.url || "").trim();
  const anonKey = String(cfg.anonKey || "").trim();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

let memoCfg = normalizeConfig(DEFAULT_SUPABASE);

export function getSupabaseConfig() {
  // Prefer localStorage (admin can override), but tolerate browsers where storage is blocked.
  try {
    const raw = localStorage.getItem(LS_SUPABASE);
    const cfg = safeJsonParse(raw, null);
    return normalizeConfig(cfg) || memoCfg;
  } catch {
    return memoCfg;
  }
}

export function setSupabaseConfig({ url, anonKey }) {
  const payload = {
    url: String(url || "").trim(),
    anonKey: String(anonKey || "").trim(),
  };

  memoCfg = normalizeConfig(payload);

  try {
    localStorage.setItem(LS_SUPABASE, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export function clearSupabaseConfig() {
  memoCfg = null;
  try {
    localStorage.removeItem(LS_SUPABASE);
  } catch {
    // ignore
  }
}

async function fetchBundledConfigOnce() {
  if (bundledTried) return null;
  if (!bundledPromise) {
    bundledPromise = (async () => {
      bundledTried = true;
      try {
        const res = await fetch(BUNDLED_PATH, { cache: "no-store" });
        if (!res.ok) return null;
        const data = await res.json().catch(() => null);
        return normalizeConfig(data);
      } catch {
        return null;
      }
    })();
  }
  return bundledPromise;
}

// Ensure config exists in this browser.
// Important: still works even if localStorage is blocked (common in some in-app browsers).
export async function ensureSupabaseConfig() {
  const cur = getSupabaseConfig();
  if (cur) return cur;

  const bundled = await fetchBundledConfigOnce();
  if (!bundled) return null;

  setSupabaseConfig(bundled);
  return bundled;
}
