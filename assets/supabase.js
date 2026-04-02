import { getSupabaseConfig, ensureSupabaseConfig } from "./config.js";

function normalizeUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

function buildHeaders(anonKey, extra = {}) {
  return {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

export function hasSupabase() {
  return !!getSupabaseConfig();
}

export async function supabaseInsertAttempt(attempt) {
  const cfg = await ensureSupabaseConfig();
  if (!cfg) return { ok: false, reason: "no_config" };

  const url = normalizeUrl(cfg.url);
  const endpoint = `${url}/rest/v1/attempts`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: buildHeaders(cfg.anonKey, { Prefer: "return=minimal" }),
    body: JSON.stringify(attempt),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: "http", status: res.status, detail: text };
  }
  return { ok: true };
}

export async function supabaseListAttempts({ limit = 30 } = {}) {
  const cfg = await ensureSupabaseConfig();
  if (!cfg) return { ok: false, reason: "no_config", attempts: [] };

  const url = normalizeUrl(cfg.url);
  const endpoint = `${url}/rest/v1/attempts?select=*&order=submitted_at.desc.nullslast,created_at.desc&limit=${encodeURIComponent(
    String(limit),
  )}`;

  const res = await fetch(endpoint, { headers: buildHeaders(cfg.anonKey) });
  if (!res.ok) return { ok: false, reason: "http", status: res.status, attempts: [] };
  const attempts = await res.json().catch(() => []);
  return { ok: true, attempts: Array.isArray(attempts) ? attempts : [] };
}

export async function supabaseClearAttempts() {
  const cfg = await ensureSupabaseConfig();
  if (!cfg) return { ok: false, reason: "no_config" };

  const url = normalizeUrl(cfg.url);
  // delete all rows (requires RLS policy permitting delete; for safety we won't enable this by default)
  const endpoint = `${url}/rest/v1/attempts?id=gt.0`;
  const res = await fetch(endpoint, { method: "DELETE", headers: buildHeaders(cfg.anonKey, { Prefer: "return=minimal" }) });
  if (!res.ok) return { ok: false, reason: "http", status: res.status };
  return { ok: true };
}
