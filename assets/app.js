import { clamp, escapeHtml } from "./lib.js";
import { getCustomExams } from "./storage.js";
import { addAttempt } from "./attempts.js";
const els = {
  home: document.getElementById("home"),
  quiz: document.getElementById("quiz"),
  result: document.getElementById("result"),

  examTitle: document.getElementById("examTitle"),
  examDesc: document.getElementById("examDesc"),

  nameInput: document.getElementById("nameInput"),
  nameHelp: document.getElementById("nameHelp"),
  startBtn: document.getElementById("startBtn"),

  quizMeta: document.getElementById("quizMeta"),
  quizTitle: document.getElementById("quizTitle"),
  backHomeBtn: document.getElementById("backHomeBtn"),
  submitBtn: document.getElementById("submitBtn"),
  progressBar: document.getElementById("progressBar"),

  navHint: document.getElementById("navHint"),
  qnav: document.getElementById("qnav"),
  qIndex: document.getElementById("qIndex"),
  qText: document.getElementById("qText"),
  options: document.getElementById("options"),
  prevBtn: document.getElementById("prevBtn"),
  nextBtn: document.getElementById("nextBtn"),

  resultMeta: document.getElementById("resultMeta"),
  scoreLine: document.getElementById("scoreLine"),
  reviewTopBtn: document.getElementById("reviewTopBtn"),
  retryBtn: document.getElementById("retryBtn"),
  newExamBtn: document.getElementById("newExamBtn"),
  review: document.getElementById("review"),
};

let activeExam = null;
let questionById = new Map();
let questionOrder = [];
let currentPos = 0;
let answersByQid = {}; // qid -> key
let participantName = "";
let startedAt = null;
let submittedAt = null;
let submittedOrder = null;

function showOnly(section) {
  for (const el of [els.home, els.quiz, els.result]) el.classList.add("hidden");
  section.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "auto" });
}

async function loadBundledExams() {
  try {
    const res = await fetch("./data/exams.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function normalizeExam(exam) {
  if (!exam || typeof exam !== "object") return null;
  if (!exam.id || !exam.title || !Array.isArray(exam.questions) || exam.questions.length === 0) return null;
  return exam;
}

function getActiveExam(bundled, custom) {
  const customExam = normalizeExam(custom?.[0]);
  if (customExam) return customExam;
  const bundledExam = normalizeExam(bundled?.[0]);
  if (bundledExam) return bundledExam;
  return null;
}

function formatMeta(exam) {
  const qCount = exam.questions?.length ?? 0;
  const source = exam.source === "custom" ? "Import" : "Mặc định";
  return `${qCount} câu • ${source}`;
}

function ensureName() {
  const name = (els.nameInput.value ?? "").trim();
  if (!name) {
    els.nameHelp.textContent = "Nhập tên để bắt đầu.";
    els.nameHelp.style.color = "rgba(159,18,57,1)";
    els.nameInput.focus();
    return null;
  }
  els.nameHelp.textContent = "";
  els.nameHelp.style.color = "";
  return name;
}

function buildQuestionIndex() {
  questionById = new Map();
  questionOrder = [];
  for (const q of activeExam.questions) {
    questionById.set(q.id, q);
    questionOrder.push(q.id);
  }
}

function renderHome() {
  if (!activeExam) {
    els.examTitle.textContent = "Chưa có đề";
    if (els.examDesc) els.examDesc.textContent = "";
    els.startBtn.disabled = true;
    return;
  }
  els.examTitle.textContent = activeExam.title;
  if (els.examDesc) els.examDesc.textContent = "";
  els.startBtn.disabled = false;
}

function startExam() {
  if (!activeExam) return;
  const name = ensureName();
  if (!name) return;

  participantName = name;
  answersByQid = {};
  currentPos = 0;
  startedAt = new Date();
  submittedAt = null;
  submittedOrder = null;

  buildQuestionIndex();

  els.quizTitle.textContent = activeExam.title;
  els.quizMeta.textContent = `${participantName} • ${formatMeta(activeExam)}`;
  renderNav();
  renderQuestion();
  showOnly(els.quiz);
}

function answeredCount() {
  return Object.keys(answersByQid).length;
}

function renderNav() {
  const total = questionOrder.length;
  const answered = answeredCount();
  els.navHint.textContent = `${answered}/${total} đã chọn`;

  els.qnav.innerHTML = questionOrder
    .map((qid, idx) => {
      const isCur = idx === currentPos;
      const isAnswered = answersByQid[qid] != null;
      const classes = ["qnavBtn"];
      if (isCur) classes.push("qnavBtn--cur");
      if (isAnswered) classes.push("qnavBtn--answered");
      return `<button type="button" class="${classes.join(" ")}" data-action="jump" data-idx="${idx}">${idx + 1}</button>`;
    })
    .join("");
}

function renderQuestion() {
  const total = questionOrder.length;
  const qid = questionOrder[currentPos];
  const q = questionById.get(qid);

  els.qIndex.textContent = `Câu ${currentPos + 1}`;
  els.qText.textContent = q.text;

  const selected = answersByQid[qid] ?? null;
  els.options.innerHTML = q.options
    .map((o) => {
      const isSelected = selected === o.key;
      return `
        <div class="opt ${isSelected ? "opt--selected" : ""}" role="button" tabindex="0" data-action="choose" data-key="${escapeHtml(
          o.key,
        )}">
          <div class="opt__key">${escapeHtml(o.key)}</div>
          <div class="opt__text">${escapeHtml(o.text)}</div>
        </div>
      `;
    })
    .join("");

  els.prevBtn.disabled = currentPos === 0;
  els.nextBtn.textContent = currentPos === total - 1 ? "Nộp bài" : "Tiếp →";

  const pct = Math.round((answeredCount() / total) * 100);
  els.progressBar.style.width = `${clamp(pct, 0, 100)}%`;
  renderNav();
}

function chooseAnswer(key) {
  const qid = questionOrder[currentPos];
  answersByQid[qid] = key;
  renderQuestion();
}

function jumpTo(idx) {
  currentPos = clamp(idx, 0, questionOrder.length - 1);
  renderQuestion();
}

function prev() {
  jumpTo(currentPos - 1);
}

function next() {
  jumpTo(currentPos + 1);
}

function computeScore() {
  let correct = 0;
  const total = activeExam.questions.length;
  for (const q of activeExam.questions) {
    const picked = answersByQid[q.id] ?? null;
    if (picked && picked === q.answer) correct++;
  }
  return { correct, total };
}

function submitExam() {
  const total = questionOrder.length;
  const answered = answeredCount();
  const proceed = answered === total || confirm(`Bạn mới trả lời ${answered}/${total} câu. Vẫn nộp bài?`);
  if (!proceed) return;

  submittedAt = new Date();
  submittedOrder = [...questionOrder];
  const { correct, total: totalScore } = computeScore();
  const pct = Math.round((correct / totalScore) * 100);
  const durationSec = startedAt && submittedAt ? Math.max(0, Math.round((submittedAt - startedAt) / 1000)) : null;
  addAttempt({
    examId: activeExam?.id ?? "",
    examTitle: activeExam?.title ?? "",
    name: participantName,
    correct,
    total: totalScore,
    pct,
    durationSec,
    startedAt: startedAt ? startedAt.toISOString() : null,
    submittedAt: submittedAt.toISOString(),
  });
  renderResult();
  showOnly(els.result);
}

function renderResult() {
  const { correct, total } = computeScore();
  const pct = Math.round((correct / total) * 100);

  const timeTakenSec =
    startedAt && submittedAt ? Math.max(0, Math.round((submittedAt - startedAt) / 1000)) : null;
  const mm = timeTakenSec != null ? String(Math.floor(timeTakenSec / 60)).padStart(2, "0") : "00";
  const ss = timeTakenSec != null ? String(timeTakenSec % 60).padStart(2, "0") : "00";
  const timeText = timeTakenSec != null ? `${mm}:${ss}` : "--:--";

  els.resultMeta.textContent = `${participantName} • ${activeExam.title} • Thời gian: ${timeText}`;
  els.scoreLine.textContent = `Đúng ${correct}/${total} • ${pct}%`;

  const order = submittedOrder ?? questionOrder;

  els.review.innerHTML = order
    .map((qid, idx) => {
      const q = questionById.get(qid);
      const picked = answersByQid[qid] ?? null;
      const ok = picked === q.answer;
      const badge = ok
        ? `<span class="badge badge--ok">ĐÚNG</span>`
        : `<span class="badge badge--bad">${picked ? "SAI" : "BỎ TRỐNG"}</span>`;
      const opts = q.options
        .map((o) => {
          const isPicked = picked === o.key;
          const isCorrect = q.answer === o.key;
          const cls = isCorrect ? "opt opt--correct" : isPicked ? "opt opt--wrong" : "opt";
          return `
            <div class="${cls}">
              <div class="opt__key">${escapeHtml(o.key)}</div>
              <div class="opt__text">${escapeHtml(o.text)}</div>
            </div>
          `;
        })
        .join("");
      const explain = q.explanation
        ? `<div class="reviewItem__explain"><b>Giải thích:</b> ${escapeHtml(q.explanation)}</div>`
        : "";
      return `
        <div class="reviewItem" id="q-${idx + 1}">
          <div class="reviewItem__head">
            <div class="reviewItem__title">Câu ${idx + 1}</div>
            ${badge}
          </div>
          <div class="reviewItem__q">${escapeHtml(q.text)}</div>
          <div class="options">${opts}</div>
          <div class="muted small">Bạn chọn: <b>${escapeHtml(picked ?? "—")}</b> • Đáp án đúng: <b>${escapeHtml(
            q.answer,
          )}</b></div>
          ${explain}
        </div>
      `;
    })
    .join("");
}

function retry() {
  answersByQid = {};
  currentPos = 0;
  startedAt = new Date();
  submittedAt = null;
  submittedOrder = null;
  renderNav();
  renderQuestion();
  showOnly(els.quiz);
}

function backToHome() {
  showOnly(els.home);
}

function bindEvents() {
  els.startBtn.addEventListener("click", startExam);
  els.nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") startExam();
  });

  els.qnav.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action='jump']");
    if (!btn) return;
    jumpTo(Number(btn.dataset.idx));
  });

  els.options.addEventListener("click", (e) => {
    const opt = e.target.closest("[data-action='choose']");
    if (!opt) return;
    chooseAnswer(opt.dataset.key);
  });

  els.options.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const opt = e.target.closest("[data-action='choose']");
    if (!opt) return;
    e.preventDefault();
    chooseAnswer(opt.dataset.key);
  });

  els.prevBtn.addEventListener("click", prev);
  els.nextBtn.addEventListener("click", () => {
    if (currentPos === questionOrder.length - 1) submitExam();
    else next();
  });
  els.submitBtn.addEventListener("click", submitExam);
  els.backHomeBtn.addEventListener("click", backToHome);

  els.reviewTopBtn.addEventListener("click", () =>
    window.scrollTo({ top: els.review.offsetTop - 10, behavior: "smooth" }),
  );
  els.retryBtn.addEventListener("click", retry);
  els.newExamBtn.addEventListener("click", backToHome);

  document.addEventListener("keydown", (e) => {
    if (els.quiz.classList.contains("hidden")) return;
    if (e.key === "ArrowLeft") prev();
    if (e.key === "ArrowRight") next();
  });
}

async function boot() {
  const [bundled, custom] = await Promise.all([loadBundledExams(), Promise.resolve(getCustomExams())]);
  activeExam = getActiveExam(bundled, custom);
  renderHome();
  showOnly(els.home);
}

bindEvents();
boot();












