import { supabase } from "@/lib/supabase";
import { can } from "@/lib/rbac";
import { PermissionError, ValidationError } from "@/admin/data/types";
import type { PActor } from "@/projects/repo";
import { inventoryRepo } from "@/inventory/repo";
import { applyPoPatch, applyStep, newOrder, pendingIssues, PoError, type PoPatch, type ProdConfig } from "./logic";
import { progressOf, stepsFor, type NewOrder, type PoFormula, type PoProgress, type PoStatus, type PoStep, type ProductionOrder, type StepId } from "./types";
import { localFormulaOf } from "@/projects/repo";

// أوامر الإنتاج: في Supabase الجدول production_orders (المرجع ورقم التشغيلة والإفراج يفرضها الخادم)،
// والوضع التجريبي يطبّق المنطق نفسه محلياً (src/production/logic.ts).

export interface ProductionRepo {
  list(a: PActor): Promise<ProductionOrder[]>;
  /** تقدّم مبسّط لمشاريع العميل (أو الفريق) */
  progress(projectIds: string[], a: PActor): Promise<Record<string, PoProgress[]>>;
  create(input: NewOrder, cfg: ProdConfig, a: PActor): Promise<ProductionOrder>;
  save(id: string, patch: PoPatch, a: PActor): Promise<ProductionOrder>;
  step(id: string, stepId: StepId, done: boolean, a: PActor, note?: string): Promise<ProductionOrder>;
  /** صرف ما بقي من مواد الأمر من المخزون */
  issue(id: string, a: PActor): Promise<{ order: ProductionOrder; errors: string[] }>;
  cancel(id: string, a: PActor): Promise<ProductionOrder>;
}

const canView = (a: PActor) => can(a.role, "projects.view") || can(a.role, "inventory.view") || can(a.role, "projects.manage");
const canManage = (a: PActor) => can(a.role, "projects.manage") || can(a.role, "inventory.manage");
const guardManage = (a: PActor) => {
  if (!canManage(a)) throw new PermissionError("inventory.manage");
};
/** أخطاء المنطق تصل الواجهة برسالتها المفهومة */
const wrap = <T,>(fn: () => T): T => {
  try {
    return fn();
  } catch (e) {
    if (e instanceof PoError) throw new ValidationError(e.code);
    throw e;
  }
};
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`);

async function issueStock(o: ProductionOrder, a: PActor): Promise<{ issued: Record<string, number>; errors: string[] }> {
  const issued: Record<string, number> = {};
  const errors: string[] = [];
  for (const { line, qty } of pendingIssues(o)) {
    try {
      await inventoryRepo.addMove({ itemId: line.itemId!, kind: "issue", qty, projectId: o.projectId, note: `صرف لأمر الإنتاج ${o.ref} · تشغيلة ${o.batchNo}` }, a);
      issued[line.id] = qty;
    } catch (e) {
      errors.push(e instanceof ValidationError ? e.code : "issue_failed");
    }
  }
  return { issued, errors };
}

// ─── الوضع التجريبي ───────────────────────────────────────────────
const KEY = "pp_production_v1";
function read(): ProductionOrder[] {
  try {
    const raw = localStorage.getItem(KEY);
    const xs = raw ? (JSON.parse(raw) as ProductionOrder[]) : [];
    return Array.isArray(xs) ? xs : [];
  } catch {
    return [];
  }
}
function write(xs: ProductionOrder[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(xs));
  } catch {
    throw new ValidationError("storage_full");
  }
}
const put = (o: ProductionOrder) => {
  write(read().map((x) => (x.id === o.id ? o : x)));
  return o;
};
const find = (id: string) => {
  const o = read().find((x) => x.id === id);
  if (!o) throw new ValidationError("not_found");
  return o;
};

const localRepo: ProductionRepo = {
  async list(a) {
    if (!canView(a)) throw new PermissionError("projects.view");
    return read();
  },
  async progress(projectIds) {
    // الوضع التجريبي: المتصل يمرّر مشاريعه المرئية فقط (كما تفعل RLS على الخادم)
    const out: Record<string, PoProgress[]> = {};
    for (const o of read()) {
      if (!o.projectId || !projectIds.includes(o.projectId) || o.status === "cancelled") continue;
      (out[o.projectId] ??= []).push(progressOf(o));
    }
    return out;
  },
  async create(input, cfg, a) {
    guardManage(a);
    const all = read();
    const now = new Date();
    const ym = now.toISOString().slice(0, 7), ymd = now.toISOString().slice(0, 10);
    // التركيبة المعتمدة للمشروع تُنسخ لقطةً في الأمر (على الخادم: production_formula_before)
    const pf = localFormulaOf(input.projectId);
    const formula: PoFormula | null = pf ? { kitRef: pf.ref, sampleId: pf.sampleId, code: pf.code, name: pf.name, concentration: pf.concentration, ingredients: pf.ingredients, approvedBy: pf.by, approvedAt: pf.approvedAt } : null;
    const o = wrap(() => newOrder(input, cfg, { ref: all.filter((x) => x.createdAt.startsWith(ym)).length + 1, batch: all.filter((x) => x.createdAt.startsWith(ymd)).length + 1 }, now, uid(), formula));
    write([o, ...all]);
    return o;
  },
  async save(id, patch, a) {
    guardManage(a);
    return put(wrap(() => applyPoPatch(find(id), patch, new Date())));
  },
  async step(id, stepId, done, a, note) {
    guardManage(a);
    return put(wrap(() => applyStep(find(id), stepId, done, a.name || a.id, new Date(), note)));
  },
  async issue(id, a) {
    guardManage(a);
    const o = find(id);
    const { issued, errors } = await issueStock(o, a);
    const next = { ...o, bom: o.bom.map((l) => (issued[l.id] ? { ...l, issued: Math.round((l.issued + issued[l.id]) * 1000) / 1000 } : l)), updatedAt: new Date().toISOString() };
    return { order: put(next), errors };
  },
  async cancel(id, a) {
    guardManage(a);
    const o = find(id);
    if (o.status === "released") throw new ValidationError("order_closed");
    return put({ ...o, status: "cancelled", updatedAt: new Date().toISOString() });
  },
};

// ─── Supabase ─────────────────────────────────────────────────────
type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v));
const nul = (v: unknown) => (v == null ? null : String(v));
const STATUSES: PoStatus[] = ["planned", "in_progress", "on_hold", "released", "cancelled"];
function fromRow(r: Row): ProductionOrder {
  const kind = r.kind === "packaging" ? "packaging" : "perfume";
  const steps = Array.isArray(r.steps) ? (r.steps as PoStep[]) : stepsFor(kind).map((s) => ({ id: s, done: false }));
  return {
    id: str(r.id),
    ref: str(r.ref),
    projectId: nul(r.project_id),
    projectTitle: str(r.project_title),
    kind,
    product: str(r.product),
    qty: Number(r.qty) || 0,
    fillMl: Number(r.fill_ml) || 0,
    concentration: (["edt", "edp", "extrait", "oil"] as const).find((c) => c === r.concentration) ?? "edp",
    oud: Boolean(r.oud),
    batchNo: str(r.batch_no),
    formulaRef: str(r.formula_ref),
    status: STATUSES.find((s) => s === r.status) ?? "planned",
    steps,
    bom: Array.isArray(r.bom) ? (r.bom as ProductionOrder["bom"]) : [],
    qc: Array.isArray(r.qc) ? (r.qc as ProductionOrder["qc"]) : [],
    docs: { ifra: "", sds: false, allergens: false, ghad: "", ...((r.docs as object) ?? {}) },
    macerationStart: nul(r.maceration_start),
    macerationDays: Number(r.maceration_days) || 0,
    deviation: str(r.deviation),
    goldenAt: nul(r.golden_at),
    goodUnits: r.good_units == null ? null : Number(r.good_units),
    rejects: r.rejects == null ? null : Number(r.rejects),
    dueAt: nul(r.due_at),
    note: str(r.note),
    releasedAt: nul(r.released_at),
    releasedBy: nul(r.released_by),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
    formula: poFormula(r.formula),
  };
}
function poFormula(v: unknown): PoFormula | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Row;
  if (!o.name) return null;
  return { kitRef: str(o.kit_ref), sampleId: str(o.sample_id), code: str(o.code), name: str(o.name), concentration: str(o.concentration), ingredients: (Array.isArray(o.ingredients) ? (o.ingredients as Row[]) : []).map((g) => ({ name: str(g.name), amount: Number(g.amount) || 0, unit: str(g.unit) || "%" })), approvedBy: o.approved_by === "team" ? "team" : "client", approvedAt: str(o.approved_at) };
}
const toRow = (o: ProductionOrder): Row => ({
  project_id: o.projectId,
  project_title: o.projectTitle,
  kind: o.kind,
  product: o.product,
  qty: o.qty,
  fill_ml: o.fillMl,
  concentration: o.concentration,
  oud: o.oud,
  formula_ref: o.formulaRef,
  status: o.status,
  steps: o.steps,
  bom: o.bom,
  qc: o.qc,
  docs: o.docs,
  maceration_start: o.macerationStart,
  maceration_days: o.macerationDays,
  deviation: o.deviation,
  golden_at: o.goldenAt,
  good_units: o.goodUnits,
  rejects: o.rejects,
  due_at: o.dueAt,
  note: o.note,
});

function remoteRepo(): ProductionRepo {
  const db = supabase!;
  const one = async (id: string) => {
    const { data, error } = await db.from("production_orders").select("*").eq("id", id).single();
    if (error) throw error;
    return fromRow(data as Row);
  };
  const persist = async (o: ProductionOrder) => {
    const { data, error } = await db.from("production_orders").update(toRow(o)).eq("id", o.id).select().single();
    if (error) throw /kit_|po_/.test(error.message) ? new ValidationError(error.message.match(/po_\w+/)?.[0]?.slice(3) ?? "order_closed") : error;
    return fromRow(data as Row);
  };
  return {
    async list() {
      const { data, error } = await db.from("production_orders").select("*").order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data as Row[]).map(fromRow);
    },
    async progress(projectIds) {
      const out: Record<string, PoProgress[]> = {};
      await Promise.all(
        projectIds.slice(0, 30).map(async (pid) => {
          const { data, error } = await db.rpc("production_progress", { p_project: pid });
          if (error || !Array.isArray(data)) return;
          out[pid] = (data as Row[]).map((r) => progressOf(fromRow({ ...r, project_id: pid })));
        }),
      );
      return out;
    },
    async create(input, cfg) {
      // المرجع ورقم التشغيلة يولّدهما الخادم؛ نرسل البقية كما يبنيها المنطق المحلي
      const draft = wrap(() => newOrder(input, cfg, { ref: 1, batch: 1 }, new Date(), "new"));
      const { data, error } = await db.from("production_orders").insert(toRow(draft)).select().single();
      if (error) throw error;
      return fromRow(data as Row);
    },
    async save(id, patch) {
      const cur = await one(id);
      return persist(wrap(() => applyPoPatch(cur, patch, new Date())));
    },
    async step(id, stepId, done, a, note) {
      const cur = await one(id);
      return persist(wrap(() => applyStep(cur, stepId, done, a.name || a.id, new Date(), note)));
    },
    async issue(id, a) {
      const o = await one(id);
      const { issued, errors } = await issueStock(o, a);
      const next = { ...o, bom: o.bom.map((l) => (issued[l.id] ? { ...l, issued: Math.round((l.issued + issued[l.id]) * 1000) / 1000 } : l)) };
      return { order: await persist(next), errors };
    },
    async cancel(id) {
      const o = await one(id);
      if (o.status === "released") throw new ValidationError("order_closed");
      return persist({ ...o, status: "cancelled" });
    },
  };
}
export const productionRepo: ProductionRepo = supabase ? remoteRepo() : localRepo;
