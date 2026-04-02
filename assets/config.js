import { safeJsonParse } from "./lib.js";

const LS_SUPABASE = "ontap_supabase_cfg_v1";
const BUNDLED_PATH = "./data/backend.json";

let bundledTried = false;
let bundledPromise = null;

export function getSupabaseConfig() {
  const raw = localStorage.getItem(LS_SUPABASE);
  const cfg = safeJsonParse(raw, null);
  if (!cfg || typeof cfg !== "object") return null;
  const url = String(cfg.url || "").trim();
  const anonKey = String(cfg.anonKey || "").trim();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function setSupabaseConfig({ url, anonKey }) {
  const payload = {
    url: String(url || "").trim(),
    anonKey: String(anonKey || "").trim(),
  };
  localStorage.setItem(LS_SUPABASE, JSON.stringify(payload));
}

export function clearSupabaseConfig() {
  localStorage.removeItem(LS_SUPABASE);
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
        if (!data || typeof data !== "object") return null;
        const url = String(data.url || "").trim();
        const anonKey = String(data.anonKey || "").trim();
        if (!url || !anonKey) return null;
        return { url, anonKey };
      } catch {
        return null;
      }
    })();
  }
  return bundledPromise;
}

// Ensures config exists for this browser:
// - First use localStorage config (admin can set)
// - If missing, try loading `./data/backend.json` (shared for everyone when deployed)
// - If found, cache it into localStorage and return it
export async function ensureSupabaseConfig() {
  const local = getSupabaseConfig();
  if (local) return local;

  const bundled = await fetchBundledConfigOnce();
  if (!bundled) return null;

  setSupabaseConfig(bundled);
  return bundled;
}
