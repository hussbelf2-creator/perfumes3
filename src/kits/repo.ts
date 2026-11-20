import { supabase } from "@/lib/supabase";
import { can } from "@/lib/rbac";
import { PermissionError, ValidationError } from "@/admin/data/types";
import { localContractSigned, localSetFormula, type PActor } from "@/projects/repo";
import { inventoryRepo } from "@/inventory/repo";
import { CARRIERS, KIT_REF_RE, addressOpen, applyDecisions, canDecide, cleanAddress, isDisclosure, isKitStatus, mergeTeamSamples, revealAmounts, sampleTotals, samplesView, sanitizeSamples, trackingUrlFor, type KitAddress, type KitDecisionInput, type KitDraft, type KitIssue, type KitOrder, type KitPatch, type KitSample, type KitSheet, type KitStatus, type KitTrack } from "./types";
import type { ProjectFormula } from "@/projects/types";

// شحنات العينات: في Supabase الجدول kit_orders ومُشغّلاته (السجل، التواريخ، المهمة)، والوضع التجريبي يطبّق القواعد نفسها محلياً.

export interface KitsRepo {
  /** كل الشحنات للفريق (inventory.view أو payments.view) */
  list(a: PActor): Promise<KitOrder[]>;
  /** شحنات العميل الحالي ببريده */
  mine(a: PActor): Promise<KitOrder[]>;
  /** تتبع عام برقم الطلب، بلا دخول وبلا بيانات شخصية */
  track(ref: string): Promise<KitTrack | null>;
  /** تغيير الحالة أو بيانات الشحن؛ مع «شُحن» تُصرف مواد العينة من المخزون */
  update(id: string, patch: KitPatch, issues: KitIssue[], a: PActor): Promise<{ order: KitOrder; issueErrors: string[] }>;
  /** جولة عينات جديدة يسمّيها العطّار ويكتب مكوّناتها */
  create(draft: KitDraft, a: PActor): Promise<KitOrder>;
  /** ورقة العينات لحامل الرمز (من QR)، بلا دخول */
  sheet(ref: string, token: string): Promise<KitSheet | null>;
  /** العميل يؤكد عنوان التسليم وموقعه قبل الشحن */
  setAddress(ref: string, token: string, addr: KitAddress & { name?: string }): Promise<KitSheet>;
  /** العميل يقبل أو يرفض كل عينة باسمها */
  decide(ref: string, token: string, decisions: KitDecisionInput[]): Promise<KitSheet>;
  /** العميل يعتمد عينة قبلها تركيبةً نهائية لمشروعه */
  approve(ref: string, token: string, sampleId: string): Promise<KitSheet>;
  /** الفريق يثبّت عينة تركيبةً للمشروع (اعتماد هاتفي مثلاً)؛ لا تُثبَّت عينة رفضها العميل */
  setFormula(orderId: string, sampleId: string, a: PActor): Promise<void>;
}

const canView = (a: PActor) => can(a.role, "inventory.view") || can(a.role, "payments.view");
const canManage = (a: PActor) => can(a.role, "inventory.manage") || can(a.role, "crm.edit");
const now = () => new Date().toISOString();

export function checkPatch(p: KitPatch) {
  if (p.status !== undefined && !isKitStatus(p.status)) throw new ValidationError("status");
  if (p.carrier !== undefined && p.carrier.trim().length > 40) throw new ValidationError("carrier");
  if (p.trackingNo !== undefined && p.trackingNo.trim().length > 60) throw new ValidationError("tracking_no");
  if (p.trackingUrl !== undefined && p.trackingUrl.trim() && !/^https:\/\/.{1,490}$/.test(p.trackingUrl.trim())) throw new ValidationError("tracking_url");
  if (p.note !== undefined && p.note.length > 500) throw new ValidationError("note");
  if (p.samples !== undefined && p.samples.some((x) => !x.name.trim())) throw new ValidationError("sample_name");
  if (p.samples !== undefined && p.samples.length > 24) throw new ValidationError("too_many_samples");
  if (p.disclosure !== undefined && !isDisclosure(p.disclosure)) throw new ValidationError("disclosure");
}
const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
export function checkDraft(d: KitDraft) {
  if (!isEmail(d.email.trim())) throw new ValidationError("client_email");
  if (!d.samples.length) throw new ValidationError("kit_no_samples");
  if (d.samples.some((x) => !x.name.trim())) throw new ValidationError("sample_name");
  if (d.samples.length > 24) throw new ValidationError("too_many_samples");
}
const newToken = () => {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
};
const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const newRoundRef = () => {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return "SMP-" + Array.from(b, (x) => REF_ALPHABET[x % REF_ALPHABET.length]).join("");
};

const issueNote = (ref: string) => `صرف عينة ${ref}`;
async function issueStock(ref: string, issues: KitIssue[], a: PActor) {
  const errors: string[] = [];
  for (const i of issues) {
    if (!(i.qty > 0)) continue;
    try {
      await inventoryRepo.addMove({ itemId: i.itemId, kind: "issue", qty: i.qty, note: issueNote(ref) }, a);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "issue_failed");
    }
  }
  return errors;
}

// ─── الوضع التجريبي ───────────────────────────────────────────────
const KEY = "pp_kits_v1";
interface LocalState {
  orders: KitOrder[];
  seeded: boolean;
  samplesSeeded?: boolean;
}
function read(): LocalState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as LocalState;
      if (Array.isArray(s.orders)) return s;
    }
  } catch {
    /* نبدأ فارغاً */
  }
  return { orders: [], seeded: false };
}
function write(s: LocalState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    throw new ValidationError("storage_full");
  }
}
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`);

/** طلب عينة (lead) → شحنة بالبيانات نفسها التي يأخذها المُشغّل على الخادم */
export function orderFromLead(l: { id: string; contactId: string | null; payload: Record<string, string>; createdAt: string }): KitOrder | null {
  const ref = (l.payload.order_ref || "").trim().toUpperCase();
  const email = (l.payload.email || "").trim().toLowerCase();
  if (!KIT_REF_RE.test(ref) || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return null;
  const country = (l.payload.country || "").toUpperCase();
  return {
    id: uid(),
    ref,
    leadId: l.id,
    contactId: l.contactId,
    email,
    phone: (l.payload.phone || "").slice(0, 30),
    name: [l.payload.firstName, l.payload.lastName].filter(Boolean).join(" ").trim().slice(0, 120),
    country: /^[A-Z]{2}$/.test(country) ? country : "",
    city: (l.payload.city || "").slice(0, 60),
    address: (l.payload.address || "").slice(0, 300),
    directions: (l.payload.directions || "").slice(0, 300),
    status: "new",
    carrier: "",
    trackingNo: "",
    trackingUrl: "",
    note: "",
    history: [{ status: "new", at: l.createdAt, by: null }],
    shippedAt: null,
    deliveredAt: null,
    createdAt: l.createdAt,
    updatedAt: l.createdAt,
    ...blank(),
    ...geoFromPayload(l.payload),
  };
}
/** الحقول المضافة مع العينات المسمّاة: قيمها الابتدائية (والسجلات القديمة تُستكمل بها) */
const blank = () => ({ kind: "kit" as const, projectId: null, samples: [] as KitSample[], district: "", street: "", building: "", postal: "", shortAddress: "", lat: null, lng: null, token: newToken(), decidedAt: null, addressConfirmedAt: null, disclosure: "contract" as const, approvedSample: null, approvedAt: null });
function geoFromPayload(p: Record<string, string>) {
  const a = cleanAddress({ country: p.country, city: p.city, district: p.district, street: p.street, building: p.building, postal: p.postal, shortAddress: p.short_address, lat: p.lat ? Number(p.lat) : null, lng: p.lng ? Number(p.lng) : null });
  return { district: a.district, street: a.street, building: a.building, postal: a.postal, shortAddress: a.shortAddress, lat: a.lat ?? null, lng: a.lng ?? null };
}
const normalize = (o: KitOrder): KitOrder => (typeof o.token === "string" && o.token.length >= 16 && Array.isArray(o.samples) && isDisclosure(o.disclosure) ? o : { ...blank(), ...o, samples: Array.isArray(o.samples) ? o.samples : [], token: typeof o.token === "string" && o.token.length >= 16 ? o.token : newToken() });

/** محاكاة المُشغّل kit_order_guard: السجل والتواريخ وشرط شركة الشحن */
export function applyPatch(o: KitOrder, p: KitPatch, by: string | null, at = now()): KitOrder {
  checkPatch(p);
  const next: KitOrder = { ...o, carrier: (p.carrier ?? o.carrier).trim(), trackingNo: (p.trackingNo ?? o.trackingNo).trim(), trackingUrl: (p.trackingUrl ?? o.trackingUrl).trim(), note: p.note ?? o.note, updatedAt: at };
  if (p.samples !== undefined) next.samples = mergeTeamSamples(o.samples, p.samples);
  if (p.disclosure !== undefined) next.disclosure = p.disclosure;
  if (p.name !== undefined) next.name = p.name.trim().slice(0, 120);
  if (p.phone !== undefined) next.phone = p.phone.trim().slice(0, 30);
  if (p.directions !== undefined) next.directions = p.directions.trim().slice(0, 300);
  if (p.city !== undefined || p.street !== undefined || p.district !== undefined || p.lat !== undefined || p.shortAddress !== undefined || p.address !== undefined || p.building !== undefined || p.postal !== undefined || p.country !== undefined) {
    const a = cleanAddress({ country: p.country ?? o.country, city: p.city ?? o.city, district: p.district ?? o.district, street: p.street ?? o.street, building: p.building ?? o.building, postal: p.postal ?? o.postal, shortAddress: p.shortAddress ?? o.shortAddress, address: p.address ?? o.address, lat: p.lat === undefined ? o.lat : p.lat, lng: p.lng === undefined ? o.lng : p.lng });
    Object.assign(next, a, { country: a.country || o.country });
  }
  const status: KitStatus = p.status ?? o.status;
  if (status === "shipped" && !next.carrier) throw new ValidationError("kit_order_carrier_required");
  if (status !== o.status) {
    if (o.history.length >= 40) throw new ValidationError("kit_order_history_full");
    next.status = status;
    next.history = [...o.history, { status, at, by }];
    if (status === "shipped") next.shippedAt = at;
    if (status === "delivered") {
      next.deliveredAt = at;
      next.shippedAt = next.shippedAt ?? at;
    }
  }
  return next;
}

/** نص النشاط على سجل العميل عند انتقال الحالة (مطابق لـ kit_order_after) */
export function eventBody(o: KitOrder): string {
  switch (o.status) {
    case "preparing":
      return `عينة ${o.ref} قيد التجهيز`;
    case "shipped":
      return `شُحنت عينة ${o.ref} عبر ${o.carrier}${o.trackingNo ? ` · ${o.trackingNo}` : ""}`;
    case "delivered":
      return `سُلِّمت عينة ${o.ref}`;
    case "returned":
      return `ارتدّت عينة ${o.ref}`;
    default:
      return `عينة ${o.ref}: ${o.status}`;
  }
}
export const FOLLOW_UP_DAYS = 3;
export const followUpTask = (o: KitOrder, at = new Date()) => ({ title: `ادعُ العميل لحجز مكالمة بعد تجربة عينة ${o.ref}`, dueAt: new Date(at.getTime() + FOLLOW_UP_DAYS * 86_400_000).toISOString() });

/** محاكاة kit_set_address: قبل الشحن فقط، والمدينة لازمة */
export function applyAddress(o: KitOrder, addr: KitAddress & { name?: string }, at = now()): KitOrder {
  if (!addressOpen(o.status)) throw new ValidationError("kit_address_locked");
  const a = cleanAddress(addr);
  if (!a.city) throw new ValidationError("kit_city_required");
  const name = (addr.name ?? "").trim().slice(0, 120);
  return { ...o, ...a, country: a.country || o.country, name: name || o.name, addressConfirmedAt: at, updatedAt: at };
}
/** محاكاة kit_decide: بعد الشحن، والتقييم يثبت الوصول */
export function applyDecide(o: KitOrder, decisions: KitDecisionInput[], at = now()): KitOrder {
  if (!canDecide(o.status)) throw new ValidationError("kit_not_shipped");
  if (!decisions.length) throw new ValidationError("kit_decisions_required");
  if (!o.samples.length) throw new ValidationError("kit_no_samples");
  const delivered = o.status === "delivered" ? o : applyPatch(o, { status: "delivered" }, null, at);
  return { ...delivered, samples: applyDecisions(o.samples, decisions, at), decidedAt: at, updatedAt: at };
}
export const decisionTask = (o: KitOrder, at = new Date()) => {
  const n = sampleTotals(o.samples);
  return { title: `راجع تقييم العميل لعينات ${o.ref} (مقبول ${n.accepted}، مرفوض ${n.rejected})`, dueAt: new Date(at.getTime() + 86_400_000).toISOString() };
};

/** الشحنة كما يراها العميل: العينات حسب مفتاح الإفصاح، بلا الملاحظة الداخلية */
const signedFor = (o: KitOrder) => localContractSigned(o.projectId);
const clientView = (o: KitOrder): KitOrder => ({ ...o, note: "", samples: samplesView(o.samples, o.disclosure, signedFor(o)), amounts: revealAmounts(o.disclosure, signedFor(o)) });
const toSheet = (o: KitOrder): KitSheet => ({ ...toTrack(o), kind: o.kind, name: o.name, directions: o.directions, country: o.country, district: o.district, street: o.street, building: o.building, postal: o.postal, shortAddress: o.shortAddress, address: o.address, lat: o.lat ?? null, lng: o.lng ?? null, samples: samplesView(o.samples, o.disclosure, signedFor(o)), decidedAt: o.decidedAt ?? null, addressConfirmedAt: o.addressConfirmedAt ?? null, disclosure: o.disclosure, amounts: revealAmounts(o.disclosure, signedFor(o)), hasProject: !!o.projectId, approvedSample: o.approvedSample ?? null, approvedAt: o.approvedAt ?? null });

/** محاكاة kit_approve: عينة قبلها العميل، بعد الشحن */
export function applyApprove(o: KitOrder, sampleId: string, by: "client" | "team", at = now()): KitOrder {
  const smp = o.samples.find((x) => x.id === sampleId);
  if (!smp) throw new ValidationError("kit_sample_not_found");
  if (by === "client") {
    if (!canDecide(o.status)) throw new ValidationError("kit_not_shipped");
    if (smp.decision !== "accepted") throw new ValidationError("kit_sample_not_accepted");
  } else {
    if (!o.projectId) throw new ValidationError("kit_no_project");
    if (smp.decision === "rejected") throw new ValidationError("kit_sample_rejected");
  }
  return { ...o, approvedSample: sampleId, approvedAt: at, updatedAt: at };
}
/** التركيبة الكاملة من العينة المعتمدة */
export function formulaOf(o: KitOrder, by: "client" | "team"): ProjectFormula | null {
  const smp = o.samples.find((x) => x.id === o.approvedSample);
  if (!smp || !o.projectId) return null;
  return { projectId: o.projectId, ref: o.ref, sampleId: smp.id, code: smp.code, name: smp.name, concentration: smp.concentration, notes: smp.notes, ingredients: smp.ingredients.map((g) => ({ name: g.name, amount: g.amount, unit: g.unit })), approvedAt: o.approvedAt ?? now(), by };
}
async function approveLocal(s: LocalState, o: KitOrder, sampleId: string, by: "client" | "team", actorId: string | null): Promise<KitOrder> {
  const next = applyApprove(o, sampleId, by);
  s.orders = s.orders.map((x) => (x.id === o.id ? next : x));
  write(s);
  const f = formulaOf(next, by);
  const project = f ? localSetFormula(f) : null;
  if (f && project) {
    const { demoKitEvent } = await import("@/admin/data/localRepo");
    demoKitEvent(next.contactId ?? project.contactId ?? null, `تركيبة معتمدة لمشروع «${project.title}»: ${f.name} (${next.ref})`, { title: `تركيبة معتمدة لمشروع «${project.title}» (${f.name}): جهّز الخطوة التالية وأمر الإنتاج`, dueAt: new Date(Date.now() + 86_400_000).toISOString() }, actorId);
  }
  return next;
}

const DEMO_SAMPLES = (): KitSample[] => [
  { id: "demo-a", code: "A", name: "عود الليل", concentration: "EDP 20% · 5 مل", notes: "قاعدة عود دافئة مع لمسة زعفران في القمة", ingredients: [{ name: "عود كمبودي", amount: 4, unit: "%" }, { name: "زعفران", amount: 1.5, unit: "%" }, { name: "عنبر", amount: 6, unit: "%" }, { name: "مسك أبيض", amount: 8.5, unit: "%" }, { name: "كحول عطري", amount: 80, unit: "%" }] },
  { id: "demo-b", code: "B", name: "ورد الطائف", concentration: "EDP 18% · 5 مل", notes: "ورد طائفي على قاعدة مسك ناعمة", ingredients: [{ name: "ورد طائفي", amount: 5, unit: "%" }, { name: "ليتشي", amount: 2, unit: "%" }, { name: "باتشولي", amount: 3, unit: "%" }, { name: "مسك أبيض", amount: 8, unit: "%" }, { name: "كحول عطري", amount: 82, unit: "%" }] },
  { id: "demo-c", code: "C", name: "أرز وجلد", concentration: "EDP 18% · 5 مل", notes: "خشبي جاف بلمسة جلدية", ingredients: [{ name: "خشب الأرز", amount: 6, unit: "%" }, { name: "جلد", amount: 2.5, unit: "%" }, { name: "فيتيفر", amount: 3.5, unit: "%" }, { name: "برغموت", amount: 6, unit: "%" }, { name: "كحول عطري", amount: 82, unit: "%" }] },
];

const toTrack = (o: KitOrder): KitTrack => ({ ref: o.ref, status: o.status, city: o.city, carrier: o.carrier, trackingNo: o.trackingNo, trackingUrl: o.trackingUrl || trackingUrlFor(o.carrier, o.trackingNo), createdAt: o.createdAt, shippedAt: o.shippedAt, deliveredAt: o.deliveredAt, history: o.history.map((h) => ({ status: h.status, at: h.at })) });

/** يضيف شحنات لطلبات العينة التي لم تُسجَّل بعد؛ وفي أول مرة يلوّن البيانات التجريبية بحالات متنوعة */
async function sync(): Promise<LocalState> {
  const s = read();
  const before = JSON.stringify(s.orders.map((o) => o.token ?? ""));
  s.orders = s.orders.map(normalize);
  const { demoKitLeads } = await import("@/admin/data/localRepo");
  const leads = demoKitLeads();
  const seen = new Set(s.orders.map((o) => o.ref));
  const fresh = leads.map(orderFromLead).filter((o): o is KitOrder => !!o && !seen.has(o.ref));
  fresh.forEach((o) => seen.add(o.ref));
  let changed = fresh.length > 0 || before !== JSON.stringify(s.orders.map((o) => o.token));
  // العينات المسمّاة للعرض: شحنة العميل التجريبي تحمل ثلاث عينات بمكوّناتها، وجولة عينات تنتظر تأكيد العنوان
  if (s.seeded && !s.samplesSeeded) {
    const demo = s.orders.find((o) => o.ref === "KIT-DEMO01");
    if (demo && !demo.samples.length) demo.samples = DEMO_SAMPLES();
    if (!seen.has("SMP-DEMO01")) {
      fresh.push(demoRound());
      seen.add("SMP-DEMO01");
    }
    s.samplesSeeded = true;
    changed = true;
  }
  if (!s.seeded) {
    // عرض حي للصفحة: الطلبات المدفوعة القديمة تتقدّم في المسار، وشحنة للعميل التجريبي
    const demo = [...fresh].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const plan: [KitStatus, string, string][] = [
      ["delivered", "SMSA", "290123456789"],
      ["shipped", "Aramex", "44871234567"],
      ["preparing", "", ""],
    ];
    demo.slice(0, plan.length).forEach((o, i) => {
      const [status, carrier, no] = plan[i];
      const t0 = new Date(o.createdAt).getTime();
      let cur = applyPatch(o, { status: "preparing" }, null, new Date(t0 + 6 * 3_600_000).toISOString());
      if (status === "shipped" || status === "delivered") cur = applyPatch(cur, { status: "shipped", carrier, trackingNo: no, trackingUrl: trackingUrlFor(carrier, no) }, null, new Date(t0 + 30 * 3_600_000).toISOString());
      if (status === "delivered") cur = applyPatch(cur, { status: "delivered" }, null, new Date(t0 + 78 * 3_600_000).toISOString());
      Object.assign(o, cur);
    });
    if (!seen.has("KIT-DEMO01")) {
      const t0 = Date.now() - 2 * 86_400_000;
      let o: KitOrder = { id: uid(), ref: "KIT-DEMO01", leadId: null, contactId: null, email: "client@demo.local", phone: "0551234567", name: "عميل تجريبي", country: "SA", city: "Riyadh", address: "حي الياسمين", directions: "عودي · زهري · خشبي", status: "new", carrier: "", trackingNo: "", trackingUrl: "", note: "", history: [{ status: "new", at: new Date(t0).toISOString(), by: null }], shippedAt: null, deliveredAt: null, createdAt: new Date(t0).toISOString(), updatedAt: new Date(t0).toISOString(), ...blank(), district: "الياسمين", samples: DEMO_SAMPLES(), token: "demo0000demo0000demo0000demo0001" };
      o = applyPatch(o, { status: "preparing" }, null, new Date(t0 + 5 * 3_600_000).toISOString());
      o = applyPatch(o, { status: "shipped", carrier: "SMSA", trackingNo: "290987654321", trackingUrl: trackingUrlFor("SMSA", "290987654321") }, null, new Date(t0 + 26 * 3_600_000).toISOString());
      fresh.push(o);
    }
    if (!seen.has("SMP-DEMO01")) fresh.push(demoRound());
    s.seeded = true;
    s.samplesSeeded = true;
    changed = true;
  }
  if (changed) {
    s.orders = [...fresh, ...s.orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    write(s);
  }
  return s;
}

function demoRound(): KitOrder {
  const at = new Date(Date.now() - 6 * 3_600_000).toISOString();
  return {
    id: uid(), ref: "SMP-DEMO01", leadId: null, contactId: null, email: "client@demo.local", phone: "0551234567", name: "عميل تجريبي", country: "SA", city: "Riyadh", address: "", directions: "الجولة الثانية بعد ملاحظاتك على عود الليل",
    status: "preparing", carrier: "", trackingNo: "", trackingUrl: "", note: "", history: [{ status: "new", at, by: null }, { status: "preparing", at, by: null }], shippedAt: null, deliveredAt: null, createdAt: at, updatedAt: at,
    ...blank(), kind: "round", token: "demo0000demo0000demo0000demo0002",
    samples: [
      { id: "r2-a", code: "A", name: "عود الليل · أخف", concentration: "EDP 18% · 5 مل", notes: "خفّضنا العود ورفعنا المسك كما طلبت", ingredients: [{ name: "عود كمبودي", amount: 2.5, unit: "%" }, { name: "زعفران", amount: 1.5, unit: "%" }, { name: "عنبر", amount: 5, unit: "%" }, { name: "مسك أبيض", amount: 9, unit: "%" }, { name: "كحول عطري", amount: 82, unit: "%" }] },
      { id: "r2-b", code: "B", name: "عود الليل · بالورد", concentration: "EDP 18% · 5 مل", notes: "أضفنا وردًا طائفيًا في القلب", ingredients: [{ name: "عود كمبودي", amount: 3, unit: "%" }, { name: "ورد طائفي", amount: 3, unit: "%" }, { name: "عنبر", amount: 4, unit: "%" }, { name: "مسك أبيض", amount: 8, unit: "%" }, { name: "كحول عطري", amount: 82, unit: "%" }] },
    ],
  };
}
const findByToken = (s: LocalState, ref: string, token: string) => s.orders.find((x) => x.ref === ref.trim().toUpperCase() && token.length >= 16 && x.token === token);

const localRepo: KitsRepo = {
  async create(draft, a) {
    if (!canManage(a)) throw new PermissionError("inventory.manage");
    checkDraft(draft);
    const s = await sync();
    const at = now();
    const addr = cleanAddress(draft);
    const o: KitOrder = {
      id: uid(), ref: newRoundRef(), leadId: null, contactId: draft.contactId ?? null, email: draft.email.trim().toLowerCase(), phone: draft.phone.trim().slice(0, 30), name: draft.name.trim().slice(0, 120),
      directions: (draft.directions ?? "").trim().slice(0, 300), status: "new", carrier: "", trackingNo: "", trackingUrl: "", note: "", history: [{ status: "new", at, by: a.id }], shippedAt: null, deliveredAt: null, createdAt: at, updatedAt: at,
      ...blank(), ...addr, kind: "round", projectId: draft.projectId ?? null, samples: mergeTeamSamples([], draft.samples), disclosure: draft.disclosure && isDisclosure(draft.disclosure) ? draft.disclosure : "contract",
    };
    s.orders = [o, ...s.orders];
    write(s);
    return o;
  },
  async sheet(ref, token) {
    const o = findByToken(await sync(), ref, token);
    return o ? toSheet(o) : null;
  },
  async setAddress(ref, token, addr) {
    const s = await sync();
    const o = findByToken(s, ref, token);
    if (!o) throw new ValidationError("not_found");
    const next = applyAddress(o, addr);
    s.orders = s.orders.map((x) => (x.id === o.id ? next : x));
    write(s);
    return toSheet(next);
  },
  async decide(ref, token, decisions) {
    const s = await sync();
    const o = findByToken(s, ref, token);
    if (!o) throw new ValidationError("not_found");
    const next = applyDecide(o, decisions);
    s.orders = s.orders.map((x) => (x.id === o.id ? next : x));
    write(s);
    const { demoKitEvent } = await import("@/admin/data/localRepo");
    const n = sampleTotals(next.samples);
    demoKitEvent(next.contactId ?? null, `قيّم العميل عينات ${next.ref}: مقبول ${n.accepted}، مرفوض ${n.rejected}`, decisionTask(next), null);
    return toSheet(next);
  },
  async approve(ref, token, sampleId) {
    const s = await sync();
    const o = findByToken(s, ref, token);
    if (!o) throw new ValidationError("not_found");
    return toSheet(await approveLocal(s, o, sampleId, "client", null));
  },
  async setFormula(orderId, sampleId, a) {
    if (!(can(a.role, "inventory.manage") || can(a.role, "projects.manage"))) throw new PermissionError("projects.manage");
    const s = await sync();
    const o = s.orders.find((x) => x.id === orderId);
    if (!o) throw new ValidationError("not_found");
    await approveLocal(s, o, sampleId, "team", a.id);
  },
  async list(a) {
    if (!canView(a)) throw new PermissionError("inventory.view");
    return (await sync()).orders;
  },
  async mine(a) {
    const e = a.email.toLowerCase();
    return (await sync()).orders.filter((o) => o.email === e).map(clientView);
  },
  async track(ref) {
    const o = (await sync()).orders.find((x) => x.ref === ref.trim().toUpperCase());
    return o ? toTrack(o) : null;
  },
  async update(id, patch, issues, a) {
    if (!canManage(a)) throw new PermissionError("inventory.manage");
    const s = await sync();
    const o = s.orders.find((x) => x.id === id);
    if (!o) throw new ValidationError("not_found");
    const next = applyPatch(o, patch, a.id);
    s.orders = s.orders.map((x) => (x.id === id ? next : x));
    write(s);
    if (next.status !== o.status) {
      const { demoKitEvent } = await import("@/admin/data/localRepo");
      demoKitEvent(next.contactId ?? null, eventBody(next), next.status === "delivered" ? followUpTask(next) : null, a.id);
    }
    const issueErrors = next.status === "shipped" && o.status !== "shipped" ? await issueStock(next.ref, issues, a) : [];
    return { order: next, issueErrors };
  },
};

// ─── Supabase ─────────────────────────────────────────────────────
type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v));
function fromRow(r: Row): KitOrder {
  const hist = Array.isArray(r.history) ? (r.history as Row[]) : [];
  return {
    id: str(r.id),
    ref: str(r.ref),
    leadId: (r.lead_id as string | null) ?? null,
    contactId: (r.contact_id as string | null) ?? null,
    email: str(r.email),
    phone: str(r.phone),
    name: str(r.name),
    country: str(r.country),
    city: str(r.city),
    address: str(r.address),
    directions: str(r.directions),
    status: isKitStatus(r.status) ? r.status : "new",
    carrier: str(r.carrier),
    trackingNo: str(r.tracking_no),
    trackingUrl: str(r.tracking_url),
    note: str(r.note),
    history: hist.filter((h) => isKitStatus(h.status)).map((h) => ({ status: h.status as KitStatus, at: str(h.at), by: (h.by as string | null) ?? null })),
    shippedAt: (r.shipped_at as string | null) ?? null,
    deliveredAt: (r.delivered_at as string | null) ?? null,
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
    kind: r.kind === "round" ? "round" : "kit",
    projectId: (r.project_id as string | null) ?? null,
    samples: sanitizeSamples(r.samples),
    district: str(r.district),
    street: str(r.street),
    building: str(r.building),
    postal: str(r.postal),
    shortAddress: str(r.short_address),
    lat: r.lat == null ? null : Number(r.lat),
    lng: r.lng == null ? null : Number(r.lng),
    token: str(r.token),
    decidedAt: (r.decided_at as string | null) ?? null,
    addressConfirmedAt: (r.address_confirmed_at as string | null) ?? null,
    disclosure: isDisclosure(r.disclosure) ? r.disclosure : "contract",
    approvedSample: (r.approved_sample as string | null) ?? null,
    approvedAt: (r.approved_at as string | null) ?? null,
    ...(typeof r.amounts === "boolean" ? { amounts: r.amounts } : {}),
  };
}
const samplesRow = (list: KitSample[]) => list.map((x) => ({ id: x.id, code: x.code, name: x.name, concentration: x.concentration, notes: x.notes, ingredients: x.ingredients }));
const addrRow = (a: KitAddress) => ({ country: a.country, city: a.city, district: a.district, street: a.street, building: a.building, postal: a.postal, short_address: a.shortAddress, address: a.address, lat: a.lat ?? null, lng: a.lng ?? null });
function sheetFromRow(r: Row): KitSheet {
  const hist = Array.isArray(r.history) ? (r.history as Row[]) : [];
  return {
    ref: str(r.ref), status: isKitStatus(r.status) ? r.status : "new", city: str(r.city), carrier: str(r.carrier), trackingNo: str(r.tracking_no), trackingUrl: str(r.tracking_url) || trackingUrlFor(str(r.carrier), str(r.tracking_no)),
    createdAt: str(r.created_at), shippedAt: (r.shipped_at as string | null) ?? null, deliveredAt: (r.delivered_at as string | null) ?? null, history: hist.filter((h) => isKitStatus(h.status)).map((h) => ({ status: h.status as KitStatus, at: str(h.at) })),
    kind: r.kind === "round" ? "round" : "kit", name: str(r.name), directions: str(r.directions), country: str(r.country), district: str(r.district), street: str(r.street), building: str(r.building), postal: str(r.postal), shortAddress: str(r.short_address), address: str(r.address),
    lat: r.lat == null ? null : Number(r.lat), lng: r.lng == null ? null : Number(r.lng), samples: sanitizeSamples(r.samples), decidedAt: (r.decided_at as string | null) ?? null, addressConfirmedAt: (r.address_confirmed_at as string | null) ?? null,
    disclosure: isDisclosure(r.disclosure) ? r.disclosure : "contract", amounts: r.amounts === true, hasProject: r.has_project === true, approvedSample: (r.approved_sample as string | null) ?? null, approvedAt: (r.approved_at as string | null) ?? null,
  };
}
const rpcError = (error: { message?: string }) => new ValidationError((error.message || "").match(/kit_[a-z_]+/)?.[0] ?? "save_failed");

function remoteRepo(): KitsRepo {
  const db = supabase!;
  const all = async () => {
    const { data, error } = await db.from("kit_orders").select("*").order("created_at", { ascending: false }).limit(500);
    if (error) throw error;
    return (data as Row[]).map(fromRow);
  };
  return {
    async create(draft) {
      checkDraft(draft);
      const base = { kind: "round", email: draft.email.trim().toLowerCase(), phone: draft.phone.trim(), name: draft.name.trim(), directions: (draft.directions ?? "").trim(), project_id: draft.projectId ?? null, contact_id: draft.contactId ?? null, samples: samplesRow(sanitizeSamples(draft.samples)), disclosure: draft.disclosure && isDisclosure(draft.disclosure) ? draft.disclosure : "contract", ...addrRow(cleanAddress(draft)) };
      for (let i = 0; ; i++) {
        const { data, error } = await db.from("kit_orders").insert({ ...base, ref: newRoundRef() }).select().single();
        if (!error) return fromRow(data as Row);
        if (error.code !== "23505" || i >= 3) throw error;
      }
    },
    async sheet(ref, token) {
      const { data, error } = await db.rpc("kit_sheet", { p_ref: ref.trim().toUpperCase(), p_token: token });
      if (error) throw error;
      return data ? sheetFromRow(data as Row) : null;
    },
    async setAddress(ref, token, addr) {
      const a = cleanAddress(addr);
      if (!a.city) throw new ValidationError("kit_city_required");
      const { data, error } = await db.rpc("kit_set_address", { p_ref: ref.trim().toUpperCase(), p_token: token, p_addr: { ...addrRow(a), name: (addr.name ?? "").trim() } });
      if (error) throw rpcError(error);
      return sheetFromRow(data as Row);
    },
    async decide(ref, token, decisions) {
      const { data, error } = await db.rpc("kit_decide", { p_ref: ref.trim().toUpperCase(), p_token: token, p_decisions: decisions.map((d) => ({ id: d.id, decision: d.decision, comment: d.comment ?? "" })) });
      if (error) throw rpcError(error);
      return sheetFromRow(data as Row);
    },
    async approve(ref, token, sampleId) {
      const { data, error } = await db.rpc("kit_approve", { p_ref: ref.trim().toUpperCase(), p_token: token, p_sample: sampleId });
      if (error) throw rpcError(error);
      return sheetFromRow(data as Row);
    },
    async setFormula(orderId, sampleId) {
      const { error } = await db.rpc("set_project_formula", { p_kit: orderId, p_sample: sampleId });
      if (error) throw /permission_denied/.test(error.message) ? new PermissionError("projects.manage") : rpcError(error);
    },
    list: all,
    // العميل لا يقرأ الجدول مباشرة: kit_mine تعيد شحناته بما يحق له رؤيته (الكميات حسب مفتاح الإفصاح)
    async mine() {
      const { data, error } = await db.rpc("kit_mine");
      if (error) throw error;
      return ((data as Row[]) ?? []).map(fromRow);
    },
    async track(ref) {
      const { data, error } = await db.rpc("kit_track", { p_ref: ref.trim().toUpperCase() });
      if (error) throw error;
      if (!data) return null;
      const r = data as Row;
      const hist = Array.isArray(r.history) ? (r.history as Row[]) : [];
      return { ref: str(r.ref), status: isKitStatus(r.status) ? r.status : "new", city: str(r.city), carrier: str(r.carrier), trackingNo: str(r.tracking_no), trackingUrl: str(r.tracking_url) || trackingUrlFor(str(r.carrier), str(r.tracking_no)), createdAt: str(r.created_at), shippedAt: (r.shipped_at as string | null) ?? null, deliveredAt: (r.delivered_at as string | null) ?? null, history: hist.filter((h) => isKitStatus(h.status)).map((h) => ({ status: h.status as KitStatus, at: str(h.at) })) };
    },
    async update(id, patch, issues, a) {
      checkPatch(patch);
      const row: Row = {};
      if (patch.status !== undefined) row.status = patch.status;
      if (patch.carrier !== undefined) row.carrier = patch.carrier.trim();
      if (patch.trackingNo !== undefined) row.tracking_no = patch.trackingNo.trim();
      if (patch.trackingUrl !== undefined) row.tracking_url = patch.trackingUrl.trim();
      if (patch.note !== undefined) row.note = patch.note;
      if (patch.samples !== undefined) row.samples = samplesRow(sanitizeSamples(patch.samples));
      if (patch.disclosure !== undefined) row.disclosure = patch.disclosure;
      if (patch.name !== undefined) row.name = patch.name.trim();
      if (patch.phone !== undefined) row.phone = patch.phone.trim();
      if (patch.directions !== undefined) row.directions = patch.directions.trim();
      if (patch.city !== undefined) Object.assign(row, addrRow(cleanAddress(patch as KitAddress)));
      const { data: before } = await db.from("kit_orders").select("status").eq("id", id).maybeSingle();
      const { data, error } = await db.from("kit_orders").update(row).eq("id", id).select().single();
      if (error) throw error;
      const order = fromRow(data as Row);
      const issueErrors = order.status === "shipped" && (before as Row | null)?.status !== "shipped" ? await issueStock(order.ref, issues, a) : [];
      return { order, issueErrors };
    },
  };
}

export const kitsRepo: KitsRepo = supabase ? remoteRepo() : localRepo;
export { CARRIERS };
