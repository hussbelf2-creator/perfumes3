import type { PlanConfig } from "./plan";
import { STEP_META, batchNumber, bomRequired, formulaLabel, stepBlock, stepsFor, type BomLine, type NewOrder, type PoFormula, type PoStep, type ProductionOrder, type QcResult, type StepId } from "./types";
import type { Bi } from "../i18n/context";

// منطق أوامر الإنتاج البحت (بلا تخزين): يُستخدم في الوضع التجريبي والاختبارات، ويطابق مُشغّلات الخادم.

export class PoError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

export interface QcTemplate {
  id: string;
  text: Bi;
  cls: QcResult["cls"];
}
export type ProdConfig = PlanConfig & { qc: QcTemplate[]; wastagePct: number };

const clampInt = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number(n) || 0)));

export function checkNew(i: NewOrder) {
  if (!i.product.trim() || i.product.length > 120) throw new PoError("product");
  if (!(i.qty >= 1 && i.qty <= 5_000_000)) throw new PoError("qty");
  if (i.kind === "perfume" && !(i.fillMl >= 1 && i.fillMl <= 1000)) throw new PoError("fill_ml");
}

/** أمر جديد: خطواته حسب النوع، وقائمة فحصه وأيام تعتيقه من إعدادات «مركز التحكم» */
export function newOrder(i: NewOrder, cfg: ProdConfig, seq: { ref: number; batch: number }, now: Date, id: string, formula: PoFormula | null = null): ProductionOrder {
  checkNew(i);
  const mac = cfg.maceration[i.concentration] ?? [21, 35];
  const ym = `${String(now.getUTCFullYear()).slice(2)}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const at = now.toISOString();
  return {
    id,
    ref: `PO-${ym}-${String(seq.ref).padStart(3, "0")}`,
    projectId: i.projectId,
    projectTitle: i.projectTitle.slice(0, 120),
    kind: i.kind,
    product: i.product.trim(),
    qty: clampInt(i.qty, 1, 5_000_000),
    fillMl: i.kind === "perfume" ? clampInt(i.fillMl, 1, 1000) : 0,
    concentration: i.concentration,
    oud: i.oud,
    batchNo: batchNumber(now, seq.batch),
    formulaRef: formula && i.kind === "perfume" ? formulaLabel(formula) : "",
    formula,
    status: "planned",
    steps: stepsFor(i.kind).map((s): PoStep => ({ id: s, done: false })),
    bom: [],
    qc: cfg.qc.map((q) => ({ id: q.id, text: { ...q.text }, cls: q.cls, defects: null })),
    docs: { ifra: "", sds: false, allergens: false, ghad: "" },
    macerationStart: null,
    // الحد الأدنى من نطاق التركيز، ويزيد للعود
    macerationDays: i.kind === "perfume" ? mac[0] + (i.oud ? cfg.oudExtra : 0) : 0,
    deviation: "",
    goldenAt: null,
    goodUnits: null,
    rejects: null,
    dueAt: i.dueAt,
    note: "",
    releasedAt: null,
    releasedBy: null,
    createdAt: at,
    updatedAt: at,
  };
}

/** إنجاز خطوة أو التراجع عن آخر خطوة منجزة */
export function applyStep(o: ProductionOrder, id: StepId, done: boolean, by: string | null, now: Date, note = ""): ProductionOrder {
  const at = now.toISOString();
  if (!done) {
    if (o.status === "released" || o.status === "cancelled") throw new PoError("order_closed");
    const lastDone = [...o.steps].reverse().find((s) => s.done);
    if (!lastDone || lastDone.id !== id) throw new PoError("undo_last_only");
    const steps = o.steps.map((s) => (s.id === id ? { id: s.id, done: false } : s));
    return { ...o, steps, macerationStart: id === "compound" ? null : o.macerationStart, status: steps.some((s) => s.done) ? "in_progress" : "planned", updatedAt: at };
  }
  if (o.steps.find((s) => s.id === id)?.done) return o;
  const block = stepBlock(o, id, now);
  if (block) throw new PoError(block);
  const steps = o.steps.map((s) => (s.id === id ? { id: s.id, done: true, doneAt: at, by, note: note.slice(0, 300) } : s));
  const released = id === "release";
  return {
    ...o,
    steps,
    // اكتمال التحضير يبدأ ساعة التعتيق
    macerationStart: id === "compound" ? at : o.macerationStart,
    status: released ? "released" : "in_progress",
    releasedAt: released ? at : o.releasedAt,
    releasedBy: released ? by : o.releasedBy,
    updatedAt: at,
  };
}

export type PoPatch = Partial<Pick<ProductionOrder, "product" | "qty" | "fillMl" | "formulaRef" | "bom" | "qc" | "docs" | "deviation" | "goldenAt" | "goodUnits" | "rejects" | "dueAt" | "note" | "macerationDays">> & { hold?: boolean };

export function applyPoPatch(o: ProductionOrder, p: PoPatch, now: Date): ProductionOrder {
  if (o.status === "cancelled") throw new PoError("order_closed");
  // بعد الإفراج: السجل مقفل إلا الملاحظة (سجل التشغيلة لا يُعدَّل بأثر رجعي)
  if (o.status === "released") {
    if (Object.keys(p).some((k) => k !== "note")) throw new PoError("order_closed");
    return { ...o, note: (p.note ?? o.note).slice(0, 1000), updatedAt: now.toISOString() };
  }
  const next: ProductionOrder = { ...o, updatedAt: now.toISOString() };
  if (p.product !== undefined) {
    if (!p.product.trim() || p.product.length > 120) throw new PoError("product");
    next.product = p.product.trim();
  }
  if (p.qty !== undefined) {
    if (!(p.qty >= 1 && p.qty <= 5_000_000)) throw new PoError("qty");
    next.qty = Math.round(p.qty);
  }
  if (p.fillMl !== undefined) next.fillMl = clampInt(p.fillMl, 0, 1000);
  if (p.formulaRef !== undefined) next.formulaRef = p.formulaRef.slice(0, 60);
  if (p.macerationDays !== undefined) next.macerationDays = clampInt(p.macerationDays, 0, 400);
  if (p.bom !== undefined) {
    if (p.bom.length > 40) throw new PoError("bom_too_long");
    next.bom = p.bom.map((l): BomLine => {
      if (!l.name.trim()) throw new PoError("bom_name");
      if (!(l.perUnit > 0 && l.perUnit <= 100_000)) throw new PoError("bom_per_unit");
      const prev = o.bom.find((x) => x.id === l.id);
      // المصروف لا يُكتب من الواجهة: يثبته الصرف من المخزون فقط
      return { id: l.id, itemId: l.itemId ?? null, name: l.name.trim().slice(0, 120), perUnit: l.perUnit, wastagePct: Math.min(50, Math.max(0, Number(l.wastagePct) || 0)), issued: prev?.issued ?? 0, source: l.source === "client" ? "client" : "factory" };
    });
  }
  if (p.qc !== undefined) {
    next.qc = o.qc.map((q) => {
      const x = p.qc!.find((y) => y.id === q.id);
      if (!x) return q;
      const d = x.defects === null ? null : clampInt(x.defects, 0, 100_000);
      return { ...q, defects: d };
    });
  }
  if (p.docs !== undefined) next.docs = { ifra: p.docs.ifra.replace(/[^\w.-]/g, "").slice(0, 12), sds: !!p.docs.sds, allergens: !!p.docs.allergens, ghad: p.docs.ghad.replace(/[^\w-]/g, "").slice(0, 40) };
  if (p.deviation !== undefined) next.deviation = p.deviation.slice(0, 500);
  if (p.goldenAt !== undefined) next.goldenAt = p.goldenAt;
  if (p.goodUnits !== undefined) next.goodUnits = p.goodUnits === null ? null : clampInt(p.goodUnits, 0, 10_000_000);
  if (p.rejects !== undefined) next.rejects = p.rejects === null ? null : clampInt(p.rejects, 0, 10_000_000);
  if (p.dueAt !== undefined) next.dueAt = p.dueAt;
  if (p.note !== undefined) next.note = p.note.slice(0, 1000);
  if (p.hold !== undefined) next.status = p.hold ? "on_hold" : next.steps.some((s) => s.done) ? "in_progress" : "planned";
  return next;
}

/** ما بقي صرفه من كل مادة مربوطة بالمخزون */
export function pendingIssues(o: ProductionOrder): { line: BomLine; qty: number }[] {
  return o.bom
    .filter((l) => l.itemId && l.source === "factory")
    .map((l) => ({ line: l, qty: Math.round((bomRequired(l, o.qty) - l.issued) * 1000) / 1000 }))
    .filter((x) => x.qty > 0);
}

/** نسبة العائد: الصالح ÷ المخطّط */
export const yieldPct = (o: Pick<ProductionOrder, "goodUnits" | "qty">) => (o.goodUnits === null || !o.qty ? null : Math.round((o.goodUnits / o.qty) * 1000) / 10);

export const stepName = (id: StepId) => STEP_META[id].name;
