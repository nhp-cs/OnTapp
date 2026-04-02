import { safeJsonParse } from "./lib.js";

const LS_CUSTOM_EXAMS = "ontap_exams_custom_v1";

export function getCustomExams() {
  const raw = localStorage.getItem(LS_CUSTOM_EXAMS);
  const data = safeJsonParse(raw, []);
  return Array.isArray(data) ? data : [];
}

export function setCustomExams(exams) {
  localStorage.setItem(LS_CUSTOM_EXAMS, JSON.stringify(exams));
}

export function upsertCustomExam(exam) {
  const exams = getCustomExams();
  const idx = exams.findIndex((e) => e.id === exam.id);
  if (idx >= 0) exams[idx] = exam;
  else exams.unshift(exam);
  setCustomExams(exams);
}

export function removeAllCustomExams() {
  localStorage.removeItem(LS_CUSTOM_EXAMS);
}

