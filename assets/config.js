// Supabase config (hardcoded default)
// If you change project/key, update DEFAULT_SUPABASE below.

const DEFAULT_SUPABASE = {
  url: "https://jjmqzurnwoddwxuatrig.supabase.co",
  anonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqbXF6dXJud29kZHd4dWF0cmlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMjMwNTMsImV4cCI6MjA5MDY5OTA1M30.OaA6UxsgamyKdw8Yn9C5rVfECO_94b2kh9UVVU5R360",
};

function normalizeConfig(cfg) {
  if (!cfg || typeof cfg !== "object") return null;
  const url = String(cfg.url || "").trim();
  const anonKey = String(cfg.anonKey || "").trim();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

let memoCfg = normalizeConfig(DEFAULT_SUPABASE);

// For your requirement: don't rely on admin/localStorage; always use code defaults.
export function getSupabaseConfig() {
  return memoCfg;
}

// Kept for compatibility (not used by UI now)
export function setSupabaseConfig({ url, anonKey }) {
  memoCfg = normalizeConfig({ url, anonKey });
}

export function clearSupabaseConfig() {
  memoCfg = null;
}

export async function ensureSupabaseConfig() {
  return memoCfg;
}
