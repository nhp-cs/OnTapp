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

  let res;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: buildHeaders(cfg.anonKey, { Prefer: "return=minimal" }),
      body: JSON.stringify(attempt),
    });
  } catch (err) {
    return { ok: false, reason: "network", detail: err?.message ?? String(err) };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: "http", status: res.status, detail: text };
  }
  return { ok: true };
}

function parseContentRangeCount(header) {
  // Format: 0-9/123 or */0
  if (!header) return null;
  const m = String(header).match(/\/(\d+)\s*$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export async function supabaseListAttempts({ limit = 30 } = {}) {
  const cfg = await ensureSupabaseConfig();
  if (!cfg) return { ok: false, reason: "no_config", attempts: [] };

  const url = normalizeUrl(cfg.url);
  const endpoint = `${url}/rest/v1/attempts?select=*&order=submitted_at.desc.nullslast,created_at.desc&limit=${encodeURIComponent(
    String(limit),
  )}`;

  let res;
  try {
    res = await fetch(endpoint, {
      headers: buildHeaders(cfg.anonKey, { Prefer: "count=exact" }),
    });
  } catch (err) {
    return { ok: false, reason: "network", detail: err?.message ?? String(err), attempts: [] };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: "http", status: res.status, detail: text, attempts: [] };
  }

  const attempts = await res.json().catch(() => []);
  const count = parseContentRangeCount(res.headers.get("content-range"));
  return { ok: true, attempts: Array.isArray(attempts) ? attempts : [], count };
}

export async function supabaseClearAttempts() {
  const cfg = await ensureSupabaseConfig();
  if (!cfg) return { ok: false, reason: "no_config" };

  const url = normalizeUrl(cfg.url);
  // delete all rows (requires RLS policy permitting delete; for safety we won't enable this by default)
  const endpoint = `${url}/rest/v1/attempts?id=gt.0`;

  let res;
  try {
    res = await fetch(endpoint, {
      method: "DELETE",
      headers: buildHeaders(cfg.anonKey, { Prefer: "return=minimal" }),
    });
  } catch (err) {
    return { ok: false, reason: "network", detail: err?.message ?? String(err) };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: "http", status: res.status, detail: text };
  }
  return { ok: true };
}
