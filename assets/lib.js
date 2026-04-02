export function uid(prefix = "id") {
  const rand = Math.random().toString(16).slice(2);
  return `${prefix}_${Date.now().toString(16)}_${rand}`;
}

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function normalizeLine(s) {
  return String(s ?? "").replace(/\r/g, "").trim();
}

export function byTitle(a, b) {
  return a.title.localeCompare(b.title, "vi", { sensitivity: "base" });
}

export function safeJsonParse(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

