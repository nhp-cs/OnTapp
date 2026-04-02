import { addAttempt, getAttempts } from "./attempts.js";
import { ensureSupabaseConfig } from "./config.js";
import { hasSupabase, supabaseInsertAttempt, supabaseListAttempts } from "./supabase.js";

export function attemptsBackend() {
  return hasSupabase() ? "supabase" : "local";
}

function safeAddAttempt(entry) {
  try {
    addAttempt(entry);
  } catch {
    // Some in-app browsers may block storage; ignore.
  }
}

export async function recordAttempt(attempt) {
  // Ensure config exists (works even if localStorage is blocked).
  try {
    await ensureSupabaseConfig();
  } catch {
    // ignore
  }

  if (hasSupabase()) {
    const res = await supabaseInsertAttempt(attempt);
    if (res.ok) return { ok: true, backend: "supabase" };

    // fallback to local if supabase fails
    safeAddAttempt({ ...attempt, backend_error: res.reason || "error" });
    return { ok: false, backend: "local_fallback", error: res };
  }

  safeAddAttempt(attempt);
  return { ok: true, backend: "local" };
}

export async function listAttempts(limit = 30) {
  try {
    await ensureSupabaseConfig();
  } catch {
    // ignore
  }

  if (hasSupabase()) {
    const res = await supabaseListAttempts({ limit });
    if (res.ok) return { ok: true, backend: "supabase", attempts: res.attempts, count: res.count };
    return { ok: false, backend: "supabase", attempts: [], error: res };
  }

  return { ok: true, backend: "local", attempts: getAttempts().slice(0, limit) };
}
