import fs from "node:fs";

function readUtf8(p) {
  const s = fs.readFileSync(p, "utf8");
  return s.replace(/^\uFEFF/, "");
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
    if (/Select one/i.test(t)) s -= 5;
    if (/^(?:Câu hỏi|Question)\s*\d+\s*Select one/i.test(t)) s -= 5;
    if (/\bA\.|\bB\.|\bC\.|\bD\./.test(t)) s -= 2;
    if (t.length > 500) s -= 2;
    if (t.length > 1200) s -= 4;
    if (t.trim().endsWith("?")) s += 1;
    if (t.trim().length > 0) s += 1;
    return s;
  };
  return [...questions].sort((a, b) => score(b) - score(a))[0];
}

function dedupeQuestions(exam) {
  const byId = new Map();
  for (const q of exam.questions || []) {
    const id = String(q?.id ?? "");
    if (!id) continue;
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(q);
  }

  const ids = Array.from(byId.keys());
  const deduped = [];
  for (const id of ids) {
    const picked = pickBestQuestion(byId.get(id));
    deduped.push(picked);
  }

  // Preserve original order by walking old list and taking first time we see an id.
  const order = [];
  const seen = new Set();
  for (const q of exam.questions || []) {
    const id = String(q?.id ?? "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    order.push(id);
  }

  const pickedById = new Map(deduped.map((q) => [q.id, q]));
  exam.questions = order.map((id) => pickedById.get(id)).filter(Boolean);
  return exam;
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

function verifyAgainstDeThi(exams) {
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
    const qs = ex.questions || [];

    if (qs.length !== keys.length) {
      throw new Error(`${id}: số câu (${qs.length}) != số đáp án trong ${file} (${keys.length})`);
    }

    const mism = [];
    for (let i = 0; i < keys.length; i++) {
      const got = String(qs[i]?.answer ?? "").toUpperCase();
      const exp = keys[i];
      if (got !== exp) mism.push({ n: i + 1, expected: exp, got });
    }

    report.push({ id, file, questions: qs.length, mismatches: mism.slice(0, 5), ok: mism.length === 0 });
    if (mism.length) {
      throw new Error(`${id}: sai đáp án (ví dụ): ${JSON.stringify(mism.slice(0, 3))}`);
    }
  }

  return report;
}

function ensureAnswerInOptions(exams) {
  for (const ex of exams) {
    for (const q of ex.questions || []) {
      const ans = String(q.answer ?? "").toUpperCase();
      const keys = new Set((q.options || []).map((o) => String(o.key ?? "").toUpperCase()));
      if (!keys.has(ans)) {
        throw new Error(`${ex.id}/${q.id}: đáp án ${ans} không có trong options`);
      }
    }
  }
}

function main() {
  const examsPath = "data/exams.json";
  const exams = JSON.parse(readUtf8(examsPath));
  if (!Array.isArray(exams)) throw new Error("data/exams.json không phải mảng");

  // Fix duplicated ids inside each exam (đặc biệt đề 2 bị dính câu 21)
  for (const ex of exams) {
    if (!Array.isArray(ex.questions)) ex.questions = [];
    dedupeQuestions(ex);
  }

  ensureAnswerInOptions(exams);

  // Verify answer keys for De 2-6 against original DeThi files
  const report = verifyAgainstDeThi(exams);

  // Fill explanations for all questions
  for (const ex of exams) fillExplanations(ex);

  writeUtf8(examsPath, JSON.stringify(exams, null, 2) + "\n");
  writeUtf8("data/verify_report.json", JSON.stringify(report, null, 2) + "\n");

  console.log("OK: verified answers for DeThi (De 2-6) and filled explanations.");
}

main();
