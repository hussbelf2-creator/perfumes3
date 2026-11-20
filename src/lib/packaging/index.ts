import type { Bi } from "@/i18n/context";
import type { Fit } from "@/studio/spec";
import { THICKNESS, WRAPPED, boardColor, type BoxDesign, type BoxStyle } from "@/studio/box/types";
import DielinesLib from "./dielines.cjs";
import Models3DLib from "./models3d.cjs";
import { EXTRA_GENERATORS, EXTRA_MODELS, EXTRA_TYPES } from "./extra";

// مكتبة هياكل التغليف (ECMA / FEFCO): قوالب قصّ بارامترية SVG وأشجار ألواح للمعاينة المجسّمة.
// الملفان dielines.cjs وmodels3d.cjs منقولان كما هما (بلا تبعيات) ولا يُعدَّلان هنا؛
// هذا الملف يضيف الأنواع، والبيانات الوصفية بالعربية، والربط بتصميم العلبة في الاستوديو.

export type StructureType = "ste" | "rte" | "window" | "crashLock" | "sleeve" | "rigidTray" | "rigidLid" | "rigidSet" | "insert" | "pillow" | "hexagon" | "mailer" | "drawer" | "sealEnd" | "hangTab" | "rsc" | "hingedLid" | "shoulder" | "tube" | "vialCard" | "giftBag" | "display";
export type ParamKey = "L" | "W" | "H" | "clearance" | "bottleW" | "bottleD" | "Wp" | "Hp" | "S" | "D" | "lidH" | "neck" | "N" | "vialD" | "G" | "header";
export type StructureParams = Partial<Record<ParamKey, number>>;

export interface BoxStructure {
  type: StructureType;
  params: StructureParams;
  /** سماكة الخامة بالمليمتر */
  t: number;
}

export interface Panel3D {
  id: string;
  w: number;
  h: number;
  role: string;
  hex?: boolean;
  /** مضلّع منتظم بهذا العدد من الأضلاع (أقراص الأسطوانة)؛ ضلعه السفلي على الحافة من 0 إلى w */
  poly?: number;
  holes: ({ type: "circle"; x: number; y: number; d: number } | { type: "rect"; x: number; y: number; w: number; h: number; r?: number })[];
  children: { edge: "left" | "right" | "top" | "bottom"; angle: number; panel: Panel3D }[];
}
export interface Model3D {
  parts: { root: Panel3D; position: [number, number, number]; rotation?: [number, number, number] }[];
  note?: string;
}

interface DielinesApi {
  generate: (type: string, params?: Record<string, number | boolean>) => string;
  TYPES: Record<string, string>;
  PRESETS: Record<string, { label: string } & Record<string, unknown>>;
}
interface Models3DApi {
  build: (type: string, params?: Record<string, number | boolean>) => Model3D;
  TYPES: string[];
}

const libD = DielinesLib as unknown as DielinesApi;
const libM = Models3DLib as unknown as Models3DApi;
/** المكتبة المنقولة + هياكل المشروع الإضافية بواجهة واحدة */
export const Dielines: DielinesApi = {
  generate: (type, params = {}) => (EXTRA_GENERATORS[type] ? EXTRA_GENERATORS[type](params as Record<string, number>) : libD.generate(type, params)),
  TYPES: { ...libD.TYPES, ...EXTRA_TYPES },
  PRESETS: libD.PRESETS,
};
export const Models3D: Models3DApi = {
  build: (type, params = {}) => (EXTRA_MODELS[type] ? EXTRA_MODELS[type](params as Record<string, number>) : libM.build(type, params)),
  TYPES: [...libM.TYPES, ...Object.keys(EXTRA_MODELS)],
};

export type StructureGroup = "folding" | "rigid" | "insert" | "special" | "retail";

export interface StructureMeta {
  id: StructureType;
  name: Bi;
  note: Bi;
  /** المرجع الصناعي */
  code: string;
  group: StructureGroup;
  icon: string;
  fields: ParamKey[];
  /** يُصدَّر قالبه الثنائي مباشرة (rigidSet يُركَّب من ثلاث قطع) */
  svg: boolean;
}

export const STRUCTURE_GROUPS: { id: StructureGroup; name: Bi }[] = [
  { id: "folding", name: { ar: "علب مطوية (كرتون مصقول)", en: "Folding cartons" } },
  { id: "rigid", name: { ar: "علب صلبة ودرج", en: "Rigid boxes & drawers" } },
  { id: "insert", name: { ar: "حشوات داخلية", en: "Inserts" } },
  { id: "special", name: { ar: "أشكال خاصة وشحن", en: "Special shapes & shipping" } },
  { id: "retail", name: { ar: "عرض وبيع وهدايا", en: "Retail, display & gifting" } },
];

export const STRUCTURES: StructureMeta[] = [
  { id: "ste", name: { ar: "STE — لسانان بجهة واحدة", en: "STE — straight tuck" }, note: { ar: "القياسية للعطور — يُفتح من الأعلى وينغلق من الأسفل بالاتجاه نفسه", en: "The perfume standard — top and bottom tuck the same way" }, code: "ECMA A20.20.03", group: "folding", icon: "ri-box-3-line", fields: ["L", "W", "H"], svg: true },
  { id: "rte", name: { ar: "RTE — لسانان متعاكسان", en: "RTE — reverse tuck" }, note: { ar: "اللسان العلوي والسفلي متعاكسان — أسرع تعبئة على الخط", en: "Top and bottom tuck opposite ways — faster on the line" }, code: "ECMA A20.20.03 (R)", group: "folding", icon: "ri-box-2-line", fields: ["L", "W", "H"], svg: true },
  { id: "window", name: { ar: "علبة بنافذة", en: "Window box" }, note: { ar: "فتحة عرض على الواجهة لإظهار الزجاجة", en: "Front window to show the bottle" }, code: "ECMA A20 + window", group: "folding", icon: "ri-window-line", fields: ["L", "W", "H"], svg: true },
  { id: "crashLock", name: { ar: "قاعدة قفل ذاتي", en: "Crash lock bottom" }, note: { ar: "قاعدة 1-2-3 تُغلق بضغطة — للتعبئة السريعة", en: "1-2-3 base that snaps shut — for fast lines" }, code: "ECMA A60.20", group: "folding", icon: "ri-lock-2-line", fields: ["L", "W", "H"], svg: true },
  { id: "sleeve", name: { ar: "غلاف منزلق", en: "Sleeve" }, note: { ar: "يلتف حول علبة داخلية أو صينية", en: "Wraps an inner box or tray" }, code: "ECMA B10", group: "folding", icon: "ri-layout-row-line", fields: ["L", "W", "H"], svg: true },
  { id: "rigidTray", name: { ar: "قاعدة صلبة", en: "Rigid base" }, note: { ar: "صينية بزوايا غراء لعلبة صلبة", en: "Glue-corner tray for a rigid box" }, code: "Rigid tray", group: "rigid", icon: "ri-archive-line", fields: ["L", "W", "H"], svg: true },
  { id: "rigidLid", name: { ar: "غطاء صلب", en: "Rigid lid" }, note: { ar: "غطاؤها بخلوص للتغليف", en: "Its lid with wrap clearance" }, code: "Rigid lid", group: "rigid", icon: "ri-archive-2-line", fields: ["L", "W", "H", "clearance"], svg: true },
  { id: "rigidSet", name: { ar: "علبة صلبة كاملة + حشوة", en: "Rigid set + insert" }, note: { ar: "قاعدة وغطاء وحشوة بفتحة الزجاجة في مشهد واحد", en: "Base, lid and bottle insert together" }, code: "Rigid set", group: "rigid", icon: "ri-gift-line", fields: ["L", "W", "H", "clearance", "bottleW", "bottleD"], svg: true },
  { id: "drawer", name: { ar: "درج بغلاف (Drawer)", en: "Drawer tray + sleeve" }, note: { ar: "صينية تنزلق داخل غلاف", en: "Tray sliding inside a sleeve" }, code: "Drawer (tray + sleeve)", group: "rigid", icon: "ri-archive-drawer-line", fields: ["L", "W", "H"], svg: true },
  { id: "insert", name: { ar: "حشوة داخلية", en: "Insert" }, note: { ar: "منصة بفتحة الزجاجة تثبّتها داخل العلبة", en: "Platform with a bottle cut-out" }, code: "Platform insert", group: "insert", icon: "ri-layout-bottom-line", fields: ["L", "W", "H", "bottleW", "bottleD"], svg: true },
  { id: "pillow", name: { ar: "علبة وسادة", en: "Pillow box" }, note: { ar: "للعينات والهدايا الصغيرة", en: "For samples and small gifts" }, code: "ECMA F", group: "special", icon: "ri-capsule-line", fields: ["Wp", "Hp"], svg: true },
  { id: "hexagon", name: { ar: "علبة سداسية", en: "Hexagon box" }, note: { ar: "ست أوجه بغطاء مدسوس — مظهر فاخر", en: "Six faces with a tuck lid — premium look" }, code: "ECMA hexagonal", group: "special", icon: "ri-hexagon-line", fields: ["S", "H"], svg: true },
  { id: "mailer", name: { ar: "علبة شحن FEFCO 0427", en: "Mailer FEFCO 0427" }, note: { ar: "كرتون مضلّع بغطاء متصل — للشحن والأطقم", en: "Corrugated with a hinged lid — shipping & sets" }, code: "FEFCO 0427", group: "special", icon: "ri-truck-line", fields: ["L", "W", "H"], svg: true },
  // هياكل المشروع الإضافية (extra.ts)
  { id: "sealEnd", name: { ar: "Seal End — ألسنة غراء", en: "Seal end carton" }, note: { ar: "يُغلق بالغراء من الطرفين على خط التعبئة الآلي — للكميات الكبيرة", en: "Glued at both ends on an automatic line — for volume runs" }, code: "ECMA A20.21", group: "folding", icon: "ri-archive-stack-line", fields: ["L", "W", "H"], svg: true },
  { id: "hangTab", name: { ar: "علبة بلسان تعليق", en: "Hang-tab box" }, note: { ar: "STE بلسان وفتحة أوروبية للتعليق على الرف — للترافل والعينات", en: "STE with a Euro-slot tab for peg hooks — travel sizes & samples" }, code: "ECMA A20 + Euro slot", group: "folding", icon: "ri-bookmark-line", fields: ["L", "W", "H"], svg: true },
  { id: "hingedLid", name: { ar: "علبة صلبة مفصلية (غطاء كتاب)", en: "Hinged-lid rigid box" }, note: { ar: "القاعدة والغطاء قطعة واحدة بشفة مغناطيس — الأفخم للعطور", en: "Base and lid in one piece with a magnet lip — the premium perfume box" }, code: "Rigid hinged (magnetic)", group: "rigid", icon: "ri-magnet-line", fields: ["L", "W", "H"], svg: true },
  { id: "shoulder", name: { ar: "علبة صلبة بعنق", en: "Shoulder box" }, note: { ar: "عنق داخلي يظهر بين القاعدة والغطاء — طابع الدور الفرنسية", en: "An inner neck shows between base and lid — the French-house look" }, code: "Rigid shoulder / neck", group: "rigid", icon: "ri-stack-line", fields: ["L", "W", "H", "neck"], svg: true },
  { id: "tube", name: { ar: "تيوب ورقي بغطاء", en: "Paper tube" }, note: { ar: "جسم ملفوف بغطاء منزلق وقرصين — للعود والهدايا", en: "Wound body, slip lid and two discs — oud & gifting" }, code: "Paper tube", group: "special", icon: "ri-database-2-line", fields: ["D", "H", "lidH"], svg: true },
  { id: "rsc", name: { ar: "كرتون شحن FEFCO 0201", en: "Shipping carton FEFCO 0201" }, note: { ar: "الكرتون الرئيسي للتصدير: أربعة جدران وألسنة متقابلة", en: "The export master carton: four walls and meeting flaps" }, code: "FEFCO 0201", group: "special", icon: "ri-box-1-line", fields: ["L", "W", "H"], svg: true },
  { id: "vialCard", name: { ar: "بطاقة عينات", en: "Vial card" }, note: { ar: "بطاقة قائمة بشقوق تثبّت القوارير — لطقم الاكتشاف", en: "Standing card with slits that hold vials — discovery sets" }, code: "Vial card (tent)", group: "retail", icon: "ri-flask-line", fields: ["N", "vialD", "H"], svg: true },
  { id: "giftBag", name: { ar: "حقيبة هدايا ورقية", en: "Paper gift bag" }, note: { ar: "واجهتان وجانبان مطويان وقاعدة — بفتحتي مقبض", en: "Two faces, gusseted sides and a base — with handle holes" }, code: "Gusseted bag", group: "retail", icon: "ri-shopping-bag-3-line", fields: ["W", "G", "H"], svg: true },
  { id: "display", name: { ar: "صينية عرض بلوح خلفي", en: "Counter display tray" }, note: { ar: "صينية لعدة زجاجات بلوح مطبوع خلفها — لنقطة البيع", en: "A tray for several bottles with a printed header — point of sale" }, code: "Counter display", group: "retail", icon: "ri-store-2-line", fields: ["L", "W", "H", "header"], svg: true },
];

export const structureById = (id: string) => STRUCTURES.find((s) => s.id === id);
export const isStructureType = (id: unknown): id is StructureType => typeof id === "string" && !!structureById(id);

export const PARAM_LABELS: Record<ParamKey, Bi> = {
  L: { ar: "الطول", en: "Length" },
  W: { ar: "العمق", en: "Depth" },
  H: { ar: "الارتفاع", en: "Height" },
  clearance: { ar: "خلوص الغطاء", en: "Lid clearance" },
  bottleW: { ar: "عرض فتحة الزجاجة", en: "Bottle cut-out width" },
  bottleD: { ar: "عمق فتحة الزجاجة", en: "Bottle cut-out depth" },
  Wp: { ar: "عرض الوسادة", en: "Pillow width" },
  Hp: { ar: "طول الوسادة", en: "Pillow length" },
  S: { ar: "طول الضلع", en: "Side length" },
  D: { ar: "القطر", en: "Diameter" },
  lidH: { ar: "ارتفاع الغطاء", en: "Lid height" },
  neck: { ar: "ارتفاع العنق الظاهر", en: "Visible neck" },
  N: { ar: "عدد القوارير", en: "Vial count" },
  vialD: { ar: "قطر القارورة", en: "Vial diameter" },
  G: { ar: "عرض الجانب", en: "Gusset width" },
  header: { ar: "ارتفاع اللوح الخلفي", en: "Header height" },
};

/** خامات القالب في المصنع — تحدد اللون الخام والخشونة والسماكة الافتراضية في المعاينة */
export type StockId = "sbs" | "kraft" | "black" | "grey" | "corr";
export const STOCKS: Record<StockId, { name: Bi; base: string; rough: number; t: number }> = {
  sbs: { name: { ar: "كرتون مصقول SBS", en: "SBS folding board" }, base: "#f7f5f0", rough: 0.6, t: 0.5 },
  kraft: { name: { ar: "كرافت طبيعي", en: "Natural kraft" }, base: "#c9a76f", rough: 0.95, t: 0.6 },
  black: { name: { ar: "كرتون أسود", en: "Black board" }, base: "#1a1a1a", rough: 0.8, t: 0.6 },
  grey: { name: { ar: "كرتون رمادي صلب مغلّف", en: "Wrapped greyboard" }, base: "#f2efe9", rough: 0.6, t: 2 },
  corr: { name: { ar: "كرتون مضلّع E-flute", en: "E-flute corrugated" }, base: "#d9c29a", rough: 0.9, t: 1.6 },
};

export const PARAM_LIMITS = { min: 5, max: 600 };
export const T_LIMITS = { min: 0.3, max: 3 };

const DEF: Record<ParamKey, number> = { L: 52, W: 52, H: 125, clearance: 2.5, bottleW: 42, bottleD: 42, Wp: 60, Hp: 110, S: 30, D: 45, lidH: 25, neck: 12, N: 5, vialD: 12, G: 70, header: 70 };
const TDEF: Partial<Record<StructureType, StructureParams>> = {
  rigidTray: { L: 60, W: 60, H: 35 },
  rigidLid: { L: 60, W: 60, H: 22 },
  rigidSet: { L: 60, W: 60, H: 35 },
  drawer: { L: 60, W: 60, H: 30 },
  mailer: { L: 120, W: 80, H: 40 },
  insert: { L: 59, W: 59, H: 22 },
  hingedLid: { L: 60, W: 60, H: 35 },
  shoulder: { L: 60, W: 60, H: 35 },
  rsc: { L: 160, W: 110, H: 130 },
  display: { L: 160, W: 60, H: 40 },
  giftBag: { W: 120, G: 70, H: 180 },
  vialCard: { H: 90 },
  tube: { D: 45, H: 120 },
  hangTab: { L: 28, W: 28, H: 95 },
};

const RIGID: StructureType[] = ["rigidTray", "rigidLid", "rigidSet", "hingedLid", "shoulder"];
const CORR: StructureType[] = ["mailer", "rsc"];
/** حدود كل معامل: الخلوص صغير (0 – 10 مم)، والبقية أبعاد العلبة */
export const paramLimits = (k: ParamKey) => (k === "clearance" ? { min: 0, max: 10 } : k === "N" ? { min: 1, max: 12 } : k === "vialD" ? { min: 5, max: 40 } : PARAM_LIMITS);
const clampP = (n: number, k: ParamKey = "L") => {
  const { min, max } = paramLimits(k);
  return Math.min(max, Math.max(min, Math.round(n * 2) / 2));
};
export const clampT = (n: number) => Math.min(T_LIMITS.max, Math.max(T_LIMITS.min, Math.round(n * 20) / 20));

/** خامة القالب المناسبة لخامة العلبة ونوع الهيكل */
export function stockFor(type: StructureType, d: Pick<BoxDesign, "board" | "style">): StockId {
  if (CORR.includes(type)) return "corr";
  if (RIGID.includes(type) || WRAPPED.includes(d.style)) return "grey";
  if (d.board === "kraft") return "kraft";
  if (d.board === "black") return "black";
  return "sbs";
}

/** السماكة الافتراضية: من خامة القالب، أو من نوع العلبة إن كان أثقل */
export function defaultThickness(type: StructureType, d: Pick<BoxDesign, "board" | "style">): number {
  const s = STOCKS[stockFor(type, d)];
  const byStyle = WRAPPED.includes(d.style) ? THICKNESS[d.style] : 0;
  return clampT(Math.max(s.t, CORR.includes(type) ? 1.5 : 0, RIGID.includes(type) ? 1.5 : 0, RIGID.includes(type) || type === "drawer" ? byStyle : 0));
}

/** قيم البداية لنوع ما من مقاس العلبة الداخلي (وفتحة الزجاجة من مقاس العبوة إن وُجد) */
export function defaultParams(type: StructureType, box?: Pick<BoxDesign, "L" | "W" | "H"> | null, fit?: Fit | null): StructureParams {
  const meta = structureById(type)!;
  const base: StructureParams = { ...TDEF[type] };
  for (const k of meta.fields) if (base[k] === undefined) base[k] = DEF[k];
  if (box) {
    const { L, W, H } = box;
    if (type === "mailer") Object.assign(base, { L: Math.max(H, L), W: Math.min(L, W), H: Math.min(H, W) });
    else if (type === "pillow") Object.assign(base, { Wp: Math.max(L, W) + 8, Hp: H });
    else if (type === "hexagon") Object.assign(base, { S: Math.max(L, W) / Math.sqrt(3), H });
    else if (type === "insert") Object.assign(base, { L: L - 1, W: W - 1, H: Math.max(12, Math.round(H * 0.18)) });
    else if (type === "rigidLid") Object.assign(base, { L, W, H: Math.max(15, Math.round(H * 0.4)) });
    else if (type === "tube") Object.assign(base, { D: Math.max(L, W), H, lidH: Math.max(20, Math.round(H * 0.22)) });
    else if (type === "rsc") Object.assign(base, { L: L * 3 + 6, W: W * 2 + 6, H: H + 6 });
    else if (type === "display") Object.assign(base, { L: L * 3 + 10, W: W + 6, H: Math.max(25, Math.round(H * 0.45)), header: Math.max(50, Math.round(H * 0.6)) });
    else if (type === "giftBag") Object.assign(base, { W: L + 30, G: W + 20, H: H + 50 });
    else if (type === "vialCard") Object.assign(base, { H: 90 });
    else Object.assign(base, { L, W, H });
  }
  if (meta.fields.includes("bottleW")) {
    const w = fit ? fit.w + 2 : (base.L ?? DEF.L) - 10;
    const dd = fit ? fit.d + 2 : (base.W ?? DEF.W) - 10;
    base.bottleW = Math.min(w, (base.L ?? DEF.L) - 4);
    base.bottleD = Math.min(dd, (base.W ?? DEF.W) - 4);
  }
  const out: StructureParams = {};
  for (const k of meta.fields) out[k] = clampP(base[k] ?? DEF[k], k);
  return out;
}

/** ينقّي كائناً من التخزين أو الرابط: نوع معروف، أرقام ضمن الحدود، سماكة صالحة */
export function cleanStructure(x: unknown): BoxStructure | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (!isStructureType(o.type)) return null;
  const meta = structureById(o.type)!;
  const raw = (o.params && typeof o.params === "object" ? o.params : {}) as Record<string, unknown>;
  const params: StructureParams = {};
  for (const k of meta.fields) {
    const v = Number(raw[k]);
    params[k] = clampP(Number.isFinite(v) && v >= 0 ? v : DEF[k], k);
  }
  const t = Number(o.t);
  return { type: o.type, params, t: clampT(Number.isFinite(t) && t > 0 ? t : STOCKS.sbs.t) };
}

/** الهيكل المقابل لنوع العلبة في الاستوديو حين لا يختار العميل من المكتبة */
export function autoStructure(d: BoxDesign, fit?: Fit | null): BoxStructure | null {
  const map: Partial<Record<BoxStyle, StructureType>> = { tuck: "rte", ste: "ste", sleeve: "sleeve", sleeveWindow: "sleeve", band: "sleeve", window: "window", doubleWindow: "window", hang: "hangTab", hangWindow: "hangTab", sealEnd: "sealEnd", fullOverlap: "sealEnd", crash: "crashLock", gable: "ste", handle: "ste", cube: "rte", tuckTray: "rigidTray", foldTray: "hingedLid", bookSleeve: "sleeve", hexagon: "hexagon", hexWindow: "hexagon", octagon: "hexagon", pentagon: "hexagon", triangle: "hexagon", rigid: "rigidSet", telescope: "rigidSet", magnetic: "hingedLid", clamshell: "hingedLid", shoulder: "shoulder", neckMagnetic: "shoulder", rigidWindow: "rigidSet", discovery: "rigidSet", drawer: "drawer", drawerWindow: "drawer", rigidDrawer: "drawer", doubleDrawer: "drawer", tube: "tube", tubeTele: "tube", mailer: "mailer", mailerWindow: "mailer", rsc: "rsc", display: "display" };
  let type: StructureType = map[d.style] ?? "rte";
  if ((type === "rte" || type === "ste") && Array.isArray(d.effects) && d.effects.includes("window")) type = "window";
  return { type, params: defaultParams(type, d, fit), t: defaultThickness(type, d) };
}

/** الهيكل المعتمد: اختيار العميل من المكتبة إن وُجد، وإلا المقابل التلقائي */
export const resolveStructure = (d: BoxDesign, fit?: Fit | null): BoxStructure | null => cleanStructure(d.structure) ?? autoStructure(d, fit);

const svgInner = (s: string) => s.replace(/^[\s\S]*?<title>[^<]*<\/title>/, "").replace(/<\/svg>\s*$/, "");
const svgDim = (s: string) => {
  const m = s.match(/viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/);
  return m ? [Number(m[1]), Number(m[2])] : [0, 0];
};

/** قالب القصّ SVG بالمليمتر. الطقم الصلب يُركَّب من قاعدة وغطاء وحشوة على فرخ واحد */
export function structureSvg(s: BoxStructure): string {
  const p = { ...s.params, t: s.t } as Record<string, number>;
  if (s.type !== "rigidSet") return Dielines.generate(s.type, p);
  const L = p.L ?? DEF.L, W = p.W ?? DEF.W, H = p.H ?? DEF.H, clearance = p.clearance ?? DEF.clearance;
  const parts = [Dielines.generate("rigidTray", { L, W, H }), Dielines.generate("rigidLid", { L, W, H: Math.max(10, H * 0.6), clearance }), Dielines.generate("insert", { L: L - 1, W: W - 1, H: Math.max(10, H * 0.5), bottleW: p.bottleW ?? DEF.bottleW, bottleD: p.bottleD ?? DEF.bottleD, t: s.t })];
  const dims = parts.map(svgDim);
  const gap = 10;
  const Wt = dims.reduce((a, [w]) => a + w, 0) + gap * (parts.length - 1) + 10;
  const Ht = Math.max(...dims.map(([, h]) => h)) + 10;
  let x = 5;
  const groups = parts.map((svg, i) => {
    const g = `<g transform="translate(${x},5)">${svgInner(svg)}</g>`;
    x += dims[i][0] + gap;
    return g;
  });
  const meta = JSON.stringify({ type: "RIGID_SET", L, W, H, clearance, t: s.t });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${Wt}mm" height="${Ht}mm" viewBox="0 0 ${Wt} ${Ht}" data-dieline='${meta}'>\n  <title>RIGID_SET ${L}x${W}x${H} mm</title>\n${groups.join("\n")}\n</svg>`;
}

/** مقاس الفرخ (مم) من ملف SVG */
export function svgSheet(svg: string): { w: number; h: number } {
  const m = svg.match(/width="([\d.]+)mm" height="([\d.]+)mm"/);
  return m ? { w: Number(m[1]), h: Number(m[2]) } : { w: 0, h: 0 };
}

export const structureModel = (s: BoxStructure): Model3D => Models3D.build(s.type, { ...s.params, t: s.t });

/** نص الأبعاد: L 52 × W 52 × H 125 */
export function paramsText(s: BoxStructure, num: (n: number, d?: number) => string = (n) => String(n)): string {
  const meta = structureById(s.type)!;
  return meta.fields.map((k) => `${k} ${num(s.params[k] ?? DEF[k], (s.params[k] ?? 0) % 1 ? 1 : 0)}`).join(" × ");
}

/** سطر مقروء للملخصات والطلب */
export function structureLabel(s: BoxStructure, pick: (b: Bi) => string, t: (ar: string, en: string) => string, num: (n: number, d?: number) => string = (n) => String(n)): string {
  const meta = structureById(s.type)!;
  return `${pick(meta.name)} (${meta.code}) · ${paramsText(s, num)} ${t("مم", "mm")} · ${t("سماكة", "board")} ${num(s.t, 2)} ${t("مم", "mm")}`;
}

/** تمثيل مضغوط يُرسل حقلاً مع الطلب ويُعاد منه القالب نفسه: rte|L=52,W=52,H=125|t=0.45 */
export function structureField(s: BoxStructure): string {
  const meta = structureById(s.type)!;
  return `${s.type}|${meta.fields.map((k) => `${k}=${s.params[k] ?? DEF[k]}`).join(",")}|t=${s.t}`;
}
export function parseStructureField(v: unknown): BoxStructure | null {
  if (typeof v !== "string" || v.length > 200) return null;
  const [type, ps = "", ts = ""] = v.split("|");
  const params: Record<string, number> = {};
  for (const kv of ps.split(",")) {
    const [k, n] = kv.split("=");
    if (k) params[k] = Number(n);
  }
  return cleanStructure({ type, params, t: Number(ts.replace(/^t=/, "")) });
}

const PRESET_LABELS: Record<string, Bi> = {
  vial_2ml: { ar: "عينة 2 مل (Vial)", en: "2 ml vial" },
  travel_10ml: { ar: "ترافل 10 مل", en: "10 ml travel" },
  edp_30ml: { ar: "EDP 30 مل", en: "EDP 30 ml" },
  edp_50ml: { ar: "EDP 50 مل", en: "EDP 50 ml" },
  edp_100ml: { ar: "EDP 100 مل", en: "EDP 100 ml" },
  discovery_5: { ar: "طقم اكتشاف 5 عينات", en: "Discovery set, 5 vials" },
  oud_oil_6ml: { ar: "دهن عود 6 مل (رول أون)", en: "6 ml oud oil roll-on" },
  gift_set: { ar: "طقم هدايا (عطر + دهن)", en: "Gift set (perfume + oil)" },
  oud_hex_50: { ar: "عود فاخر 50 مل سداسي", en: "Luxury oud 50 ml, hexagonal" },
};

export interface Preset {
  id: string;
  label: Bi;
  /** الأنواع المتاحة في هذا المقاس ومعاملاتها */
  types: Partial<Record<StructureType, StructureParams>>;
}
export const PRESETS: Preset[] = Object.entries(Dielines.PRESETS).map(([id, v]) => {
  const types: Preset["types"] = {};
  for (const [k, val] of Object.entries(v)) if (k !== "label" && isStructureType(k) && val && typeof val === "object") types[k] = val as StructureParams;
  return { id, label: PRESET_LABELS[id] ?? { ar: v.label, en: v.label }, types };
});

/** أسماء الملفات: dieline_RTE_52x52x125.svg */
export const structureFileName = (s: BoxStructure, ext: string) => `dieline_${s.type}_${structureById(s.type)!.fields.map((k) => s.params[k] ?? DEF[k]).join("x")}.${ext}`;

/** المجموعات الصناعية التي يغطيها الهيكل للملخص */
export const STRUCTURE_COUNT = STRUCTURES.length;

/** ينزّل نصاً أو Blob كملف */
export function downloadFile(data: Blob | string, name: string, type = "image/svg+xml") {
  const blob = typeof data === "string" ? new Blob([data], { type }) : data;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** الحدود المعروفة للمعاينة — تُعرض للعميل كما هي */
export const STRUCTURE_LIMITS: Bi[] = [
  { ar: "علبة الوسادة تُعرض مجسّمة بألواح مستوية مائلة؛ منحنياتها الدقيقة في القالب الثنائي فقط.", en: "The pillow box is previewed with flat angled panels; its exact curves live in the 2D dieline only." },
  { ar: "ألسنة القفل الذاتي هندسة قياسية تقريبية تُراجع مع المطبعة قبل صنع القالب.", en: "Crash-lock tabs follow standard approximate geometry; confirm with the printer before tooling." },
  { ar: "النقش البارز يُمثَّل بلوح مرتفع بعرض الشعار لا بحروفه.", en: "Embossing is shown as a raised bar the width of the logo, not its letters." },
  { ar: "الهندسة كلها مبنية على المواصفات العامة ECMA/FEFCO.", en: "All geometry follows the public ECMA/FEFCO specifications." },
];

export { boardColor };
