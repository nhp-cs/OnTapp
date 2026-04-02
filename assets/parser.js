import { normalizeLine, uid } from "./lib.js";

function isTitleLine(line) {
  return /^#\s+/.test(line);
}

function parseOptionLine(line) {
  // Supports: "*B) text", "A) text", "C. text", "D: text", "- A) text"
  const cleaned = String(line).replace(/^\s*[-–•]\s*/, "");
  const starred = cleaned.trimStart().startsWith("*");
  const rest = starred ? cleaned.trimStart().slice(1).trimStart() : cleaned.trimStart();
  const m = rest.match(/^([A-Fa-f])\s*[\)\.\:\-]\s*(.+)$/);
  if (!m) return null;
  return { key: m[1].toUpperCase(), text: m[2].trim(), starred };
}

function parseQuestionStart(line) {
  // Q: ..., Q. ..., Câu: ..., Cau: ...
  const m = String(line).match(/^(Q|Ques|Question|Câu|Cau)\s*[\:\.\-]\s*(.+)$/i);
  if (!m) return null;
  return m[2].trim();
}

function parseAnswerLine(line) {
  // ANSWER: B, ANS: C, ĐÁP ÁN: A, DAP AN: D
  const m = String(line).match(/^(ANSWER|ANS|ĐÁP\s*ÁN|DAP\s*AN|ĐA|DA|CORRECT)\s*[\:\-]\s*([A-Fa-f])\s*$/i);
  if (!m) return null;
  return m[2].toUpperCase();
}

function parseExplainLine(line) {
  const m = String(line).match(/^(EXPLAIN|GIẢI\s*THÍCH|GIAI\s*THICH)\s*[\:\-]\s*(.+)$/i);
  if (!m) return null;
  return m[2].trim();
}

function findAnswerSectionIndex(lines) {
  for (let i = 0; i < lines.length; i++) {
    const line = normalizeLine(lines[i]);
    if (!line) continue;
    if (/^(ĐÁP\s*ÁN|DAP\s*AN)\s*$/i.test(line)) return i;
  }
  return -1;
}

function parseAnswerKeyLine(line) {
  const m = normalizeLine(line).match(/^(?:\d+\s*[\.\)\-]\s*)?([A-Fa-f])\s*$/);
  if (!m) return null;
  return m[1].toUpperCase();
}

function finalizeQuestions({ title, description, questions, source }) {
  if (!title) title = "Đề trắc nghiệm";
  if (!questions || questions.length === 0) {
    throw new Error("Không tìm thấy câu hỏi nào.");
  }
  return {
    id: uid("exam"),
    title,
    description: (description ?? "").trim(),
    questions,
    createdAt: new Date().toISOString(),
    source,
  };
}

function parseMarkerFormat(lines, { title: overrideTitle, description } = {}) {
  let title = (overrideTitle ?? "").trim();
  let titleFromText = "";
  const questions = [];
  let current = null;
  let currentLineIndex = 0;

  function pushCurrent() {
    if (!current) return;
    const { text, options, answer, explain, startLine } = current;
    if (!text) throw new Error(`Thiếu nội dung câu hỏi (gần dòng ${startLine}).`);
    if (!options || options.length < 2) throw new Error(`Câu hỏi cần ít nhất 2 lựa chọn (gần dòng ${startLine}).`);
    const answerKey = answer || options.find((o) => o.starred)?.key || null;
    if (!answerKey) throw new Error(`Thiếu đáp án đúng (gần dòng ${startLine}).`);
    const keys = new Set(options.map((o) => o.key));
    if (!keys.has(answerKey)) throw new Error(`Đáp án đúng "${answerKey}" không khớp lựa chọn (gần dòng ${startLine}).`);

    questions.push({
      id: uid("q"),
      text,
      options: options.map(({ key, text: t }) => ({ key, text: t })),
      answer: answerKey,
      explanation: explain || "",
    });
    current = null;
  }

  for (let i = 0; i < lines.length; i++) {
    currentLineIndex = i + 1;
    const line = normalizeLine(lines[i]);
    if (!line) continue;

    if (!titleFromText && isTitleLine(line)) {
      titleFromText = line.replace(/^#\s+/, "").trim();
      continue;
    }

    const qText = parseQuestionStart(line);
    if (qText) {
      pushCurrent();
      current = { text: qText, options: [], answer: null, explain: "", startLine: currentLineIndex };
      continue;
    }

    if (!current) continue;

    const opt = parseOptionLine(line);
    if (opt) {
      current.options.push(opt);
      continue;
    }

    const ans = parseAnswerLine(line);
    if (ans) {
      current.answer = ans;
      continue;
    }

    const expl = parseExplainLine(line);
    if (expl) {
      current.explain = expl;
      continue;
    }

    // Continuation: question or last option
    if (current.options.length === 0 && !current.answer) current.text = `${current.text}\n${line}`.trim();
    else if (current.options.length > 0 && !current.answer) {
      const last = current.options[current.options.length - 1];
      last.text = `${last.text}\n${line}`.trim();
    }
  }

  pushCurrent();

  if (!title) title = titleFromText || "Đề trắc nghiệm";
  return finalizeQuestions({ title, description, questions, source: "custom" });
}

function parseAnswerSectionFormat(lines, { title: overrideTitle, description } = {}) {
  const answerIdx = findAnswerSectionIndex(lines);
  if (answerIdx < 0) throw new Error("Không tìm thấy mục ĐÁP ÁN.");

  let title = (overrideTitle ?? "").trim();
  let titleFromText = "";

  // Title is taken from first "# ..." before questions if present
  for (let i = 0; i < answerIdx; i++) {
    const line = normalizeLine(lines[i]);
    if (!line) continue;
    if (isTitleLine(line)) {
      titleFromText = line.replace(/^#\s+/, "").trim();
      break;
    }
  }

  const answerKeys = [];
  for (let i = answerIdx + 1; i < lines.length; i++) {
    const key = parseAnswerKeyLine(lines[i]);
    if (!key) continue;
    answerKeys.push(key);
  }

  const questionPart = lines.slice(0, answerIdx);

  // Split blocks by blank lines
  const blocks = [];
  let cur = [];
  for (const rawLine of questionPart) {
    const line = String(rawLine ?? "").replace(/\r/g, "");
    if (!normalizeLine(line)) {
      if (cur.length) blocks.push(cur), (cur = []);
      continue;
    }
    cur.push(line);
  }
  if (cur.length) blocks.push(cur);

  const questions = [];
  let qStartLine = 1;

  for (const block of blocks) {
    // Skip single title block like "# ..."
    const nonEmpty = block.map((l) => normalizeLine(l)).filter(Boolean);
    if (nonEmpty.length === 1 && isTitleLine(nonEmpty[0])) {
      qStartLine += block.length + 1;
      continue;
    }

    const qTextLines = [];
    const options = [];
    let answer = null;
    let explanation = "";

    for (const rawLine of block) {
      const line = normalizeLine(rawLine);
      if (!line) continue;

      if (!titleFromText && isTitleLine(line)) {
        titleFromText = line.replace(/^#\s+/, "").trim();
        continue;
      }

      const ans = parseAnswerLine(line);
      if (ans) {
        answer = ans;
        continue;
      }

      const expl = parseExplainLine(line);
      if (expl) {
        explanation = expl;
        continue;
      }

      const opt = parseOptionLine(line);
      if (opt) {
        options.push(opt);
        continue;
      }

      if (options.length === 0) qTextLines.push(line);
      else {
        const last = options[options.length - 1];
        last.text = `${last.text}\n${line}`.trim();
      }
    }

    const text = qTextLines.join("\n").trim();
    if (!text) throw new Error(`Thiếu nội dung câu hỏi (gần dòng ${qStartLine}).`);
    if (options.length < 2) throw new Error(`Câu hỏi cần ít nhất 2 lựa chọn (gần dòng ${qStartLine}).`);

    questions.push({
      id: uid("q"),
      text,
      options: options.map(({ key, text: t }) => ({ key, text: t })),
      answer: answer || options.find((o) => o.starred)?.key || null,
      explanation,
    });

    qStartLine += block.length + 1;
  }

  // Assign answer keys by order if missing
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (q.answer) continue;
    const key = answerKeys[i] ?? null;
    if (!key) throw new Error(`Thiếu đáp án cho câu ${i + 1} trong mục ĐÁP ÁN.`);
    q.answer = key;
  }

  // Validate keys exist in options
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const keys = new Set(q.options.map((o) => o.key));
    if (!keys.has(q.answer)) throw new Error(`Đáp án câu ${i + 1} "${q.answer}" không khớp lựa chọn.`);
  }

  if (!title) title = titleFromText || "Đề trắc nghiệm";
  return finalizeQuestions({ title, description, questions, source: "custom" });
}

export function parseExamText(rawText, { title, description } = {}) {
  const lines = String(rawText ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");

  const answerIdx = findAnswerSectionIndex(lines);
  if (answerIdx >= 0) return parseAnswerSectionFormat(lines, { title, description });

  // Fallback to marker format (Q:, ANSWER:, * option)
  return parseMarkerFormat(lines, { title, description });
}

