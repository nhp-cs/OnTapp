import fs from "node:fs";
import path from "node:path";

function readUtf8(p) {
  const s = fs.readFileSync(p, "utf8");
  // strip BOM if any
  return s.replace(/^\uFEFF/, "");
}

function normalizeSpaces(s) {
  return String(s)
    .replace(/\[cite\s*:\s*[^\]]*\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isNoiseLine(line) {
  const l = String(line || "").trim();
  if (!l) return true;
  const patterns = [
    /^Chưa trả lời$/i,
    /^Not yet answered$/i,
    /^Đạt điểm\b/i,
    /^Marked out of\b/i,
    /^Đặt cờ$/i,
    /^Flag question$/i,
    /^Đoạn văn câu hỏi$/i,
    /^Question text$/i,
    /^Select one\s*:?$/i,
  ];
  return patterns.some((re) => re.test(l));
}

function findAnswerHeaderIndex(lines) {
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (/^Đáp\s*án\s*:\s*$/i.test(l)) return i;
    if (/^ĐÁP\s*ÁN\s*:?\s*$/i.test(l)) return i;
  }
  return -1;
}

function parseAnswers(lines, answerIdx) {
  const out = [];
  for (let i = answerIdx + 1; i < lines.length; i++) {
    const l = lines[i].trim();
    const m = l.match(/^([A-Da-d])\b/);
    if (!m) continue;
    out.push(m[1].toUpperCase());
  }
  if (out.length === 0) throw new Error("Không tìm thấy đáp án.");
  return out;
}

function findSelectLineIndex(lines, qNum) {
  const re = new RegExp(`^(?:Câu hỏi|Question)\\s*${qNum}\\s*Select one\\s*:?\\s*$`, "i");
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i].trim())) return i;
  }
  return -1;
}

function findPlainQLineIndexAfter(lines, startIdx, qNum) {
  const re = new RegExp(`^(?:Câu hỏi|Question)\\s*${qNum}\\b`, "i");
  for (let i = startIdx; i < lines.length; i++) {
    const t = lines[i].trim();
    if (re.test(t) && !/Select one/i.test(t)) return i;
  }
  return -1;
}

function lastIndexBefore(lines, endExclusive, predicate) {
  for (let i = endExclusive - 1; i >= 0; i--) {
    if (predicate(lines[i])) return i;
  }
  return -1;
}

function extractQuestionText(lines, qNum, selectIdx, prevSelectIdx) {
  let start = 0;
  if (qNum === 1) {
    start = 0;
  } else {
    const markerIdx = lastIndexBefore(lines, selectIdx, (l) => /^(Đoạn văn câu hỏi|Question text)\s*$/i.test(l.trim()));
    if (markerIdx >= 0) start = markerIdx + 1;
    else {
      const plainIdx = lastIndexBefore(lines, selectIdx, (l) => {
        const t = l.trim();
        return new RegExp(`^(?:Câu hỏi|Question)\\s*${qNum}\\b`, "i").test(t) && !/Select one/i.test(t);
      });
      start = plainIdx >= 0 ? plainIdx + 1 : prevSelectIdx + 1;
    }
  }

  const cleaned = [];
  for (let i = start; i < selectIdx; i++) {
    const l = lines[i];
    if (isNoiseLine(l)) continue;
    cleaned.push(l);
  }

  return normalizeSpaces(cleaned.join(" "));
}

function parseOptions(lines, startIdx, endIdx) {
  const options = [];
  let cur = null;

  function pushCur() {
    if (!cur) return;
    const text = normalizeSpaces(cur.textLines.join(" "));
    if (text) options.push({ key: cur.key, text });
    cur = null;
  }

  for (let i = startIdx; i < endIdx; i++) {
    const raw = lines[i];
    const t = String(raw || "").trim();
    if (!t) continue;

    const m = t.match(/^([A-Da-d])\s*[\.)]?\s*(.*)$/);
    // Accept only if the line is exactly like "A." or "A" or "A. text" (not other noise)
    if (m && m[1] && (t.length <= 3 || /^[A-Da-d]\s*[\.)]?\s+/.test(t))) {
      pushCur();
      cur = { key: m[1].toUpperCase(), textLines: [] };
      if (m[2]) cur.textLines.push(m[2]);
      continue;
    }

    if (!cur) continue;
    if (/^(?:Câu hỏi|Question)\s*\d+\b/i.test(t)) break;
    cur.textLines.push(t);
  }

  pushCur();
  return options;
}

function parseMoodleLikeExam(text, { examId, title }) {
  const lines = String(text)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");

  const answerIdx = findAnswerHeaderIndex(lines);
  if (answerIdx < 0) throw new Error(`Không tìm thấy mục Đáp án trong ${examId}.`);
  const answers = parseAnswers(lines, answerIdx);

  const questionLines = lines.slice(0, answerIdx);
  const qCount = answers.length;

  const questions = [];
  let prevSelectIdx = 0;

  for (let qNum = 1; qNum <= qCount; qNum++) {
    const selectIdx = findSelectLineIndex(questionLines, qNum);
    if (selectIdx < 0) throw new Error(`Không tìm thấy dòng \"Select one\" cho câu ${qNum} (${examId}).`);

    const nextPlainIdx = qNum < qCount ? findPlainQLineIndexAfter(questionLines, selectIdx + 1, qNum + 1) : -1;
    const endIdx = nextPlainIdx >= 0 ? nextPlainIdx : questionLines.length;

    const qText = extractQuestionText(questionLines, qNum, selectIdx, prevSelectIdx);
    const opts = parseOptions(questionLines, selectIdx + 1, endIdx);
    const ans = answers[qNum - 1];

    const keys = new Set(opts.map((o) => o.key));
    if (!qText) throw new Error(`Thiếu nội dung câu ${qNum} (${examId}).`);
    if (opts.length < 2) throw new Error(`Thiếu lựa chọn cho câu ${qNum} (${examId}).`);
    if (!keys.has(ans)) throw new Error(`Đáp án câu ${qNum} = ${ans} không khớp lựa chọn (${examId}).`);

    questions.push({
      id: `${examId}_q${String(qNum).padStart(2, "0")}`,
      text: qText,
      options: opts,
      answer: ans,
      explanation: "",
    });

    prevSelectIdx = selectIdx;
  }

  return {
    id: examId,
    title,
    description: `${questions.length} câu`,
    source: "builtin",
    questions,
  };
}

function main() {
  const current = JSON.parse(readUtf8("data/exams.json"));
  const base = Array.isArray(current) ? current : [];

  const exam1 = base.find((e) => e && e.id === "exam_do_hoa_may_tinh") ?? base[0];
  if (!exam1) throw new Error("Không tìm thấy đề hiện tại trong data/exams.json.");

  const cleanedExam1 = {
    ...exam1,
    title: "Đồ Họa Máy Tính — Đề 1",
    description: `${exam1.questions?.length ?? 0} câu`,
    source: "builtin",
  };

  const examFiles = [
    { n: 2, file: "DeThi/dhmt2.txt" },
    { n: 3, file: "DeThi/dhmt3.txt" },
    { n: 4, file: "DeThi/dhmt4.txt" },
    { n: 5, file: "DeThi/dhmt5.txt" },
    { n: 6, file: "DeThi/dhmt6.txt" },
  ];

  const built = [];
  for (const it of examFiles) {
    const examId = `exam_dhmt_de_${it.n}`;
    const title = `Đồ Họa Máy Tính — Đề ${it.n}`;
    const raw = readUtf8(it.file);
    built.push(parseMoodleLikeExam(raw, { examId, title }));
  }

  const exams = [cleanedExam1, ...built];
  fs.writeFileSync("data/exams.json", JSON.stringify(exams, null, 2) + "\n", "utf8");
  console.log(`Wrote data/exams.json: ${exams.length} exams`);
}

main();
