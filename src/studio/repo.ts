import { supabase } from "@/lib/supabase";
import { can, type Role } from "@/lib/rbac";
import { SEED_MODELS, SEED_SINCE, SEED_VERSION } from "./seed";
import type { NewPackModel, PackModel, ProfilePoint, Section } from "./types";
import { PermissionError } from "@/admin/data/types";

// كتالوج العبوات والأغطية: Supabase (جدول packaging_models) أو تخزين المتصفح في الوضع التجريبي

export interface StudioRepo {
  /** الكتالوج المنشور للعملاء والزوار */
  listPublished(): Promise<PackModel[]>;
  /** كل النماذج (للإدارة: studio.manage) */
  listAll(): Promise<PackModel[]>;
  create(m: NewPackModel, role: Role): Promise<PackModel>;
  update(id: string, patch: Partial<NewPackModel>, role: Role): Promise<void>;
  remove(id: string, role: Role): Promise<void>;
  /** يضيف أشكال البداية الناقصة من الكتالوج (الأطقم الجاهزة مبنية عليها) ويعيد عددها */
  importSeed(role: Role): Promise<number>;
}

// نفس نوع خطأ الصلاحيات في لوحة الإدارة — فتظهر رسالة الرفض الصحيحة
const guard = (role: Role) => {
  if (!can(role, "studio.manage")) throw new PermissionError("studio.manage");
};
const sortModels = (xs: PackModel[]) => [...xs].sort((a, b) => a.kind.localeCompare(b.kind) || a.sort - b.sort || a.createdAt.localeCompare(b.createdAt));

/** أشكال البذرة غير الموجودة في الكتالوج الحالي */
export const missingSeed = (cur: PackModel[]) => SEED_MODELS.filter((m) => !cur.some((x) => x.id === m.id));

// ─── الوضع التجريبي ───────────────────────────────────────────────
const KEY = "pp_studio_v1";
const SEED_KEY = "pp_studio_seed_v";
function read(): PackModel[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const stored = JSON.parse(raw) as PackModel[];
      // كتالوج مخزَّن من إصدار أقدم: تُضاف الأشكال الجديدة مرة واحدة (ما حذفه المدير من القديم لا يعود)
      const seen = Number(localStorage.getItem(SEED_KEY) || 1);
      if (seen >= SEED_VERSION) return stored;
      const have = new Set(stored.map((m) => m.id));
      const merged = [...stored, ...SEED_MODELS.filter((m) => (SEED_SINCE[m.id] ?? 1) > seen && !have.has(m.id))];
      localStorage.setItem(KEY, JSON.stringify(merged));
      localStorage.setItem(SEED_KEY, String(SEED_VERSION));
      return merged;
    }
  } catch {
    /* نعيد البذر */
  }
  return SEED_MODELS;
}
function write(xs: PackModel[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(xs));
    localStorage.setItem(SEED_KEY, String(SEED_VERSION));
  } catch {
    throw new Error("storage_full");
  }
}

const localRepo: StudioRepo = {
  async listPublished() {
    return sortModels(read().filter((m) => m.published));
  },
  async listAll() {
    return sortModels(read());
  },
  async create(m, role) {
    guard(role);
    const now = new Date().toISOString();
    const model: PackModel = { ...m, id: `${m.kind === "bottle" ? "B" : "C"}-${Date.now().toString(36).toUpperCase()}`, createdAt: now, updatedAt: now };
    write([...read(), model]);
    return model;
  },
  async update(id, patch, role) {
    guard(role);
    write(read().map((m) => (m.id === id ? { ...m, ...patch, updatedAt: new Date().toISOString() } : m)));
  },
  async remove(id, role) {
    guard(role);
    write(read().filter((m) => m.id !== id));
  },
  async importSeed(role) {
    guard(role);
    const cur = read();
    const missing = missingSeed(cur);
    if (missing.length) write([...cur, ...missing]);
    return missing.length;
  },
};

// ─── Supabase ────────────────────────────────────────────────────
type Row = Record<string, unknown>;
const fromRow = (r: Row): PackModel => ({
  id: String(r.id),
  kind: r.kind as PackModel["kind"],
  name: { ar: String(r.name_ar), en: String(r.name_en || r.name_ar) },
  capacityMl: r.capacity_ml == null ? null : Number(r.capacity_ml),
  heightMm: Number(r.height_mm),
  neckMm: Number(r.neck_mm ?? 0),
  profile: r.profile as ProfilePoint[],
  section: r.section as Section,
  depthRatio: Number(r.depth_ratio ?? 1),
  squareness: Number(r.squareness ?? 2),
  thumb: (r.thumb as string) ?? null,
  source: r.source === "ai" ? "ai" : "profile",
  glbUrl: (r.glb_url as string) ?? null,
  usdzUrl: (r.usdz_url as string) ?? null,
  published: Boolean(r.published),
  sort: Number(r.sort ?? 0),
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
});
const toRow = (m: Partial<NewPackModel>): Row => {
  const r: Row = {};
  if (m.kind) r.kind = m.kind;
  if (m.name) {
    r.name_ar = m.name.ar;
    r.name_en = m.name.en;
  }
  if (m.capacityMl !== undefined) r.capacity_ml = m.capacityMl;
  if (m.heightMm !== undefined) r.height_mm = m.heightMm;
  if (m.neckMm !== undefined) r.neck_mm = m.neckMm;
  if (m.profile) r.profile = m.profile;
  if (m.section) r.section = m.section;
  if (m.depthRatio !== undefined) r.depth_ratio = m.depthRatio;
  if (m.squareness !== undefined) r.squareness = m.squareness;
  if (m.thumb !== undefined) r.thumb = m.thumb;
  if (m.source !== undefined) r.source = m.source;
  if (m.glbUrl !== undefined) r.glb_url = m.glbUrl;
  if (m.usdzUrl !== undefined) r.usdz_url = m.usdzUrl;
  if (m.published !== undefined) r.published = m.published;
  if (m.sort !== undefined) r.sort = m.sort;
  return r;
};

function remoteRepo(): StudioRepo {
  const db = supabase!;
  const fail = (e: { message: string } | null) => {
    if (!e) return;
    if (/row-level security|permission/i.test(e.message)) throw new PermissionError("studio.manage");
    throw new Error(e.message);
  };
  return {
    async listPublished() {
      const { data, error } = await db.from("packaging_models").select("*").eq("published", true).order("kind").order("sort");
      fail(error);
      return (data ?? []).map(fromRow);
    },
    async listAll() {
      const { data, error } = await db.from("packaging_models").select("*").order("kind").order("sort");
      fail(error);
      return (data ?? []).map(fromRow);
    },
    async create(m) {
      const { data, error } = await db.from("packaging_models").insert(toRow(m)).select().single();
      fail(error);
      return fromRow(data as Row);
    },
    async update(id, patch) {
      const { error, count } = await db.from("packaging_models").update(toRow(patch), { count: "exact" }).eq("id", id);
      fail(error);
      if (count === 0) throw new PermissionError("studio.manage");
    },
    async remove(id) {
      const { error, count } = await db.from("packaging_models").delete({ count: "exact" }).eq("id", id);
      fail(error);
      if (count === 0) throw new PermissionError("studio.manage");
    },
    async importSeed() {
      const { data, error } = await db.from("packaging_models").select("id");
      fail(error);
      const have = new Set((data ?? []).map((r) => String((r as Row).id)));
      const rows = SEED_MODELS.filter((m) => !have.has(m.id)).map((m) => ({ id: m.id, ...toRow(m) }));
      if (rows.length) fail((await db.from("packaging_models").insert(rows)).error);
      return rows.length;
    },
  };
}

export const studioRepo: StudioRepo = supabase ? remoteRepo() : localRepo;
