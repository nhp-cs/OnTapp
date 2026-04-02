import { safeJsonParse, uid } from "./lib.js";

const LS_ATTEMPTS = "ontap_attempts_v1";
const MAX_ATTEMPTS = 500;

export function getAttempts() {
  const raw = localStorage.getItem(LS_ATTEMPTS);
  const data = safeJsonParse(raw, []);
  return Array.isArray(data) ? data : [];
}

export function addAttempt(attempt) {
  const attempts = getAttempts();
  const entry = {
    id: uid("attempt"),
    createdAt: new Date().toISOString(),
    ...attempt,
  };
  attempts.unshift(entry);
  if (attempts.length > MAX_ATTEMPTS) attempts.length = MAX_ATTEMPTS;
  localStorage.setItem(LS_ATTEMPTS, JSON.stringify(attempts));
  return entry;
}

export function clearAttempts() {
  localStorage.removeItem(LS_ATTEMPTS);
}

