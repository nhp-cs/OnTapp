import fs from "node:fs";

function readUtf8(p) {
  const s = fs.readFileSync(p, "utf8");
  return s.replace(/^\uFEFF/, "");
}

function normalizeSpaces(s) {
  return String(s).replace(/\s+/g, " ").trim();
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const k = a.slice(2);
    const v = argv[i + 1];
    if (v && !v.startsWith("--")) {
      out[k] = v;
      i++;
    } else {
      out[k] = true;
    }
  }
  return out;
}

function isOptionStart(t) {
  const m = t.match(/^([A-Da-d])\s*[\.)]?\s*(.*)$/);
  if (!m) return null;
  const key = m[1].toUpperCase();
  // Accept only if the line is exactly like "A." or "A" or "A. text"
  const ok = t.length <= 3 || /^[A-Da-d]\s*[\.)]?\s+/.test(t);
  if (!ok) return null;
  return { key, rest: m[2] ?? "" };
}

function parseDumpToQuestions(text, { examId }) {
  const lines = String(text)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");

  const headerRe = /^Câu\s*(\d+)\s*(?:ID\s*:\s*(\d+))?/i;
  const blocks = [];
  let cur = null;

  for (const raw of lines) {
    const t = String(raw ?? "").trim();
    const hm = t.match(headerRe);
    if (hm) {
      if (cur) blocks.push(cur);
      cur = {
        num: Number(hm[1]),
        dumpId: hm[2] ? String(hm[2]) : "",
        rawLines: [],
      };
      continue;
    }
    if (!cur) continue;
    cur.rawLines.push(raw);
  }
  if (cur) blocks.push(cur);

  if (blocks.length === 0) throw new Error("Không tìm thấy câu hỏi nào (thiếu dòng bắt đầu bằng \"Câu ...\").");

  const questions = [];
  const seenIds = new Set();

  for (const b of blocks) {
    const rawLines = b.rawLines.map((l) => String(l ?? ""));
    let answer = "";
    let answerIdx = -1;

    for (let i = 0; i < rawLines.length; i++) {
      const t = rawLines[i].trim();
      const m = t.match(/^Đáp\s*án\s*đúng\s*:\s*([A-Da-d])\b/i);
      if (m) {
        answer = m[1].toUpperCase();
        answerIdx = i;
        break;
      }
    }
    if (!answer) throw new Error(`Thiếu "Đáp án đúng" ở câu ${b.num}.`);

    const stemLines = [];
    const optionLinesByKey = new Map();
    let currentOpt = null;

    for (let i = 0; i < answerIdx; i++) {
      const raw = rawLines[i];
      const t = raw.trim();
      if (!t) continue;

      const os = isOptionStart(t);
      if (os) {
        currentOpt = os.key;
        if (!optionLinesByKey.has(currentOpt)) optionLinesByKey.set(currentOpt, []);
        if (os.rest) optionLinesByKey.get(currentOpt).push(os.rest);
        continue;
      }

      if (currentOpt) {
        optionLinesByKey.get(currentOpt).push(t);
      } else {
        stemLines.push(t);
      }
    }

    const text = normalizeSpaces(stemLines.join(" "));
    if (!text) throw new Error(`Thiếu nội dung câu ${b.num}.`);

    const options = [];
    for (const key of ["A", "B", "C", "D"]) {
      const linesForKey = optionLinesByKey.get(key) ?? [];
      const optText = normalizeSpaces(linesForKey.join(" "));
      if (optText) options.push({ key, text: optText });
    }

    if (options.length < 2) throw new Error(`Thiếu lựa chọn ở câu ${b.num}.`);
    if (!new Set(options.map((o) => o.key)).has(answer)) {
      throw new Error(`Đáp án câu ${b.num} = ${answer} không khớp lựa chọn.`);
    }

    const qid = b.dumpId || `${examId}_q${String(b.num).padStart(2, "0")}`;
    if (seenIds.has(qid)) throw new Error(`Trùng id câu hỏi: ${qid}`);
    seenIds.add(qid);

    questions.push({
      id: qid,
      text,
      options,
      answer,
      explanation: "",
    });
  }

  return questions;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  const input = args.input || "tthcm_dump.txt";
  const outPath = args.out || "data/exams.json";
  const examId = args["exam-id"] || "exam_tu_tuong_ho_chi_minh";
  const title = args.title || "Tư tưởng Hồ Chí Minh — Bộ 61 câu";

  const raw = readUtf8(input);
  const questions = parseDumpToQuestions(raw, { examId });

  const exam = {
    id: examId,
    title,
    description: `${questions.length} câu`,
    source: "builtin",
    questions,
  };

  const current = JSON.parse(readUtf8(outPath));
  const base = Array.isArray(current) ? current : [];

  const idx = base.findIndex((e) => e && e.id === examId);
  if (idx >= 0) base[idx] = exam;
  else base.push(exam);

  fs.writeFileSync(outPath, JSON.stringify(base, null, 2) + "\n", "utf8");
  console.log(`Imported ${questions.length} questions -> ${outPath} (examId=${examId})`);
}

main();
