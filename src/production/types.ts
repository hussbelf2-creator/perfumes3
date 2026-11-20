import type { Bi } from "../i18n/context";
import type { Concentration, Phase } from "./plan";

// أوامر الإنتاج: التشغيلة من استلام المواد إلى الإفراج. نموذج بيانات على طريقة سجل التشغيلة في ISO 22716:
// رقم تشغيلة فريد، خطوات موقّعة بوقتها وصاحبها، مواد بنسبة هدر، تعتيق له ساعة، وفحص نهائي بعيّنة AQL.
// نفس القواعد في supabase/schema.sql (production_orders). الاستيراد نسبي لأن الاختبارات والخادم يستخدمانه.

export type PoKind = "perfume" | "packaging";
export type PoStatus = "planned" | "in_progress" | "on_hold" | "released" | "cancelled";
export const PO_STATUS_LABELS: Record<PoStatus, Bi> = {
  planned: { ar: "مخطّط", en: "Planned" },
  in_progress: { ar: "قيد التنفيذ", en: "In progress" },
  on_hold: { ar: "موقوف", en: "On hold" },
  released: { ar: "مُفرج عنه", en: "Released" },
  cancelled: { ar: "ملغى", en: "Cancelled" },
};

export type StepId = "materials" | "golden" | "compound" | "maceration" | "filter" | "fill" | "pack" | "qc" | "release";
export interface PoStep {
  id: StepId;
  done: boolean;
  doneAt?: string | null;
  by?: string | null;
  note?: string;
}
export const STEP_META: Record<StepId, { name: Bi; what: Bi; phase: Phase; icon: string; perfumeOnly?: boolean }> = {
  materials: { name: { ar: "استلام المواد وفحصها", en: "Materials received & inspected" }, what: { ar: "العبوات والأغطية والعلب والملصقات والزيت العطري: تُفحص ثم تُعتمد أو تُحجر", en: "Bottles, caps, boxes, labels and oil: inspected, then approved or quarantined" }, phase: "pack", icon: "ri-inbox-archive-line" },
  golden: { name: { ar: "العينة الذهبية موقّعة", en: "Golden sample signed" }, what: { ar: "قطعة كاملة يوقّعها العميل فتصبح مرجع الفحص", en: "A finished unit the client signs; it becomes the inspection standard" }, phase: "pack", icon: "ri-medal-line" },
  compound: { name: { ar: "تحضير المركّز والتخفيف", en: "Compounding & dilution" }, what: { ar: "وزن المكوّنات ومزجها ثم تخفيفها بالكحول", en: "Weigh and blend, then dilute in alcohol" }, phase: "juice", icon: "ri-flask-line", perfumeOnly: true },
  maceration: { name: { ar: "التعتيق", en: "Maceration" }, what: { ar: "يرتاح العطر في خزانات معتمة حتى أبكر موعد تعبئة", en: "The perfume rests in dark tanks until the earliest fill date" }, phase: "juice", icon: "ri-hourglass-line", perfumeOnly: true },
  filter: { name: { ar: "التبريد والترشيح", en: "Chilling & filtration" }, what: { ar: "تبريد يرسّب الشوائب ثم ترشيح", en: "Chill to drop out haze, then filter" }, phase: "juice", icon: "ri-filter-3-line", perfumeOnly: true },
  fill: { name: { ar: "التعبئة والكبس والتغطية", en: "Filling, crimping & capping" }, what: { ar: "مع فحص مستوى التعبئة والتسرب أثناء التشغيل", en: "With in-process fill-level and leak checks" }, phase: "produce", icon: "ri-drop-line", perfumeOnly: true },
  pack: { name: { ar: "اللصق والترميز والتعليب", en: "Labelling, coding & boxing" }, what: { ar: "ملصق ورقم تشغيلة وعلبة وسلوفان", en: "Label, batch code, box and cello" }, phase: "produce", icon: "ri-box-3-line" },
  qc: { name: { ar: "الفحص النهائي", en: "Final QC" }, what: { ar: "عيّنة إحصائية (AQL) مقابل العينة الذهبية", en: "A statistical (AQL) sample against the golden sample" }, phase: "deliver", icon: "ri-shield-check-line" },
  release: { name: { ar: "الإفراج عن التشغيلة", en: "Batch release" }, what: { ar: "توقيع الجودة ثم التسليم للشحن", en: "QA sign-off, then hand-over to shipping" }, phase: "deliver", icon: "ri-checkbox-circle-line" },
};
export const STEP_ORDER: StepId[] = ["materials", "golden", "compound", "maceration", "filter", "fill", "pack", "qc", "release"];
export const stepsFor = (kind: PoKind): StepId[] => STEP_ORDER.filter((s) => kind === "perfume" || !STEP_META[s].perfumeOnly);

export interface BomLine {
  id: string;
  /** بند المخزون (اختياري: مادة يوردها العميل بلا بند) */
  itemId?: string | null;
  name: string;
  /** استهلاك الوحدة الواحدة من المنتج */
  perUnit: number;
  wastagePct: number;
  /** ما صُرف من المخزون فعلاً */
  issued: number;
  /** مصدر المادة: المصنع أو العميل */
  source: "factory" | "client";
}
export type QcClass = "critical" | "major" | "minor";
export interface QcResult {
  id: string;
  text: Bi;
  cls: QcClass;
  /** عدد العيوب في العيّنة (null = لم يُفحص بعد) */
  defects: number | null;
}
export interface PoDocs {
  /** رقم تعديل IFRA على الشهادة (مثل 51) */
  ifra: string;
  sds: boolean;
  allergens: boolean;
  /** رقم إدراج المنتج في «غد» لدى هيئة الغذاء والدواء */
  ghad: string;
}

export interface ProductionOrder {
  id: string;
  ref: string;
  projectId: string | null;
  projectTitle: string;
  kind: PoKind;
  product: string;
  qty: number;
  fillMl: number;
  concentration: Concentration;
  oud: boolean;
  batchNo: string;
  formulaRef: string;
  status: PoStatus;
  steps: PoStep[];
  bom: BomLine[];
  qc: QcResult[];
  docs: PoDocs;
  macerationStart: string | null;
  macerationDays: number;
  /** انحراف موثّق: تعبئة قبل اكتمال التعتيق */
  deviation: string;
  goldenAt: string | null;
  goodUnits: number | null;
  rejects: number | null;
  dueAt: string | null;
  note: string;
  releasedAt: string | null;
  releasedBy: string | null;
  createdAt: string;
  updatedAt: string;
  /** لقطة من تركيبة المشروع المعتمدة ساعة إنشاء الأمر (لا تتغير بعدها) */
  formula?: PoFormula | null;
}

/** التركيبة التي تُحضَّر بها التشغيلة: العينة التي اعتمدها العميل أو الفريق */
export interface PoFormula {
  kitRef: string;
  sampleId: string;
  code: string;
  name: string;
  concentration: string;
  ingredients: { name: string; amount: number; unit: string }[];
  approvedBy: "client" | "team";
  approvedAt: string;
}
/** كمية كل مكوّن للتشغيلة: النسبة × حجم التشغيلة (العبوات × حجم التعبئة) مع نسبة الهدر. غير النسب تُعرض كما هي */
export function formulaBatch(f: PoFormula, qty: number, fillMl: number, wastagePct = 0): { name: string; amount: number; unit: string; batchMl: number | null }[] {
  const total = qty * fillMl * (1 + Math.max(0, wastagePct) / 100);
  return f.ingredients.map((g) => ({ ...g, batchMl: g.unit === "%" && total > 0 ? Math.round(total * g.amount) / 100 : null }));
}
export const formulaLabel = (f: Pick<PoFormula, "kitRef" | "code" | "name">) => `${f.kitRef} · ${f.code ? `${f.code} · ` : ""}${f.name}`.slice(0, 60);

export interface NewOrder {
  projectId: string | null;
  projectTitle: string;
  kind: PoKind;
  product: string;
  qty: number;
  fillMl: number;
  concentration: Concentration;
  oud: boolean;
  dueAt: string | null;
}

/** ما يراه العميل من التشغيلة: مراحل مبسّطة بلا تفاصيل داخلية */
export interface PoProgress {
  ref: string;
  batchNo: string;
  product: string;
  qty: number;
  status: PoStatus;
  /** المرحلة الحالية وترتيبها بين المراحل */
  phases: { id: Phase; done: boolean; current: boolean }[];
  step: StepId | null;
  /** أبكر موعد تعبئة أثناء التعتيق */
  fillFrom: string | null;
  dueAt: string | null;
  releasedAt: string | null;
}

// ─── AQL: ISO 2859-1 مستوى الفحص العام II، خطة عيّنة مفردة عادية ──────
const AQL_TABLE: { max: number; n: number; major: number; minor: number }[] = [
  { max: 8, n: 2, major: 0, minor: 0 },
  { max: 15, n: 3, major: 0, minor: 0 },
  { max: 25, n: 5, major: 0, minor: 0 },
  { max: 50, n: 8, major: 0, minor: 1 },
  { max: 90, n: 13, major: 1, minor: 1 },
  { max: 150, n: 20, major: 1, minor: 2 },
  { max: 280, n: 32, major: 2, minor: 3 },
  { max: 500, n: 50, major: 3, minor: 5 },
  { max: 1200, n: 80, major: 5, minor: 7 },
  { max: 3200, n: 125, major: 7, minor: 10 },
  { max: 10000, n: 200, major: 10, minor: 14 },
  { max: 35000, n: 315, major: 14, minor: 21 },
  { max: 150000, n: 500, major: 21, minor: 21 },
  { max: 500000, n: 800, major: 21, minor: 21 },
  { max: Infinity, n: 1250, major: 21, minor: 21 },
];
/** حجم العيّنة وأقصى عدد عيوب مقبول: حرج 0، رئيسي AQL 2.5، ثانوي AQL 4.0 */
export function aqlPlan(lot: number): { sample: number; accept: Record<QcClass, number> } {
  const row = AQL_TABLE.find((r) => lot <= r.max) ?? AQL_TABLE[AQL_TABLE.length - 1];
  return { sample: Math.min(row.n, Math.max(1, Math.round(lot))), accept: { critical: 0, major: row.major, minor: row.minor } };
}

export interface QcVerdict {
  checked: number;
  total: number;
  defects: Record<QcClass, number>;
  accept: Record<QcClass, number>;
  sample: number;
  /** null = لم يكتمل الفحص */
  pass: boolean | null;
}
export function qcVerdict(o: Pick<ProductionOrder, "qc" | "qty">): QcVerdict {
  const plan = aqlPlan(o.qty);
  const defects: Record<QcClass, number> = { critical: 0, major: 0, minor: 0 };
  let checked = 0;
  for (const q of o.qc) {
    if (q.defects === null) continue;
    checked++;
    defects[q.cls] += q.defects;
  }
  const failed = (["critical", "major", "minor"] as QcClass[]).some((c) => defects[c] > plan.accept[c]);
  return { checked, total: o.qc.length, defects, accept: plan.accept, sample: plan.sample, pass: failed ? false : checked === o.qc.length && o.qc.length > 0 ? true : null };
}

/** الكمية المطلوبة من مادة: استهلاك الوحدة × الكمية × (1 + الهدر) مقرّبة للأعلى */
export const bomRequired = (l: Pick<BomLine, "perUnit" | "wastagePct">, qty: number) => Math.ceil(l.perUnit * qty * (1 + l.wastagePct / 100) * 1000) / 1000;

/** أبكر موعد تعبئة: بداية التعتيق + أيامه */
export function fillFrom(o: Pick<ProductionOrder, "macerationStart" | "macerationDays">): Date | null {
  return o.macerationStart ? new Date(new Date(o.macerationStart).getTime() + o.macerationDays * 86_400_000) : null;
}

/** الخطوة الحالية: أول خطوة لم تُنجز */
export const currentStep = (o: Pick<ProductionOrder, "steps">) => o.steps.find((s) => !s.done)?.id ?? null;
export const stepsDone = (o: Pick<ProductionOrder, "steps">) => o.steps.filter((s) => s.done).length;

/** لماذا لا تُنجز هذه الخطوة الآن؟ (null = مسموح) — القواعد نفسها على الخادم */
export function stepBlock(o: ProductionOrder, id: StepId, now = new Date()): string | null {
  const at = o.steps.findIndex((s) => s.id === id);
  if (at < 0) return "step_unknown";
  if (o.status === "released" || o.status === "cancelled") return "order_closed";
  if (o.status === "on_hold") return "order_on_hold";
  if (o.steps.slice(0, at).some((s) => !s.done)) return "step_order";
  if (id === "golden" && !o.goldenAt) return "golden_required";
  if (id === "maceration") {
    // ساعة التعتيق تبدأ عند اكتمال التحضير، ولا تُختصر إلا بانحراف موثّق
    const from = fillFrom(o);
    if (!from) return "maceration_not_started";
    if (from.getTime() > now.getTime() && !o.deviation.trim()) return "maceration_running";
  }
  if (id === "release") {
    const v = qcVerdict(o);
    if (v.pass === null) return "qc_incomplete";
    if (!v.pass) return "qc_failed";
    if (o.goodUnits === null) return "yield_required";
  }
  return null;
}

/** تقدّم مبسّط للعميل من الأمر الكامل */
export function progressOf(o: ProductionOrder): PoProgress {
  const cur = currentStep(o);
  const order: Phase[] = o.kind === "perfume" ? ["pack", "juice", "produce", "deliver"] : ["pack", "produce", "deliver"];
  const curPhase = cur ? STEP_META[cur].phase : null;
  return {
    ref: o.ref,
    batchNo: o.batchNo,
    product: o.product,
    qty: o.qty,
    status: o.status,
    phases: order.map((p) => {
      const mine = o.steps.filter((s) => STEP_META[s.id].phase === p);
      return { id: p, done: mine.length > 0 && mine.every((s) => s.done), current: p === curPhase };
    }),
    step: cur,
    fillFrom: cur === "maceration" || cur === "filter" || cur === "fill" ? fillFrom(o)?.toISOString() ?? null : null,
    dueAt: o.dueAt,
    releasedAt: o.releasedAt,
  };
}

/** رقم تشغيلة: B + السنة والشهر واليوم + تسلسل اليوم */
export function batchNumber(at: Date, seq: number) {
  const y = String(at.getUTCFullYear()).slice(2), m = String(at.getUTCMonth() + 1).padStart(2, "0"), d = String(at.getUTCDate()).padStart(2, "0");
  return `B${y}${m}${d}-${String(seq).padStart(2, "0")}`;
}
export const PO_REF_RE = /^PO-\d{4}-\d{3,5}$/;
