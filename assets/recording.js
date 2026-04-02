import { addAttempt, getAttempts } from "./attempts.js";
import { ensureSupabaseConfig } from "./config.js";
import { hasSupabase, supabaseInsertAttempt, supabaseListAttempts } from "./supabase.js";

export function attemptsBackend() {
  return hasSupabase() ? "supabase" : "local";
}

export async function recordAttempt(attempt) {
  // If this browser hasn't been configured yet, try loading `./data/backend.json`.
  await ensureSupabaseConfig();

  if (hasSupabase()) {
    const res = await supabaseInsertAttempt(attempt);
    if (res.ok) return { ok: true, backend: "supabase" };

    // fallback to local if supabase fails
    addAttempt({ ...attempt, backend_error: res.reason || "error" });
    return { ok: false, backend: "local_fallback", error: res };
  }

  addAttempt(attempt);
  return { ok: true, backend: "local" };
}

export async function listAttempts(limit = 30) {
  await ensureSupabaseConfig();

  if (hasSupabase()) {
    const res = await supabaseListAttempts({ limit });
    if (res.ok) return { ok: true, backend: "supabase", attempts: res.attempts };
    return { ok: false, backend: "supabase", attempts: [], error: res };
  }

  return { ok: true, backend: "local", attempts: getAttempts().slice(0, limit) };
}
