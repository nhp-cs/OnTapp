import fs from "node:fs";

function readJson(path) {
  const raw = fs.readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

function writeJson(path, obj) {
  fs.writeFileSync(path, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

function normalizeText(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim();
}

function roundNice(x) {
  const v = Math.round(x * 10000) / 10000;
  return Number.isInteger(v) ? String(v) : String(v);
}

function findOptionText(q, key) {
  const k = String(key || "").toUpperCase();
  return String((q.options || []).find((o) => String(o.key).toUpperCase() === k)?.text ?? "").trim();
}

function pack(parts) {
  return normalizeText(parts.filter(Boolean).join(" "));
}

function isCalcLike(q) {
  const t = String(q.text || "");
  const nums = (t.match(/[-+]?\d+(?:\.\d+)?/g) || []).length;
  return /\b(tính|bao nhiêu|giá trị|tọa độ|thay số|kết quả)\b/i.test(t) && nums >= 2;
}

function explainAmbient(q) {
  const t = String(q.text || "");
  if (!/Ambient/i.test(t)) return null;
  const mKa = t.match(/ka\s*=\s*([0-9]+(?:\.[0-9]+)?)/i);
  const mIa = t.match(/Ia\s*=\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (!mKa || !mIa) return null;
  const ka = Number(mKa[1]);
  const ia = Number(mIa[1]);
  if (!Number.isFinite(ka) || !Number.isFinite(ia)) return null;
  const val = ka * ia;

  const ans = String(q.answer || "").toUpperCase();
  const optText = findOptionText(q, ans);

  return pack([
    `Công thức: I_ambient = k_a · I_a.`,
    `Thay số: I = ${roundNice(ka)} · ${roundNice(ia)} = ${roundNice(val)}.`,
    optText ? `Đối chiếu đáp án: ${ans} = ${optText}.` : `Đáp án: ${ans}.`,
    `Mẹo: gặp "ka, Ia" thì nhân trực tiếp; phương án đúng thường là số < 1 nếu ka, Ia < 1.`,
  ]);
}

function explainGouraudMid(q) {
  const t = String(q.text || "");
  if (!/Gouraud/i.test(t) || !/nội suy/i.test(t)) return null;
  const m1 = t.match(/I1\s*=\s*([0-9]+(?:\.[0-9]+)?)/i);
  const m2 = t.match(/I2\s*=\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (!m1 || !m2) return null;
  const i1 = Number(m1[1]);
  const i2 = Number(m2[1]);
  if (!Number.isFinite(i1) || !Number.isFinite(i2)) return null;
  const mid = (i1 + i2) / 2;

  const ans = String(q.answer || "").toUpperCase();
  const optText = findOptionText(q, ans);

  return pack([
    `Công thức nội suy tuyến tính dọc cạnh: I(t) = (1−t)·I1 + t·I2.`,
    `Ở trung điểm t=0.5 ⇒ I = (I1+I2)/2 = (${roundNice(i1)}+${roundNice(i2)})/2 = ${roundNice(mid)}.`,
    optText ? `Đối chiếu đáp án: ${ans} = ${optText}.` : `Đáp án: ${ans}.`,
    `Mẹo: "trung điểm" ⇒ lấy trung bình cộng; không cần tính gì phức tạp.`,
  ]);
}

function explainRotation90(q) {
  const t = String(q.text || "");
  if (!/quay/i.test(t) || !/90/.test(t) || !/O\(0,0\)/.test(t)) return null;
  const m = t.match(/P\(([-0-9]+)\s*,\s*([-0-9]+)\)/i);
  if (!m) return null;
  const x = Number(m[1]);
  const y = Number(m[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  const ccw = /ngược chiều kim đồng hồ/i.test(t);
  const cw = /thuận chiều kim đồng hồ/i.test(t);
  if (!ccw && !cw) return null;

  const xp = ccw ? -y : y;
  const yp = ccw ? x : -x;

  const ans = String(q.answer || "").toUpperCase();
  const optText = findOptionText(q, ans);

  return pack([
    `Ma trận quay: x' = x·cosθ − y·sinθ; y' = x·sinθ + y·cosθ.`,
    `Với θ=90°: cos=0, sin=1 ⇒ (x',y') = (${ccw ? "−y" : "y"}, ${ccw ? "x" : "−x"}).`,
    `Thay số P(${roundNice(x)},${roundNice(y)}) ⇒ P'(${roundNice(xp)},${roundNice(yp)}).`,
    optText ? `Đối chiếu đáp án: ${ans} = ${optText}.` : `Đáp án: ${ans}.`,
    `Mẹo: quay 90° ngược chiều: (x,y)→(−y,x); quay 90° thuận chiều: (x,y)→(y,−x).`,
  ]);
}

function explainPerspectiveDivision(q) {
  const t = String(q.text || "");
  if (!/Perspective Division|Chia phối cảnh/i.test(t)) return null;
  const ans = String(q.answer || "").toUpperCase();
  const optText = findOptionText(q, ans);
  return pack([
    `Công thức: (x_ndc, y_ndc, z_ndc) = (x/w, y/w, z/w) (sau bước chia phối cảnh).`,
    optText ? `Đáp án: ${ans} vì ${optText}` : `Đáp án: ${ans}.`,
    `Mẹo: câu nào nói "chia x,y,z cho w" là đúng; các phương án còn lại là cộng/trừ/nhân sai bản chất.`,
  ]);
}

function explainBezierTangent(q) {
  const t = String(q.text || "");
  if (!/Bézier/i.test(t) || !/bậc\s*2/i.test(t) || !/t\s*=\s*1/i.test(t)) return null;

  const mP0 = t.match(/P0\(([-0-9]+)\s*,\s*([-0-9]+)\)/i);
  const mP1 = t.match(/P1\(([-0-9]+)\s*,\s*([-0-9]+)\)/i);
  const mP2 = t.match(/P2\(([-0-9]+)\s*,\s*([-0-9]+)\)/i);
  if (!mP0 || !mP1 || !mP2) return null;

  const p1 = [Number(mP1[1]), Number(mP1[2])];
  const p2 = [Number(mP2[1]), Number(mP2[2])];
  if (p1.some((v) => !Number.isFinite(v)) || p2.some((v) => !Number.isFinite(v))) return null;

  const dir = [p2[0] - p1[0], p2[1] - p1[1]];
  const deriv = [2 * dir[0], 2 * dir[1]];

  const ans = String(q.answer || "").toUpperCase();
  const optText = findOptionText(q, ans);

  return pack([
    `Bézier bậc 2: B(t)=(1−t)^2P0 + 2(1−t)tP1 + t^2P2.`,
    `Đạo hàm: B'(t)=2(1−t)(P1−P0)+2t(P2−P1) ⇒ B'(1)=2(P2−P1).`,
    `Tính: P2−P1=(${roundNice(dir[0])}, ${roundNice(dir[1])}) ⇒ B'(1)=(${roundNice(deriv[0])}, ${roundNice(
      deriv[1],
    )}).`,
    `So đáp án: nếu phương án có (${roundNice(deriv[0])}, ${roundNice(deriv[1])}) thì chọn đạo hàm; nếu không có thì đề đang hỏi "vector hướng tiếp tuyến" (bỏ hệ số 2) ⇒ chọn (${roundNice(
      dir[0],
    )}, ${roundNice(dir[1])}). Hiện đáp án: ${ans} = ${optText}.`,
    `Mẹo: t=0 ⇒ hướng theo (P1−P0); t=1 ⇒ hướng theo (P2−P1).`,
  ]);
}

function explainZfighting(q) {
  const t = String(q.text || "");
  if (!/Z-?fighting/i.test(t)) return null;
  const ans = String(q.answer || "").toUpperCase();
  const optText = findOptionText(q, ans);
  return pack([
    `Z-fighting xuất hiện khi 2 bề mặt có độ sâu (z) rất gần nhau, trong khi depth buffer có độ phân giải hữu hạn nên phép so sánh z bị nhiễu/đảo qua lại theo từng pixel.`,
    optText ? `Đáp án: ${ans} vì ${optText}` : `Đáp án: ${ans}.`,
    `Mẹo: từ khoá "độ chính xác depth buffer/near-far" gần như luôn là đáp án đúng.`,
  ]);
}

function explainPhongSpec(q) {
  const t = String(q.text || "");
  if (!/Phong/i.test(t) || !/(Specular|gương)/i.test(t)) return null;
  const ans = String(q.answer || "").toUpperCase();
  const optText = findOptionText(q, ans);
  return pack([
    `Phong specular thường: I_s ∝ (max(0, R·V))^n (R: vector phản xạ, V: hướng nhìn).`,
    optText ? `Đáp án: ${ans} vì ${optText}` : `Đáp án: ${ans}.`,
    `Mẹo: specular luôn liên quan R và V; diffuse liên quan N và L (N·L).`,
  ]);
}

function explainDotLighting(q) {
  const t = String(q.text || "");
  if (!/Dot Product|tích vô hướng/i.test(t)) return null;
  const ans = String(q.answer || "").toUpperCase();
  const optText = findOptionText(q, ans);
  return pack([
    `Tích vô hướng: a·b = |a||b|cosθ ⇒ lấy cos góc giữa hai vector.`,
    `Trong chiếu sáng (Phong/Lambert), cường độ khuếch tán thường tỉ lệ max(0, N·L), nên dot product dùng để tính độ sáng theo góc chiếu.`,
    optText ? `Đáp án: ${ans} vì ${optText}` : `Đáp án: ${ans}.`,
    `Mẹo: thấy "cos góc"/"N·L"/"R·V" thì chọn phương án nói về dot product trong lighting.`,
  ]);
}

function fallbackExplanation(q) {
  const ans = String(q.answer || "").toUpperCase();
  const optText = findOptionText(q, ans);

  if (isCalcLike(q)) {
    return pack([
      `Đáp án đúng: ${ans}${optText ? ` = ${optText}` : ""}.`,
      `Gợi ý cách làm: xác định đại lượng cần tính → viết đúng công thức/định nghĩa → thay số → đối chiếu kết quả với các phương án.`,
      `Mẹo: kiểm tra nhanh dấu (+/−) và bậc lớn/nhỏ để loại đáp án vô lý trước khi tính chi tiết.`,
    ]);
  }

  return pack([
    `Đáp án đúng: ${ans}${optText ? ` vì ${optText}` : ""}.`,
    `Mẹo: gạch chân keyword trong câu hỏi (ví dụ: "depth buffer", "NDC", "aspect ratio", "mesh") rồi chọn phương án diễn đạt đúng nhất keyword đó.`,
  ]);
}

const RULES = [
  explainGouraudMid,
  explainAmbient,
  explainRotation90,
  explainBezierTangent,
  explainPerspectiveDivision,
  explainZfighting,
  explainPhongSpec,
  explainDotLighting,
];

function generateExplanation(q) {
  for (const rule of RULES) {
    try {
      const exp = rule(q);
      if (exp) return exp;
    } catch {
      // ignore
    }
  }
  return fallbackExplanation(q);
}

function main() {
  const path = "data/exams.json";
  const exams = readJson(path);
  if (!Array.isArray(exams)) throw new Error("data/exams.json phải là mảng");

  let count = 0;
  for (const ex of exams) {
    for (const q of ex.questions || []) {
      q.explanation = generateExplanation(q);
      count++;
    }
  }

  writeJson(path, exams);
  console.log(`Updated explanations: ${count} questions`);
}

main();
