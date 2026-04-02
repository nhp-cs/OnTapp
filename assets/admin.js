import { escapeHtml } from "./lib.js";
import { parseExamText } from "./parser.js";
import { getCustomExams, upsertCustomExam } from "./storage.js";
import { getSupabaseConfig, setSupabaseConfig, clearSupabaseConfig } from "./config.js";
import { listAttempts, attemptsBackend } from "./recording.js";
import { clearAttempts } from "./attempts.js";

const els = {
  statsLine: document.getElementById("statsLine"),

  sbUrl: document.getElementById("sbUrl"),
  sbAnon: document.getElementById("sbAnon"),
  saveBackendBtn: document.getElementById("saveBackendBtn"),
  clearBackendBtn: document.getElementById("clearBackendBtn"),
  backendLine: document.getElementById("backendLine"),
  attemptsLine: document.getElementById("attemptsLine"),
  attemptsList: document.getElementById("attemptsList"),
  exportAttemptsBtn: document.getElementById("exportAttemptsBtn"),
  clearAttemptsBtn: document.getElementById("clearAttemptsBtn"),

  examTitle: document.getElementById("examTitle"),
  examDesc: document.getElementById("examDesc"),
  rawInput: document.getElementById("rawInput"),
  previewBtn: document.getElementById("previewBtn"),
  loadSampleBtn: document.getElementById("loadSampleBtn"),
  clearBtn: document.getElementById("clearBtn"),
  saveBtn: document.getElementById("saveBtn"),
  exportBtn: document.getElementById("exportBtn"),
  copyJsonBtn: document.getElementById("copyJsonBtn"),
  statusLine: document.getElementById("statusLine"),
  previewCard: document.getElementById("previewCard"),
  previewMeta: document.getElementById("previewMeta"),
  preview: document.getElementById("preview"),
};

let lastParsed = null;

const SAMPLE = `# Đề mẫu

1 + 1 = ?
A. 1
B. 2
C. 3

ĐÁP ÁN
B`;

function setStatus(msg, type = "info") {
  const colors = {
    info: "var(--muted)",
    ok: "rgba(20,83,45,1)",
    bad: "rgba(159,18,57,1)",
    warn: "rgba(146,64,14,1)",
  };
  els.statusLine.textContent = msg;
  els.statusLine.style.color = colors[type] ?? "";
}

async function loadBundledExams() {
  try {
    const res = await fetch("./data/exams.json", { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function formatDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("vi-VN");
}

function formatDuration(sec) {
  if (sec == null) return "";
  const s = Math.max(0, Math.round(sec));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}
function refreshBackendUI() {
  const cfg = getSupabaseConfig();
  if (els.sbUrl) els.sbUrl.value = cfg?.url ?? "";
  if (els.sbAnon) els.sbAnon.value = cfg?.anonKey ?? "";
  if (els.backendLine) els.backendLine.textContent = cfg ? "Supabase: ON" : "Supabase: OFF";
}

function saveBackend() {
  const url = String(els.sbUrl?.value ?? "").trim();
  const anonKey = String(els.sbAnon?.value ?? "").trim();
  if (!url || !anonKey) {
    if (els.backendLine) els.backendLine.textContent = "Nhập đủ URL và anon key";
    return;
  }
  setSupabaseConfig({ url, anonKey });
  refreshBackendUI();
  refreshAttempts();
}

function clearBackend() {
  const ok = confirm("Tắt Supabase (quay về lưu lịch sử trên máy này)?");
  if (!ok) return;
  clearSupabaseConfig();
  refreshBackendUI();
  refreshAttempts();
}

async function refreshStats() {
  if (!els.statsLine) return;
  const [bundled, custom] = await Promise.all([loadBundledExams(), Promise.resolve(getCustomExams())]);

  const bundledCount = Array.isArray(bundled) ? bundled.length : 0;
  const customCount = Array.isArray(custom) ? custom.length : 0;

  const totalQuestions =
    (Array.isArray(bundled) ? bundled : []).reduce((acc, e) => acc + (e?.questions?.length ?? 0), 0) +
    (Array.isArray(custom) ? custom : []).reduce((acc, e) => acc + (e?.questions?.length ?? 0), 0);

  const newestCustom = (Array.isArray(custom) ? custom : [])
    .map((e) => e?.createdAt)
    .filter(Boolean)
    .sort()
    .at(-1);

  const lastText = newestCustom ? ` • Import: ${formatDateTime(newestCustom)}` : "";
  els.statsLine.textContent = `Mặc định: ${bundledCount} • Trên máy này: ${customCount} • Câu: ${totalQuestions}${lastText}`;
}

async function refreshAttempts() {
  try {
    const res = await listAttempts(30);
    const attempts = res.attempts || [];
    const total = attempts.length;
    const backend = attemptsBackend();

    if (els.attemptsLine) {
      if (!res.ok) {
        const status = res.error?.status ?? res.status ?? "";
        const reason = res.error?.reason ?? res.reason ?? "";
        els.attemptsLine.textContent = `${backend} • lỗi ${status || "?"}${reason ? ` (${reason})` : ""}`;
      } else {
        const last =
          attempts[0]?.submitted_at ||
          attempts[0]?.submittedAt ||
          attempts[0]?.created_at ||
          attempts[0]?.createdAt ||
          null;
        const lastText = last ? ` • Gần nhất: ${formatDateTime(last)}` : "";

        const avgPct = total > 0 ? Math.round(attempts.reduce((acc, a) => acc + (Number(a?.pct) || 0), 0) / total) : 0;
        const bestPct = total > 0 ? Math.max(...attempts.map((a) => Number(a?.pct) || 0)) : 0;

        els.attemptsLine.textContent = `${backend} • ${total} lượt${res.count != null ? "/" + res.count : ""} • TB: ${avgPct}% • Cao nhất: ${bestPct}%${lastText}`;
      }
    }

    if (!els.attemptsList) return;

    if (!res.ok) {
      const status = res.error?.status ?? res.status ?? "";
      const detail = String(res.error?.detail ?? res.detail ?? "").trim();
      const msg = [
        `Không đọc được lượt thi từ Supabase (status ${status || "?"}).`,
        detail ? `Chi tiết: ${detail}` : "",
        "Kiểm tra: table `attempts` có bật RLS + có policy SELECT cho role `anon`.",
        "Ngoài ra kiểm tra table có được expose qua API và đúng schema `public`.",
      ]
        .filter(Boolean)
        .join("\n");

      els.attemptsList.innerHTML = `<pre class="preBox">${escapeHtml(msg)}</pre>`;
      return;
    }
    if (total === 0) {
      if (backend === "supabase") {
        const msg = [
          "Chưa thấy lượt thi nào.",
          "",
          "Nếu bạn đã thấy dữ liệu trong Supabase Dashboard nhưng ở đây vẫn trống:",
          "- Table `attempts` đang bật RLS và chưa có policy SELECT cho role `anon` (client dùng anon key).",
          "- Hoặc policy SELECT đang lọc hết rows (ví dụ theo user_id).",
          "",
          "Gợi ý nhanh: tạo policy SELECT cho `anon` (hoặc dùng service role key ở backend server, không dùng trên client).",
        ].join("\n");
        els.attemptsList.innerHTML = `<pre class="preBox">${escapeHtml(msg)}</pre>`;
      } else {
        els.attemptsList.innerHTML = "";
      }
      return;
    }

    els.attemptsList.innerHTML = attempts
      .map((a) => {
        const name = a?.name ? String(a.name) : "—";
        const examTitle = a?.exam_title ? String(a.exam_title) : a?.examTitle ? String(a.examTitle) : "—";
        const correct = Number(a?.correct) || 0;
        const tot = Number(a?.total) || 0;
        const pct = Number(a?.pct) || 0;
        const when = formatDateTime(a?.submitted_at || a?.submittedAt || a?.created_at || a?.createdAt);
        const dur = formatDuration(a?.duration_sec ?? a?.durationSec);
        const src = a?.source ? String(a.source) : "";
        const meta = [examTitle, src, when, dur ? `⏱ ${dur}` : ""].filter(Boolean).join(" • ");

        return `
          <div class="reviewItem">
            <div class="reviewItem__head">
              <div class="reviewItem__title">${escapeHtml(name)} — ${correct}/${tot} (${pct}%)</div>
              <span class="badge">${escapeHtml(examTitle)}</span>
            </div>
            <div class="muted small">${escapeHtml(meta)}</div>
          </div>
        `;
      })
      .join("");
  } catch (err) {
    const msg = `Lỗi tải lượt thi: ${err?.message ?? String(err)}`;
    if (els.attemptsLine) els.attemptsLine.textContent = msg;
    if (els.attemptsList) els.attemptsList.innerHTML = `<pre class="preBox">${escapeHtml(msg)}</pre>`;
  }
}
async function exportAttempts() {
  const res = await listAttempts(1000);
  const attempts = res.attempts || [];
  const blob = new Blob([JSON.stringify(attempts, null, 2)], { type: "application/json;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "attempts.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function doClearAttempts() {
  const ok = confirm("Xoá lịch sử trên máy này?");
  if (!ok) return;
  clearAttempts();
  refreshAttempts();
}

function renderPreview(exam) {
  els.previewCard.classList.remove("hidden");
  els.previewMeta.textContent = `${exam.questions.length} câu`;
  els.preview.innerHTML = exam.questions
    .map((q, idx) => {
      const opts = q.options
        .map((o) => {
          const isCorrect = q.answer === o.key;
          const cls = isCorrect ? "opt opt--correct" : "opt";
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
        <div class="reviewItem">
          <div class="reviewItem__head">
            <div class="reviewItem__title">Câu ${idx + 1}</div>
            <span class="badge badge--ok">Đáp án: ${escapeHtml(q.answer)}</span>
          </div>
          <div class="reviewItem__q">${escapeHtml(q.text)}</div>
          <div class="options">${opts}</div>
          ${explain}
        </div>
      `;
    })
    .join("");
}

function updateButtons() {
  const enabled = !!lastParsed;
  els.saveBtn.disabled = !enabled;
  els.exportBtn.disabled = !enabled;
  els.copyJsonBtn.disabled = !enabled;
}

function doPreview() {
  try {
    const exam = parseExamText(els.rawInput.value, {
      title: els.examTitle.value,
      description: els.examDesc.value,
    });
    lastParsed = exam;
    renderPreview(exam);
    updateButtons();
    setStatus(`OK: ${exam.questions.length} câu`, "ok");
  } catch (err) {
    lastParsed = null;
    updateButtons();
    els.previewCard.classList.add("hidden");
    setStatus(`Lỗi: ${err?.message ?? String(err)}`, "bad");
  }
}

function saveLocal() {
  if (!lastParsed) return;
  upsertCustomExam(lastParsed);
  refreshStats();
  setStatus(`Đã lưu "${lastParsed.title}".`, "ok");
}

function exportJson() {
  if (!lastParsed) return;
  const blob = new Blob([JSON.stringify(lastParsed, null, 2)], { type: "application/json;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${(lastParsed.title || "exam")
    .replace(/[^\p{L}\p{N}\s_-]+/gu, "")
    .trim()
    .replace(/\s+/g, "_")}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function copyJson() {
  if (!lastParsed) return;
  const text = JSON.stringify(lastParsed, null, 2);
  try {
    await navigator.clipboard.writeText(text);
    setStatus("Đã copy JSON.", "ok");
  } catch {
    setStatus("Không copy được. Hãy dùng Export JSON.", "warn");
  }
}

function bindEvents() {
  if (els.saveBackendBtn) els.saveBackendBtn.addEventListener("click", saveBackend);
  if (els.clearBackendBtn) els.clearBackendBtn.addEventListener("click", clearBackend);
  els.previewBtn.addEventListener("click", doPreview);
  els.loadSampleBtn.addEventListener("click", () => {
    els.rawInput.value = SAMPLE;
    if (!els.examTitle.value) els.examTitle.value = "Đề mẫu";
    if (!els.examDesc.value) els.examDesc.value = "";
    setStatus("", "info");
  });
  els.clearBtn.addEventListener("click", () => {
    const ok = confirm("Xoá nội dung đang nhập?");
    if (!ok) return;
    els.rawInput.value = "";
    lastParsed = null;
    updateButtons();
    els.previewCard.classList.add("hidden");
    setStatus("", "info");
  });
  els.saveBtn.addEventListener("click", saveLocal);
  els.exportBtn.addEventListener("click", exportJson);
  els.copyJsonBtn.addEventListener("click", copyJson);

  if (els.exportAttemptsBtn) els.exportAttemptsBtn.addEventListener("click", exportAttempts);
  if (els.clearAttemptsBtn) els.clearAttemptsBtn.addEventListener("click", doClearAttempts);

  let t = null;
  const schedule = () => {
    clearTimeout(t);
    t = setTimeout(() => {
      if (!els.rawInput.value.trim()) return;
      doPreview();
    }, 450);
  };
  els.rawInput.addEventListener("input", schedule);
  els.examTitle.addEventListener("input", schedule);
  els.examDesc.addEventListener("input", schedule);
}

bindEvents();
setStatus("", "info");
updateButtons();
refreshStats();
refreshAttempts().finally(refreshBackendUI);


















