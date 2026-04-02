import fs from "node:fs";

function readUtf8(p) {
  return fs.readFileSync(p, "utf8").replace(/^\uFEFF/, "");
}

function writeUtf8(p, s) {
  fs.writeFileSync(p, s, "utf8");
}

function findAnswerHeaderIndex(lines) {
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (/^Đáp\s*án\s*:\s*$/i.test(l)) return i;
    if (/^ĐÁP\s*ÁN\s*:?\s*$/i.test(l)) return i;
  }
  return -1;
}

function parseAnswerKeysFromDeThi(filePath) {
  const text = readUtf8(filePath);
  const lines = text.replace(/\r/g, "").split("\n");
  const idx = findAnswerHeaderIndex(lines);
  if (idx < 0) throw new Error(`Không tìm thấy mục Đáp án trong ${filePath}`);

  const keys = [];
  for (let i = idx + 1; i < lines.length; i++) {
    const m = lines[i].trim().match(/^([A-Da-d])\b/);
    if (m) keys.push(m[1].toUpperCase());
  }
  if (keys.length === 0) throw new Error(`Không trích được đáp án từ ${filePath}`);
  return keys;
}

function pickBestQuestion(questions) {
  if (questions.length === 1) return questions[0];
  const score = (q) => {
    const t = String(q?.text ?? "");
    let s = 0;
    if (/Select one/i.test(t)) s -= 6;
    if (/(?:Câu hỏi|Question)\s*\d+\s*Select one/i.test(t)) s -= 6;
    if (t.length > 800) s -= 3;
    if (t.trim().endsWith("?")) s += 1;
    if (t.trim().length > 0) s += 1;
    return s;
  };
  return [...questions].sort((a, b) => score(b) - score(a))[0];
}

function qNumFromId(qid) {
  const m = String(qid || "").match(/_q(\d{1,3})$/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function syncExamToDeThiKey(exam, keys) {
  const buckets = new Map();
  for (const q of exam.questions || []) {
    const n = qNumFromId(q?.id);
    if (n == null) continue;
    if (!buckets.has(n)) buckets.set(n, []);
    buckets.get(n).push(q);
  }

  const ordered = [];
  for (let n = 1; n <= keys.length; n++) {
    const list = buckets.get(n) || [];
    if (list.length === 0) throw new Error(`${exam.id}: thiếu câu _q${String(n).padStart(2, "0")}`);
    const q = pickBestQuestion(list);
    q.answer = keys[n - 1];
    ordered.push(q);
  }

  exam.questions = ordered;
  exam.description = `${exam.questions.length} câu`;
}

function ensureAnswerInOptions(exam) {
  for (const q of exam.questions || []) {
    const ans = String(q.answer ?? "").toUpperCase();
    const keys = new Set((q.options || []).map((o) => String(o.key ?? "").toUpperCase()));
    if (!keys.has(ans)) {
      throw new Error(`${exam.id}/${q.id}: đáp án ${ans} không có trong options`);
    }
  }
}

function fillExplanations(exam) {
  for (const q of exam.questions || []) {
    const ans = String(q.answer ?? "").toUpperCase();
    const opt = (q.options || []).find((o) => String(o.key ?? "").toUpperCase() === ans);
    const optText = String(opt?.text ?? "").trim();

    const base = optText ? `Đáp án đúng: ${ans}. ${optText}` : `Đáp án đúng: ${ans}.`;
    const extra = optText ? ` Vì phương án ${ans} là mô tả phù hợp nhất với yêu cầu của câu hỏi.` : "";
    q.explanation = `${base}${extra}`.trim();
  }
}

function main() {
  const examsPath = "data/exams.json";
  const exams = JSON.parse(readUtf8(examsPath));
  if (!Array.isArray(exams)) throw new Error("data/exams.json không phải mảng");

  const map = new Map(exams.map((e) => [e.id, e]));
  const pairs = [
    ["exam_dhmt_de_2", "DeThi/dhmt2.txt"],
    ["exam_dhmt_de_3", "DeThi/dhmt3.txt"],
    ["exam_dhmt_de_4", "DeThi/dhmt4.txt"],
    ["exam_dhmt_de_5", "DeThi/dhmt5.txt"],
    ["exam_dhmt_de_6", "DeThi/dhmt6.txt"],
  ];

  const report = [];

  for (const [id, file] of pairs) {
    const ex = map.get(id);
    if (!ex) throw new Error(`Thiếu đề ${id} trong data/exams.json`);
    const keys = parseAnswerKeysFromDeThi(file);

    syncExamToDeThiKey(ex, keys);
    ensureAnswerInOptions(ex);

    report.push({ id, file, questions: ex.questions.length, ok: true });
  }

  // Exam 1: only consistency checks
  for (const ex of exams) ensureAnswerInOptions(ex);

  // Fill explanations for all exams
  for (const ex of exams) fillExplanations(ex);

  writeUtf8(examsPath, JSON.stringify(exams, null, 2) + "\n");
  writeUtf8("data/verify_report.json", JSON.stringify(report, null, 2) + "\n");

  console.log("OK: synced answers to DeThi keys (De 2-6) and filled explanations for all questions.");
}

main();
