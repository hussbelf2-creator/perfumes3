import type { Bi } from "@/i18n/context";
import { THICKNESS, type BoxDesign } from "./types";

// شجرة الألواح: كل لوح مستطيل (أو مضلّع) بإحداثيات محلية بالمليمتر (x يميناً، y أعلى)،
// ومفصلاته تربطه بأبنائه. الشجرة نفسها تُنتج: المخطط المسطّح، خطوط القص والطي، والمجسم المطوي.

export type Pt = [number, number];
export type Edge = "top" | "bottom" | "left" | "right";
export type Face = "front" | "back" | "left" | "right" | "top" | "bottom";

export interface Panel {
  id: string;
  w: number;
  h: number;
  /** حدود اللوح بإحداثياته المحلية؛ الافتراضي مستطيل كامل */
  outline?: Pt[];
  /** الوجه الذي يظهر عليه التصميم بعد الطي (إن وُجد) */
  face?: Face;
  /** دوران محتوى الوجه بالدرجات حتى يُقرأ معتدلاً بعد الطي */
  rot?: 0 | 90 | 180 | 270;
  kind?: "panel" | "glue" | "flap";
  /** شريط مختصر (اسم الدار فقط) بدل التصميم الكامل */
  band?: boolean;
  /** عرض منطقة التصميم إن كانت أضيق من اللوح (الأسطوانة: الواجهة فقط من الورقة الملفوفة) */
  contentW?: number;
  /** إزاحة للداخل (مم) للألسنة التي تُطوى خلف لوح آخر — تمنع تداخل السطحين */
  inset?: number;
  /** فتحات مقصوصة داخل اللوح (نافذة عرض، فتحة تعليق) بإحداثياته المحلية */
  holes?: Pt[][];
  hinges: Hinge[];
}

export interface Hinge {
  edge: Edge;
  /** بداية الابن على طول حافة الأب */
  at: number;
  /** زاوية الطي عند الإغلاق (درجات) */
  fold: number;
  /** ترتيب الطي في الحركة: الجدران أولاً ثم الألسنة */
  stage: number;
  /** مفصل غطاء: زاويته عند الفتح الكامل */
  openTo?: number;
  /** false = حدّ منطقة لصق وليس خط تكسير */
  crease?: boolean;
  child: Panel;
}

/** تموضع القطعة في المشهد (مم وراديان) حسب نسبة الطي والفتح */
export interface Pose {
  pos: [number, number, number];
  rot: [number, number, number];
  order?: "XYZ" | "YXZ";
}

export interface Piece {
  id: string;
  name: Bi;
  root: Panel;
  /** نوع العرض ثلاثي الأبعاد: ألواح تُطوى، أو ورقة تُلف (الأسطوانة)، أو قرص */
  mode: "fold" | "wrap" | "disc";
  pose: (fold: number, open: number) => Pose;
  /** للأسطوانة: القطر والارتفاع */
  wrap?: { d: number; h: number; overlap: number };
}

export interface BoxSpec {
  pieces: Piece[];
  /** المقاس الخارجي بعد التجميع (مم) */
  outer: { w: number; d: number; h: number };
  /** يُحسب في buildSpec */
  stages: number;
  t: number;
}

// ── أدوات الأشكال

/** يحوّل شكلاً معرّفاً بـ (u على طول المفصل، v بعيداً عنه) إلى إحداثيات الابن */
function mapUV(edge: Edge, along: number, depth: number, pts: Pt[]): { w: number; h: number; outline: Pt[] } {
  switch (edge) {
    case "top":
      return { w: along, h: depth, outline: pts.map(([u, v]) => [u, v]) };
    case "bottom":
      return { w: along, h: depth, outline: pts.map(([u, v]) => [u, depth - v]) };
    case "right":
      return { w: depth, h: along, outline: pts.map(([u, v]) => [v, u]) };
    case "left":
      return { w: depth, h: along, outline: pts.map(([u, v]) => [depth - v, u]) };
  }
}

function arc(cx: number, cy: number, r: number, a0: number, a1: number, n = 8): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

type FlapShape = "rect" | "taper" | "tuck" | "dust";

function shape(kind: FlapShape, A: number, D: number): Pt[] {
  if (kind === "taper") {
    const c = Math.min(D * 0.85, A * 0.22);
    return [[0, 0], [A, 0], [A - c, D], [c, D]];
  }
  if (kind === "tuck") {
    // لسان الإغلاق: زوايا مستديرة حتى ينزلق بسهولة
    const r = Math.min(D * 0.75, A * 0.2, 12);
    return [[0, 0], [A, 0], [A, D - r], ...arc(A - r, D - r, r, 0, Math.PI / 2), ...arc(r, D - r, r, Math.PI / 2, Math.PI)];
  }
  if (kind === "dust") {
    // لسان الغبار: مائل من جهة الغطاء ليُفسح له
    return [[0, 0], [A, 0], [A - 1.5, D * 0.55], [A - A * 0.3, D], [A * 0.06 + 1, D], [0.8, D * 0.35]];
  }
  return [[0, 0], [A, 0], [A, D], [0, D]];
}

function flap(id: string, edge: Edge, along: number, depth: number, kind: FlapShape, extra: Partial<Panel> = {}): Panel {
  const m = mapUV(edge, along, depth, shape(kind, along, depth));
  return { id, ...m, kind: "flap", hinges: [], ...extra };
}

const H = (edge: Edge, child: Panel, fold: number, stage: number, more: Partial<Hinge> = {}): Hinge => ({ edge, at: 0, fold, stage, child, ...more });

// ── الأنواع: بناؤون عامّون تُشتق منها الأربعون
export const smooth = (x: number) => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};

export const HANG_TAB = 26;
export const SHOULDER_NECK = 10;

/** مستطيل بزوايا دائرية كفتحة */
function roundedRect(x: number, y: number, w: number, h: number, r: number): Pt[] {
  const rr = Math.min(r, w / 2, h / 2);
  return [...arc(x + w - rr, y + rr, rr, -Math.PI / 2, 0, 6), ...arc(x + w - rr, y + h - rr, rr, 0, Math.PI / 2, 6), ...arc(x + rr, y + h - rr, rr, Math.PI / 2, Math.PI, 6), ...arc(x + rr, y + rr, rr, Math.PI, 1.5 * Math.PI, 6)];
}
/** نافذة عرض على لوح بعرض w وارتفاع h (60% × 50%) */
const windowHole = (w: number, h: number): Pt[] => {
  const ww = Math.max(14, w * 0.6), wh = Math.max(14, h * 0.5);
  return roundedRect((w - ww) / 2, h * 0.26, ww, wh, 4);
};
/** فتحة تعليق أوروبية (شق بدائرة) حول (cx, cy) */
const euroHole = (cx: number, cy: number): Pt[] => [[cx - 12, cy - 1.5], [cx - 4, cy - 1.5], ...arc(cx, cy, 3.2, Math.PI + 0.5, 2 * Math.PI - 0.5, 6), [cx + 4, cy - 1.5], [cx + 12, cy - 1.5], [cx + 12, cy + 1.5], [cx + 4, cy + 1.5], ...arc(cx, cy, 3.2, 0.5, Math.PI - 0.5, 6), [cx - 4, cy + 1.5], [cx - 12, cy + 1.5]];
/** فتحة يد بيضاوية */
const handHole = (cx: number, cy: number, w: number, h: number): Pt[] => roundedRect(cx - w / 2, cy - h / 2, w, h, h / 2);

/** مضلّع منتظم بضلع S على الحافة من (0,0) إلى (S,0)؛ up: يعلو الحافة، وإلا ينعكس ليكون أسفلها (للغطاء السفلي) */
function ngon(n: number, S: number, up: boolean): { outline: Pt[]; h: number } {
  const a = S / (2 * Math.tan(Math.PI / n)), R = S / (2 * Math.sin(Math.PI / n));
  const pts: Pt[] = [];
  for (let k = 0; k < n; k++) {
    const th = -Math.PI / 2 + Math.PI / n + (2 * Math.PI * k) / n;
    pts.push([S / 2 + R * Math.cos(th), a + R * Math.sin(th)]);
  }
  const h = Math.max(...pts.map((p) => p[1]));
  return { outline: up ? pts : pts.map(([x, y]) => [x, h - y] as Pt).reverse(), h };
}

// ── علبة مطوية عامة: جسم من n أوجه، وإغلاق علوي وسفلي، وفتحات وملحقات
type Top = "tuck" | "none" | "seal" | "gable" | "handle";
type Bottom = "tuck" | "none" | "seal" | "crash";
interface CartonOpts {
  n?: 3 | 4 | 5 | 6 | 8;
  top: Top;
  bottom: Bottom;
  /** اللوح الذي يحمل الغطاء العلوي (RTE: الخلف، STE: الواجهة) */
  tuckOn?: "front" | "back";
  windows?: ("front" | "back")[];
  hang?: boolean;
  notch?: boolean;
  /** عمق ألسنة الغراء نسبة إلى العمق (1 = تراكب كامل) */
  sealDepth?: number;
  pieceName?: Bi;
}

function carton(d: BoxDesign, o: CartonOpts): BoxSpec {
  const t = THICKNESS[d.style];
  const n = o.n ?? 4;
  const Hh = d.H;
  const inset = t + 0.12;
  // أبعاد الأوجه: مستطيلة (L, W) أو مضلّع منتظم بضلع S من العرض بين الوجوه
  const S = n === 4 ? 0 : d.L * Math.tan(Math.PI / n);
  const widths = n === 4 ? [d.L, d.W, d.L, d.W] : Array.from({ length: n }, () => S);
  const half = Math.floor(n / 2);
  const faces: (Face | undefined)[] = n === 4 ? ["front", "right", "back", "left"] : Array.from({ length: n }, (_, i) => (i === 0 ? "front" : i === half ? "back" : i < half ? "right" : "left"));
  const ids = n === 4 ? ["front", "side-r", "back", "side-l"] : Array.from({ length: n }, (_, i) => (i === 0 ? "front" : i === half ? "back" : `side-${i}`));
  const glue = Math.min(14, Math.max(8, Math.min(widths[0], Hh) * 0.25));
  const fold = 360 / n;
  const panels: Panel[] = ids.map((id, i) => ({ id, w: widths[i], h: Hh, face: faces[i], hinges: [] }));
  for (let i = 0; i < n - 1; i++) panels[i].hinges.push(H("right", panels[i + 1], fold, 0));
  panels[n - 1].hinges.push(H("right", flap("glue", "right", Hh, glue, "taper", { kind: "glue", inset }), fold, 0));
  const front = panels[0], back = panels[half];
  const W = n === 4 ? d.W : S;
  const tuck = Math.min(18, Math.max(10, W * 0.45));
  const dust = Math.min(W * 0.8, widths[0] * 0.9, 30);
  // فتحة إبهام على واجهة الغلاف
  if (o.notch) {
    const r = Math.min(9, widths[0] * 0.18);
    front.outline = [[0, 0], [widths[0], 0], [widths[0], Hh], [widths[0] / 2 + r, Hh], ...arc(widths[0] / 2, Hh, r, 0, -Math.PI, 12).slice(1, -1), [widths[0] / 2 - r, Hh], [0, Hh]];
  }
  for (const wname of o.windows ?? []) {
    const p = wname === "front" ? front : back;
    p.holes = [...(p.holes ?? []), windowHole(p.w, p.h)];
  }
  // الغطاء العلوي
  // المضلّعات: الغطاءان من الواجهة (ضلعها هو مرجع الشكل)؛ المستطيلة حسب النوع
  const lidPanel = n !== 4 || (o.tuckOn ?? "back") === "front" ? front : back;
  const otherPanel = lidPanel === back ? front : back;
  const sidePanels = panels.filter((p) => p !== front && p !== back);
  const lidFor = (edge: "top" | "bottom", onBack: boolean, p: Panel) => {
    if (n === 4) return { id: `lid-${edge}`, w: p.w, h: W, face: edge, rot: onBack ? 180 : 0, kind: "flap", hinges: [H(edge, flap(`tuck-${edge}`, edge, p.w, tuck, "tuck", { inset }), 90, 3, edge === "top" ? { openTo: 0 } : {})] } as Panel;
    const g = ngon(n, S, edge === "top");
    // المضلّعات الفردية (3، 5) لا ضلع مقابلاً للمفصل فيُدسّ غطاؤها بالاحتكاك بلا لسان
    const tuckFlap = n % 2 === 0 ? [H(edge, flap(`tuck-${edge}`, edge, S, Math.min(14, Math.max(8, S * 0.5)), "tuck", { inset }), 90, 3, edge === "top" ? { openTo: 0 } : {})] : [];
    return { id: `lid-${edge}`, w: S, h: g.h, face: edge, kind: "flap", outline: g.outline, hinges: tuckFlap } as Panel;
  };
  if (o.top === "tuck" || o.top === "handle") {
    lidPanel.hinges.push(H("top", lidFor("top", lidPanel === back, lidPanel), 90, 2, { openTo: -70 }));
    if (n === 4) for (const sp of sidePanels) sp.hinges.push(H("top", flap(`${sp.id}-dust-top`, "top", sp.w, dust, "dust", { inset }), 90, 1));
  }
  if (o.bottom === "tuck") {
    const bp = front;
    bp.hinges.push(H("bottom", lidFor("bottom", false, bp), 90, 2));
    if (n === 4) for (const sp of sidePanels) sp.hinges.push(H("bottom", flap(`${sp.id}-dust-bottom`, "bottom", sp.w, dust, "dust", { inset }), 90, 1));
  }
  // ألسنة غراء (Seal end / تراكب كامل / كرتون 0201)
  const seal = (edge: "top" | "bottom") => {
    const deep = Math.max(10, W * (o.sealDepth ?? 0.5) + (o.sealDepth ? 0 : 2));
    const shallow = Math.max(8, Math.min(deep, W / 2 - 1));
    for (const p of [front, back]) p.hinges.push(H(edge, flap(`${p.id}-seal-${edge}`, edge, p.w, deep, "rect", { inset: p === back ? inset : 0, face: p === front && edge === "top" ? "top" : undefined }), 90, 2, edge === "top" ? { openTo: p === front ? -60 : 0 } : {}));
    for (const sp of sidePanels) sp.hinges.push(H(edge, flap(`${sp.id}-seal-${edge}`, edge, sp.w, shallow, "rect", { inset, kind: "glue" }), 90, 1));
  };
  if (o.top === "seal") seal("top");
  if (o.bottom === "seal") seal("bottom");
  // قاعدة القفل الذاتي: لوح رئيسي بخطاف، لوحان مائلان، ولوح غراء خلفي
  if (o.bottom === "crash") {
    const hook = 4, main = Math.min(W * 0.85, W - hook - 1), side = W * 0.5, backD = W * 0.6;
    const L0 = front.w;
    // الأشكال معرّفة بالبعد عن المفصل (v) ثم تُحوَّل إلى إحداثيات اللوح السفلي (المفصل أعلاه)
    const fromHinge = (pts: [number, number][], h: number): Pt[] => pts.map(([x, v]) => [x, h - v] as Pt);
    const hm = main + hook;
    front.hinges.push(H("bottom", { id: "lock-main", w: L0, h: hm, kind: "flap", outline: fromHinge([[0, 0], [L0, 0], [L0, main - 4], [L0 - 4, main], [L0 / 2 + 6, main], [L0 / 2 + 6, hm], [L0 / 2 - 6, hm], [L0 / 2 - 6, main], [4, main], [0, main - 4]], hm), hinges: [] }, 90, 2));
    back.hinges.push(H("bottom", { id: "lock-back", w: back.w, h: backD, kind: "glue", outline: fromHinge([[0, 0], [back.w, 0], [back.w, backD], [back.w / 2, backD]], backD), hinges: [] }, 90, 2));
    for (const sp of sidePanels) sp.hinges.push(H("bottom", { id: `${sp.id}-lock`, w: sp.w, h: side, kind: "flap", outline: fromHinge([[0, 0], [sp.w, 0], [sp.w - 2, side], [2, side * 0.4]], side), hinges: [] }, 90, 1));
  }
  // سقف جملوني: لوحان مائلان من الواجهة والخلف يلتقيان بمقبض قائم، ومثلثان من الجانبين
  if (o.top === "gable") {
    const roof = Math.hypot(W / 2, W * 0.35), hand = 24;
    for (const p of [front, back]) {
      const r: Panel = { id: `${p.id}-roof`, w: p.w, h: roof, face: p === front ? "top" : undefined, kind: "flap", outline: [[0, 0], [p.w, 0], [p.w - 4, roof], [4, roof]], hinges: [] };
      // المقبض يعود إلى الرأسي فوق قمّة السقف المائل (35°)
      r.hinges.push(H("top", { id: `${p.id}-grip`, w: p.w - 8, h: hand, kind: "flap", holes: [handHole((p.w - 8) / 2, hand * 0.55, Math.min(50, p.w * 0.5), 12)], hinges: [] }, -55, 3, { at: 4, openTo: -55 }));
      p.hinges.push(H("top", r, 55, 2, { openTo: 0 }));
    }
    for (const sp of sidePanels) sp.hinges.push(H("top", { id: `${sp.id}-gable`, w: sp.w, h: W * 0.35, kind: "flap", outline: [[0, 0], [sp.w, 0], [sp.w / 2, W * 0.35]], hinges: [] }, 90, 1));
  }
  // لسان تعليق أو مقبض حمل يعلو اللوح الخالي من الغطاء
  if (o.hang || o.top === "handle") {
    const p = o.top === "handle" ? otherPanel : otherPanel;
    const tabH = o.top === "handle" ? 40 : HANG_TAB;
    const tab: Panel = {
      id: o.top === "handle" ? "carry-tab" : "hang-tab",
      w: p.w,
      h: tabH,
      kind: "flap",
      outline: [[0, 0], [p.w, 0], [p.w, tabH - 6], ...arc(p.w - 6, tabH - 6, 6, 0, Math.PI / 2, 6).slice(1), [6, tabH], ...arc(6, tabH - 6, 6, Math.PI / 2, Math.PI, 6).slice(1)],
      holes: [o.top === "handle" ? handHole(p.w / 2, tabH * 0.5, Math.min(60, p.w * 0.6), 14) : euroHole(p.w / 2, tabH / 2)],
      hinges: [],
    };
    p.hinges.push(H("top", tab, 0, 0));
  }
  // المقاس الخارجي: مستطيل أو حدود المضلّع
  let outer: BoxSpec["outer"];
  // الكرتون المضلّع السميك تُطوى جدرانه داخل المقاس الاسمي فيزيد الخارجي بسماكة واحدة
  const wall = t > 1 ? t : 2 * t;
  if (n === 4) outer = { w: d.L + wall, d: d.W + wall, h: Hh + wall };
  else {
    const g = ngon(n, S, true);
    const xs = g.outline.map((p) => p[0]);
    outer = { w: Math.max(...xs) - Math.min(...xs) + 2 * t, d: g.h + 2 * t, h: Hh + 2 * t };
  }
  if (o.hang) outer = { ...outer, h: outer.h + HANG_TAB };
  if (o.top === "handle") outer = { ...outer, h: outer.h + 40 };
  if (o.top === "gable") outer = { ...outer, h: Hh + 2 * t + W * 0.35 + 24 };
  if (o.top === "none" && o.bottom === "none") outer = { ...outer, h: Hh };
  const cx = n === 4 ? d.L / 2 : S / 2;
  const depth = n === 4 ? d.W : ngon(n, S, true).h;
  const piece: Piece = {
    id: "carton",
    name: o.pieceName ?? { ar: "العلبة", en: "Carton" },
    root: front,
    mode: "fold",
    pose: (f, op) => {
      const k = smooth(Math.max(0, (f - 0.82) / 0.18));
      // الغلاف المفتوح: الفتح يرفعه ويميله كما يُسحب عن العلبة الداخلية
      const lift = o.top === "none" && o.bottom === "none" ? op * Hh * 0.35 : 0;
      return { pos: [-cx, lift, (depth / 2) * k], rot: [(Math.PI / 2) * (1 - k), 0, o.top === "none" && o.bottom === "none" ? -op * 0.22 : 0] };
    },
  };
  return { pieces: [piece], outer, stages: 0, t };
}

// ── علبة داخلية بغلاف خارجي: قطعتان
function bookSleeve(d: BoxDesign): BoxSpec {
  const inner = carton(d, { top: "tuck", bottom: "tuck", tuckOn: "back", pieceName: { ar: "العلبة الداخلية", en: "Inner box" } });
  const t = inner.t;
  const Ls = d.L + 2 * t + 1, Ws = d.W + 2 * t + 1;
  const sl = carton({ ...d, L: Ls, W: Ws, H: d.H + 2 * t - 2 }, { top: "none", bottom: "none", notch: true, pieceName: { ar: "الغلاف الخارجي", en: "Outer sleeve" } });
  const slPiece = sl.pieces[0];
  slPiece.id = "outer-sleeve";
  slPiece.root.id = "sleeve-front";
  const walk = (p: Panel) => {
    if (p.id !== "sleeve-front") p.id = `sl-${p.id}`;
    p.hinges.forEach((h) => walk(h.child));
  };
  walk(slPiece.root);
  const Hs = d.H + 2 * t - 2;
  slPiece.pose = (f, op) => {
    const k = smooth(Math.max(0, (f - 0.82) / 0.18));
    return { pos: [-Ls / 2, 1 + op * (d.H * 0.8), (Ws / 2) * k], rot: [(Math.PI / 2) * (1 - k), 0, 0] };
  };
  void Hs;
  return { pieces: [inner.pieces[0], slPiece], outer: { w: Ls + 2 * t, d: Ws + 2 * t, h: d.H + 2 * t }, stages: 0, t };
}

/** صينية: قاعدة وأربعة جدران مع ألسنة الزوايا. root.x = العرض، root.y = العمق */
function tray(id: string, Lx: number, Wy: number, Hz: number, t: number, faces: Partial<Record<"front" | "back" | "left" | "right" | "base", { face: Face; rot?: Panel["rot"] }>> = {}, notch = 0, holes?: Pt[][]): Panel {
  const tab = Math.min(14, Hz * 0.4, Wy * 0.3);
  const inset = t + 0.15;
  const tabs = (p: string, horizontal: boolean): Hinge[] =>
    horizontal
      ? [H("left", flap(`${p}-tab-l`, "left", Hz, tab, "taper", { kind: "glue", inset }), 90, 1), H("right", flap(`${p}-tab-r`, "right", Hz, tab, "taper", { kind: "glue", inset }), 90, 1)]
      : [];
  const front: Panel = { id: `${id}-front`, w: Lx, h: Hz, ...faces.front, hinges: tabs(`${id}-front`, true) };
  if (notch > 0) {
    const r = notch;
    front.outline = [[0, 0], [Lx, 0], [Lx, Hz], [Lx / 2 + r, Hz], ...arc(Lx / 2, Hz, r, 0, -Math.PI, 12).slice(1, -1), [Lx / 2 - r, Hz], [0, Hz]];
  }
  return {
    id: `${id}-base`,
    w: Lx,
    h: Wy,
    ...faces.base,
    holes,
    hinges: [
      H("top", front, 90, 0),
      H("bottom", { id: `${id}-back`, w: Lx, h: Hz, ...faces.back, hinges: tabs(`${id}-back`, true) }, 90, 0),
      H("left", { id: `${id}-left`, w: Hz, h: Wy, ...faces.left, hinges: [] }, 90, 0),
      H("right", { id: `${id}-right`, w: Hz, h: Wy, ...faces.right, hinges: [] }, 90, 0),
    ],
  };
}

// صينية القاعدة (مفتوحة للأعلى): R_x(+90°) — الجدار العلوي في المخطط يصبح الأمامي
const upTray = (Lx: number, Wy: number, y = 0): Pose => ({ pos: [-Lx / 2, y, -Wy / 2], rot: [Math.PI / 2, 0, 0] });

// ── العائلة الصلبة: قاعدة (+ عنق) وغطاء منفصل أو متصل
interface RigidOpts {
  lid: "shallow" | "full" | "hinged" | "clamshell";
  neck?: boolean;
  lidWindow?: boolean;
}
function rigidBox(d: BoxDesign, o: RigidOpts): BoxSpec {
  const t = THICKNESS[d.style];
  const Lb = d.L + 2 * t, Wb = d.W + 2 * t, Hb = d.H + t;
  const neckH = o.neck ? SHOULDER_NECK : 0;
  const Ln = Lb - 2 * t - 1, Wn = Wb - 2 * t - 1, Hn = Hb + neckH;
  const top = Hb + neckH; // ارتفاع ما يستقر عليه الغطاء
  const pieces: Piece[] = [{ id: "base", name: { ar: "القاعدة", en: "Base" }, root: tray("base", Lb, Wb, Hb, t), mode: "fold", pose: () => upTray(Lb, Wb) }];
  if (o.neck) pieces.push({ id: "neck", name: { ar: "العنق", en: "Neck" }, root: tray("neck", Ln, Wn, Hn, t), mode: "fold", pose: (f) => upTray(Ln, Wn, t + (1 - smooth(Math.max(0, (f - 0.5) / 0.3))) * 20) });
  let outer: BoxSpec["outer"];
  if (o.lid === "shallow" || o.lid === "full") {
    const Ll = Lb + 2 * t + 1, Wl = Wb + 2 * t + 1;
    const Hl = o.lid === "full" ? Hb - neckH * 0 : Math.round(Math.min(Math.max(d.H * 0.3, 18), 50));
    const lidHoles = o.lidWindow ? [windowHole(Ll, Wl).map(([x, y]) => [x, y] as Pt)] : undefined;
    const lid = tray("lid", Ll, Wl, Hl, t, { base: { face: "top" }, back: { face: "front" } }, 0, lidHoles);
    pieces.push({
      id: "lid",
      name: { ar: "الغطاء", en: "Lid" },
      root: lid,
      mode: "fold",
      pose: (f, op) => {
        const drop = smooth(Math.max(0, (f - 0.6) / 0.4));
        const lift = (1 - drop) * (top + 30) + op * (Hl + 20);
        return { pos: [-Ll / 2 + op * Lb * 0.62, top + t + lift, Wl / 2], rot: [-Math.PI / 2, 0, -op * 0.18], order: "XYZ" };
      },
    });
    outer = { w: Ll, d: Wl, h: top + t };
  } else {
    // غطاء متصل بظهر القاعدة: المغناطيسية بشفة قصيرة، والصدفية بشفة بعمق القاعدة
    const Lc = Lb + 1, Wc = Wb + 2 * t + 1, Hc = top + t;
    const Hf = o.lid === "clamshell" ? Hc - 2 : Math.round(Math.min(Math.max(Hb * 0.45, 20), Hb - 4));
    const cover: Panel = {
      id: "cover-back",
      w: Lc,
      h: Hc,
      face: "back",
      hinges: [H("top", { id: "cover-top", w: Lc, h: Wc, face: "top", rot: 180, hinges: [H("top", { id: "cover-flap", w: Lc, h: Hf, face: "front", rot: 180, band: o.lid !== "clamshell", hinges: [] }, 90, 1, { openTo: 25 })] }, 90, 0, { openTo: -20 })],
    };
    pieces.push({ id: "cover", name: { ar: "الغطاء المتصل", en: "Hinged cover" }, root: cover, mode: "fold", pose: () => ({ pos: [Lc / 2, 0, -Wb / 2 - t - 0.3], rot: [0, Math.PI, 0] }) });
    outer = { w: Lc, d: Wb + t + 0.3, h: Hc };
  }
  return { pieces, outer, stages: 0, t };
}

// ── الدرج: صينية (أو صينيتان) تنزلق في غلاف
function drawerBox(d: BoxDesign, o: { window?: boolean; double?: boolean }): BoxSpec {
  const t = THICKNESS[d.style];
  const Lt = d.L + 2 * t, Wt = d.W + 2 * t, Ht = d.H + t;
  const count = o.double ? 2 : 1;
  const Ls = Lt + 1, Ws = Wt + 2 * t + 1, Hs = count * Ht + 2 * t + 1 + (count - 1) * t;
  const glue = 12;
  const inset = t + 0.12;
  const sleeve: Panel = {
    id: "sleeve-top",
    w: Ws,
    h: Ls,
    face: "top",
    rot: 270,
    holes: o.window ? [windowHole(Ws, Ls)] : undefined,
    hinges: [
      H("right", {
        id: "sleeve-side-r",
        w: Hs,
        h: Ls,
        face: "right",
        rot: 270,
        hinges: [H("right", { id: "sleeve-bottom", w: Ws, h: Ls, face: "bottom", hinges: [H("right", { id: "sleeve-side-l", w: Hs, h: Ls, face: "left", rot: 270, hinges: [H("right", flap("sleeve-glue", "right", Ls, glue, "taper", { kind: "glue", inset }), 90, 0)] }, 90, 0)] }, 90, 0)],
      }, 90, 0),
    ],
  };
  const pieces: Piece[] = [{ id: "sleeve", name: { ar: "الغلاف", en: "Sleeve" }, root: sleeve, mode: "fold", pose: () => ({ pos: [Ls / 2, Hs, Ws / 2], rot: [-Math.PI / 2, Math.PI / 2, 0], order: "YXZ" }) }];
  for (let i = 0; i < count; i++) {
    const trayPanel = tray(count > 1 ? `tray${i + 1}` : "tray", Wt, Lt, Ht, t, {}, Math.min(11, Ht * 0.45, Wt * 0.2));
    pieces.push({
      id: count > 1 ? `tray${i + 1}` : "tray",
      name: count > 1 ? { ar: `الدرج ${i + 1}`, en: `Drawer ${i + 1}` } : { ar: "الدرج", en: "Tray" },
      root: trayPanel,
      mode: "fold",
      pose: (f, op) => {
        const out = (1 - smooth(Math.max(0, (f - 0.55) / 0.45))) * (Ls + 15) + op * Lt * (i === 0 ? 0.62 : 0.3);
        return { pos: [-Lt / 2 + out, t + 0.5 + i * (Ht + t), Wt / 2], rot: [Math.PI / 2, Math.PI / 2, 0], order: "YXZ" };
      },
    });
  }
  return { pieces, outer: { w: Ls, d: Ws, h: Hs }, stages: 0, t };
}

// ── الأسطوانة: جسم ملفوف وغطاء بنسبة ارتفاع
function tubeBox(d: BoxDesign, lidRatio: number): BoxSpec {
  const t = THICKNESS[d.style];
  const D = Math.max(d.L, d.W) + 2 * t;
  const Hb = d.H + t;
  const Dl = D + 2 * t + 0.6;
  const Hl = Math.round(Math.min(Math.max(d.H * lidRatio, 25), lidRatio > 0.4 ? 200 : 60));
  const overlap = 10;
  const wrapPanel = (id: string, dia: number, h: number, face: Face, band = false): Panel => {
    const c = Math.PI * dia;
    return { id, w: c, h, face, band, contentW: dia * 0.95, hinges: [H("right", { id: `${id}-glue`, w: overlap, h, kind: "glue", hinges: [] }, 0, 0, { crease: false })] };
  };
  const disc = (id: string, dia: number, face?: Face): Panel => ({ id, w: dia, h: dia, face, outline: arc(dia / 2, dia / 2, dia / 2, 0, Math.PI * 2, 72).slice(0, -1), hinges: [] });
  const rise = (f: number) => smooth(Math.max(0, (f - 0.75) / 0.25));
  return {
    pieces: [
      { id: "tube-body", name: { ar: "جسم الأسطوانة", en: "Tube body" }, root: wrapPanel("tube-body", D, Hb, "front"), mode: "wrap", wrap: { d: D, h: Hb, overlap }, pose: () => ({ pos: [0, 0, 0], rot: [0, 0, 0] }) },
      { id: "tube-lid", name: { ar: "الغطاء", en: "Lid" }, root: wrapPanel("tube-lid", Dl, Hl, "front", lidRatio < 0.4), mode: "wrap", wrap: { d: Dl, h: Hl, overlap }, pose: (f, op) => ({ pos: [op * D * 0.9, Hb + t - Hl + (1 - rise(f)) * (Hl + 25) + op * (Hl * 0.9 + 15), 0], rot: [0, 0, -op * 0.25] }) },
      { id: "tube-floor", name: { ar: "القاع", en: "Base disc" }, root: disc("tube-floor", D), mode: "disc", pose: () => ({ pos: [0, 0, 0], rot: [Math.PI / 2, 0, 0] }) },
      { id: "tube-cap", name: { ar: "سقف الغطاء", en: "Lid disc" }, root: disc("tube-cap", Dl, "top"), mode: "disc", pose: (f, op) => ({ pos: [op * D * 0.9, Hb + t + (1 - rise(f)) * (Hl + 25) + op * (Hl * 0.9 + 15), 0], rot: [-Math.PI / 2, -op * 0.25, 0] }) },
    ],
    outer: { w: Dl, d: Dl, h: Hb + t },
    stages: 0,
    t,
  };
}

// ── صواني من كرتون مقوّى أو مضلّع: مفتوحة، بغطاء متصل، علبة شحن 0427، صينية عرض
function trayBox(d: BoxDesign, o: { lid?: "none" | "hinged" | "mailer"; header?: boolean; window?: boolean }): BoxSpec {
  const t = THICKNESS[d.style];
  const Lb = d.L + 2 * t, Wb = d.W + 2 * t, Hb = d.H + t;
  const base = tray("base", Lb, Wb, Hb, t, { front: { face: "front" } });
  const backWall = base.hinges.find((h) => h.child.id === "base-back")!.child;
  const frontWall = base.hinges.find((h) => h.child.id === "base-front")!.child;
  frontWall.face = "front";
  let outerH = Hb + t;
  if (o.header) {
    // لوح العرض يكمل الجدار الخلفي إلى الأعلى
    const header = Math.max(40, Math.round(d.H * 1.2));
    backWall.hinges.push(H("bottom", { id: "header", w: Lb, h: header, face: "front", hinges: [] }, 0, 0));
    backWall.face = undefined;
    outerH += header;
  }
  if (o.lid === "hinged" || o.lid === "mailer") {
    // الغطاء من الجدار الخلفي فوق الفتحة، ثم شفة أمامية تُدسّ أو تُغلق
    const lipH = o.lid === "mailer" ? Hb - t : Math.max(12, Math.round(Hb * 0.6));
    const lid: Panel = { id: "lid", w: Lb, h: Wb + t, face: "top", holes: o.window ? [windowHole(Lb, Wb + t)] : undefined, hinges: [] };
    lid.hinges.push(H("bottom", { id: "lid-lip", w: Lb, h: lipH, face: "front", band: o.lid === "hinged", hinges: [] }, 90, 2, { openTo: 0 }));
    if (o.lid === "mailer") {
      lid.hinges.push(H("left", flap("lid-ear-l", "left", Wb + t, Hb - t, "taper", { inset: t + 0.15 }), 90, 2));
      lid.hinges.push(H("right", flap("lid-ear-r", "right", Wb + t, Hb - t, "taper", { inset: t + 0.15 }), 90, 2));
    }
    backWall.hinges.push(H("bottom", lid, 90, 1, { openTo: -15 }));
    backWall.face = "back";
  }
  return {
    pieces: [{ id: "tray", name: o.lid && o.lid !== "none" ? { ar: "العلبة", en: "Box" } : { ar: "الصينية", en: "Tray" }, root: base, mode: "fold", pose: (f, op) => (o.lid && o.lid !== "none" ? upTray(Lb, Wb) : { ...upTray(Lb, Wb), rot: [Math.PI / 2 - op * 0.35, 0, 0] as [number, number, number] }) }],
    outer: { w: Lb, d: Wb, h: outerH },
    stages: 0,
    t,
  };
}

const BUILDERS: Record<BoxDesign["style"], (d: BoxDesign) => BoxSpec> = {
  tuck: (d) => carton(d, { top: "tuck", bottom: "tuck", tuckOn: "back" }),
  ste: (d) => carton(d, { top: "tuck", bottom: "tuck", tuckOn: "front" }),
  window: (d) => carton(d, { top: "tuck", bottom: "tuck", tuckOn: "back", windows: ["front"] }),
  doubleWindow: (d) => carton(d, { top: "tuck", bottom: "tuck", tuckOn: "back", windows: ["front", "back"] }),
  hang: (d) => carton(d, { top: "tuck", bottom: "tuck", tuckOn: "back", hang: true }),
  hangWindow: (d) => carton(d, { top: "tuck", bottom: "tuck", tuckOn: "back", hang: true, windows: ["front"] }),
  sleeve: (d) => carton(d, { top: "none", bottom: "none", notch: true, pieceName: { ar: "الغلاف", en: "Sleeve" } }),
  sleeveWindow: (d) => carton(d, { top: "none", bottom: "none", notch: true, windows: ["front"], pieceName: { ar: "الغلاف", en: "Sleeve" } }),
  band: (d) => carton(d, { top: "none", bottom: "none", pieceName: { ar: "الحزام", en: "Band" } }),
  sealEnd: (d) => carton(d, { top: "seal", bottom: "seal" }),
  fullOverlap: (d) => carton(d, { top: "seal", bottom: "seal", sealDepth: 1 }),
  crash: (d) => carton(d, { top: "tuck", bottom: "crash", tuckOn: "back" }),
  gable: (d) => carton(d, { top: "gable", bottom: "tuck" }),
  handle: (d) => carton(d, { top: "handle", bottom: "tuck", tuckOn: "back" }),
  cube: (d) => carton(d, { top: "tuck", bottom: "tuck", tuckOn: "back" }),
  tuckTray: (d) => trayBox(d, { lid: "none" }),
  foldTray: (d) => trayBox(d, { lid: "hinged" }),
  bookSleeve,
  hexagon: (d) => carton(d, { n: 6, top: "tuck", bottom: "tuck" }),
  hexWindow: (d) => carton(d, { n: 6, top: "tuck", bottom: "tuck", windows: ["front"] }),
  octagon: (d) => carton(d, { n: 8, top: "tuck", bottom: "tuck" }),
  pentagon: (d) => carton(d, { n: 5, top: "tuck", bottom: "tuck" }),
  triangle: (d) => carton(d, { n: 3, top: "tuck", bottom: "tuck" }),
  rigid: (d) => rigidBox(d, { lid: "shallow" }),
  telescope: (d) => rigidBox(d, { lid: "full" }),
  magnetic: (d) => rigidBox(d, { lid: "hinged" }),
  clamshell: (d) => rigidBox(d, { lid: "clamshell" }),
  shoulder: (d) => rigidBox(d, { lid: "shallow", neck: true }),
  neckMagnetic: (d) => rigidBox(d, { lid: "hinged", neck: true }),
  rigidWindow: (d) => rigidBox(d, { lid: "shallow", lidWindow: true }),
  discovery: (d) => rigidBox(d, { lid: "shallow" }),
  drawer: (d) => drawerBox(d, {}),
  drawerWindow: (d) => drawerBox(d, { window: true }),
  rigidDrawer: (d) => drawerBox(d, {}),
  doubleDrawer: (d) => drawerBox(d, { double: true }),
  tube: (d) => tubeBox(d, 0.35),
  tubeTele: (d) => tubeBox(d, 0.5),
  mailer: (d) => trayBox(d, { lid: "mailer" }),
  mailerWindow: (d) => trayBox(d, { lid: "mailer", window: true }),
  rsc: (d) => carton(d, { top: "seal", bottom: "seal", sealDepth: 0.5 }),
  display: (d) => trayBox(d, { lid: "none", header: true }),
};

export function buildSpec(d: BoxDesign): BoxSpec {
  const spec = (BUILDERS[d.style] ?? BUILDERS.tuck)(d);
  // عدد المراحل من الشجرة نفسها: أعلى مرحلة + 1 (رقم يدوي ينسى لساناً فلا يُطوى)
  let max = 0;
  const walk = (p: Panel) => p.hinges.forEach((h) => {
    max = Math.max(max, h.stage);
    walk(h.child);
  });
  spec.pieces.forEach((pc) => walk(pc.root));
  return { ...spec, stages: max + 1 };
}

/** زاوية المفصل لنسبة طي f (0 مسطّح – 1 مغلق) وفتح o */
export function hingeAngle(h: Hinge, f: number, o: number, stages: number) {
  const local = smooth(f * stages - h.stage);
  const closed = h.fold * local;
  if (h.openTo === undefined || o <= 0) return closed;
  return closed + (h.openTo - closed) * smooth(o);
}

// ── التسطيح: مواضع الألواح في المخطط

export interface FlatPanel {
  id: string;
  piece: string;
  x: number;
  y: number;
  w: number;
  h: number;
  poly: Pt[];
  face?: Face;
  rot: number;
  kind: "panel" | "glue" | "flap";
  contentW?: number;
  band?: boolean;
  /** فتحات اللوح بإحداثيات المخطط */
  holes?: Pt[][];
}
export interface Seg {
  a: Pt;
  b: Pt;
}
export interface Flat {
  panels: FlatPanel[];
  cuts: Seg[];
  folds: Seg[];
  /** حدود لصق (ليست خطوط طي) */
  glueEdges: Seg[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

function childOrigin(parent: Panel, h: Hinge): Pt {
  const c = h.child;
  switch (h.edge) {
    case "right":
      return [parent.w, h.at];
    case "left":
      return [-c.w, h.at];
    case "top":
      return [h.at, parent.h];
    case "bottom":
      return [h.at, -c.h];
  }
}

function hingeSeg(parent: Panel, h: Hinge, ox: number, oy: number): Seg {
  const c = h.child;
  switch (h.edge) {
    case "right":
      return { a: [ox + parent.w, oy + h.at], b: [ox + parent.w, oy + h.at + c.h] };
    case "left":
      return { a: [ox, oy + h.at], b: [ox, oy + h.at + c.h] };
    case "top":
      return { a: [ox + h.at, oy + parent.h], b: [ox + h.at + c.w, oy + parent.h] };
    case "bottom":
      return { a: [ox + h.at, oy], b: [ox + h.at + c.w, oy] };
  }
}

export const outlineOf = (p: Panel): Pt[] => p.outline ?? [[0, 0], [p.w, 0], [p.w, p.h], [0, p.h]];

/** يطرح مقاطع الطي من حواف الألواح فيبقى خط القص */
function subtract(seg: Seg, holes: Seg[]): Seg[] {
  const [ax, ay] = seg.a, [bx, by] = seg.b;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-8) return [];
  let spans: [number, number][] = [[0, 1]];
  for (const h of holes) {
    // على الخط نفسه فقط
    const c1 = dx * (h.a[1] - ay) - dy * (h.a[0] - ax);
    const c2 = dx * (h.b[1] - ay) - dy * (h.b[0] - ax);
    if (Math.abs(c1) > 1e-3 * Math.sqrt(len2) || Math.abs(c2) > 1e-3 * Math.sqrt(len2)) continue;
    let t1 = ((h.a[0] - ax) * dx + (h.a[1] - ay) * dy) / len2;
    let t2 = ((h.b[0] - ax) * dx + (h.b[1] - ay) * dy) / len2;
    if (t1 > t2) [t1, t2] = [t2, t1];
    spans = spans.flatMap(([s, e]) => {
      if (t2 <= s + 1e-6 || t1 >= e - 1e-6) return [[s, e] as [number, number]];
      const out: [number, number][] = [];
      if (t1 > s) out.push([s, t1]);
      if (t2 < e) out.push([t2, e]);
      return out;
    });
  }
  return spans.filter(([s, e]) => (e - s) * Math.sqrt(len2) > 0.01).map(([s, e]) => ({ a: [ax + dx * s, ay + dy * s], b: [ax + dx * e, ay + dy * e] }));
}

const key = (s: Seg) => {
  const r = (n: number) => Math.round(n * 100);
  const a = `${r(s.a[0])},${r(s.a[1])}`, b = `${r(s.b[0])},${r(s.b[1])}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
};

export const PIECE_GAP = 14;

export function flatten(spec: BoxSpec): Flat {
  const panels: FlatPanel[] = [];
  const folds: Seg[] = [];
  const glueEdges: Seg[] = [];
  const edges: Seg[] = [];
  let cursor = 0;
  for (const piece of spec.pieces) {
    const local: FlatPanel[] = [];
    const lf: Seg[] = [], lg: Seg[] = [];
    const walk = (p: Panel, ox: number, oy: number) => {
      const poly = outlineOf(p).map(([x, y]) => [ox + x, oy + y] as Pt);
      local.push({ id: p.id, piece: piece.id, x: ox, y: oy, w: p.w, h: p.h, poly, face: p.face, rot: p.rot ?? 0, kind: p.kind ?? "panel", contentW: p.contentW, band: p.band, holes: p.holes?.map((hole) => hole.map(([x, y]) => [ox + x, oy + y] as Pt)) });
      for (const h of p.hinges) {
        (h.crease === false ? lg : lf).push(hingeSeg(p, h, ox, oy));
        const [cx, cy] = childOrigin(p, h);
        walk(h.child, ox + cx, oy + cy);
      }
    };
    walk(piece.root, 0, 0);
    // كل قطعة بجانب سابقتها، بمحاذاة الأسفل
    let minX = Infinity, minY = Infinity, maxX = -Infinity;
    for (const fp of local) for (const [x, y] of fp.poly) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
    }
    const dx = cursor - minX, dy = -minY;
    const mv = ([x, y]: Pt): Pt => [x + dx, y + dy];
    for (const fp of local) {
      fp.x += dx;
      fp.y += dy;
      fp.poly = fp.poly.map(mv);
      panels.push(fp);
      fp.poly.forEach((a, i) => edges.push({ a, b: fp.poly[(i + 1) % fp.poly.length] }));
      // حواف الفتحات خطوط قص أيضاً
      if (fp.holes) {
        fp.holes = fp.holes.map((hole) => hole.map(mv));
        for (const hole of fp.holes) hole.forEach((a, i) => edges.push({ a, b: hole[(i + 1) % hole.length] }));
      }
    }
    lf.forEach((s) => folds.push({ a: mv(s.a), b: mv(s.b) }));
    lg.forEach((s) => glueEdges.push({ a: mv(s.a), b: mv(s.b) }));
    cursor += maxX - minX + PIECE_GAP;
  }
  const holes = [...folds, ...glueEdges];
  const seen = new Set<string>();
  const cuts: Seg[] = [];
  for (const e of edges) {
    for (const s of subtract(e, holes)) {
      const k = key(s);
      if (seen.has(k)) continue;
      seen.add(k);
      cuts.push(s);
    }
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of panels) for (const [x, y] of p.poly) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { panels, cuts, folds, glueEdges, bounds: { minX, minY, maxX, maxY } };
}

export const segLen = (s: Seg) => Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);

export function polyArea(p: Pt[]) {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}
