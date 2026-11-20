import type { Bi } from "@/i18n/context";

// شحنات عينة الاكتشاف: طلب العينة (KIT-XXXXXX) يتحول إلى شحنة تمرّ بحالات معلومة،
// ويكتب الخادم تاريخ كل انتقال في history. نفس القواعد في supabase/schema.sql (kit_orders).

export const KIT_STATUSES = ["new", "preparing", "shipped", "delivered", "returned"] as const;
export type KitStatus = (typeof KIT_STATUSES)[number];
/** المسار الطبيعي الذي يراه العميل كشريط تقدّم (المرتجع خارجه) */
export const KIT_FLOW: readonly KitStatus[] = ["new", "preparing", "shipped", "delivered"];

export const KIT_STATUS_LABELS: Record<KitStatus, Bi> = {
  new: { ar: "جديد", en: "New" },
  preparing: { ar: "قيد التجهيز", en: "Preparing" },
  shipped: { ar: "شُحن", en: "Shipped" },
  delivered: { ar: "سُلِّم", en: "Delivered" },
  returned: { ar: "مرتجع", en: "Returned" },
};
export const KIT_STATUS_HINTS: Record<KitStatus, Bi> = {
  new: { ar: "استلمنا طلبك ونراجع الدفع", en: "Order received; payment under review" },
  preparing: { ar: "نعبّئ اتجاهاتك العطرية الثلاثة", en: "Filling your three scent directions" },
  shipped: { ar: "في الطريق إليك مع شركة الشحن", en: "On its way with the courier" },
  delivered: { ar: "وصلت. جرّبها على مهل ثم احجز مكالمة المتابعة", en: "Delivered. Take your time, then book the follow-up call" },
  returned: { ar: "ارتدّت الشحنة؛ سنتواصل معك لإعادة الإرسال", en: "The parcel came back; we'll contact you to resend" },
};
/** جولة العينات المسمّاة بلا دفع وبلا «اتجاهات ثلاثة»: لها عباراتها */
const ROUND_STATUS_HINTS: Partial<Record<KitStatus, Bi>> = {
  new: { ar: "جولة عيناتك مسجّلة. أكّد عنوان التسليم لنشحنها فور جاهزيتها.", en: "Your sample round is registered. Confirm the delivery address so we ship as soon as it's ready." },
  preparing: { ar: "العطّار يجهّز عيناتك بأسمائها. أكّد عنوانك لنشحنها فور جاهزيتها.", en: "The perfumer is preparing your named samples. Confirm your address so we ship as soon as they're ready." },
  delivered: { ar: "وصلت. جرّب كل عينة يومًا كاملًا ثم قيّمها باسمها", en: "Delivered. Wear each sample for a full day, then rate it by name" },
};
export const kitStatusHint = (status: KitStatus, kind?: string | null): Bi => (kind === "round" ? ROUND_STATUS_HINTS[status] : undefined) ?? KIT_STATUS_HINTS[status];
export const KIT_STATUS_ICONS: Record<KitStatus, string> = {
  new: "ri-inbox-2-line",
  preparing: "ri-flask-line",
  shipped: "ri-truck-line",
  delivered: "ri-checkbox-circle-line",
  returned: "ri-arrow-go-back-line",
};

export interface KitHistoryEntry {
  status: KitStatus;
  at: string;
  by?: string | null;
}

export interface KitOrder {
  id: string;
  ref: string;
  leadId?: string | null;
  contactId?: string | null;
  email: string;
  phone: string;
  name: string;
  country: string;
  city: string;
  address: string;
  directions: string;
  status: KitStatus;
  carrier: string;
  trackingNo: string;
  trackingUrl: string;
  note: string;
  history: KitHistoryEntry[];
  shippedAt?: string | null;
  deliveredAt?: string | null;
  createdAt: string;
  updatedAt: string;
  /** kit = عينة الاكتشاف المدفوعة، round = جولة عينات يرسلها العطّار لمشروع */
  kind: KitKind;
  projectId?: string | null;
  samples: KitSample[];
  district: string;
  street: string;
  building: string;
  postal: string;
  /** العنوان الوطني المختصر: أربعة أحرف وأربعة أرقام (RRRD2929) */
  shortAddress: string;
  lat?: number | null;
  lng?: number | null;
  /** رمز رابط الورقة (QR): يصدره الخادم ولا يتغير */
  token: string;
  decidedAt?: string | null;
  addressConfirmedAt?: string | null;
  /** ما يراه العميل من مكوّنات العينات */
  disclosure: Disclosure;
  /** العينة التي اعتُمدت تركيبةً نهائية */
  approvedSample?: string | null;
  approvedAt?: string | null;
  /** في عرض العميل: هل الكميات مكشوفة الآن؟ */
  amounts?: boolean;
}

// ─── الإفصاح عن المكوّنات للعميل ─────────────────────────────────
export const DISCLOSURES = ["contract", "full", "names", "hidden"] as const;
export type Disclosure = (typeof DISCLOSURES)[number];
export const DISCLOSURE_LABELS: Record<Disclosure, Bi> = {
  contract: { ar: "الأسماء الآن، والكميات بعد توقيع العقد", en: "Names now, amounts after the contract is signed" },
  full: { ar: "الأسماء والكميات دائمًا", en: "Names and amounts always" },
  names: { ar: "الأسماء فقط", en: "Names only" },
  hidden: { ar: "بلا مكوّنات", en: "No ingredients" },
};
export const DISCLOSURE_HINTS: Record<Disclosure, Bi> = {
  contract: { ar: "يحمي التركيبة قبل التعاقد: العميل يرى أسماء المكوّنات، وتظهر الكميات تلقائيًا حين يوقّع عقد المشروع.", en: "Protects the formula before contracting: the client sees ingredient names, and amounts appear once they sign the project contract." },
  full: { ar: "العميل يرى التركيبة كاملة بنسبها من الآن، في صفحته وعلى الورقة المطبوعة.", en: "The client sees the full formula with percentages now, on their page and the printed sheet." },
  names: { ar: "العميل يرى أسماء المكوّنات بلا أي كمية، حتى بعد العقد.", en: "The client sees ingredient names with no amounts, even after the contract." },
  hidden: { ar: "العميل يرى اسم العينة ووصفها فقط.", en: "The client sees only the sample name and description." },
};
export const isDisclosure = (d: unknown): d is Disclosure => (DISCLOSURES as readonly string[]).includes(d as string);
/** هل تُكشف الكميات للعميل؟ (مطابق لـ kit_reveal) */
export const revealAmounts = (disclosure: Disclosure, contractSigned: boolean) => disclosure === "full" || (disclosure === "contract" && contractSigned);
/** العينات كما يراها العميل (مطابق لـ kit_samples_view): أسماء بلا كميات، أو بلا مكوّنات */
export function samplesView(samples: KitSample[], disclosure: Disclosure, contractSigned: boolean): KitSample[] {
  if (revealAmounts(disclosure, contractSigned)) return samples;
  return samples.map((s) => ({ ...s, ingredients: disclosure === "hidden" ? [] : s.ingredients.map((g) => ({ name: g.name, amount: 0, unit: g.unit, masked: true })) }));
}

export const KIT_KINDS = ["kit", "round"] as const;
export type KitKind = (typeof KIT_KINDS)[number];
export const KIT_KIND_LABELS: Record<KitKind, Bi> = {
  kit: { ar: "عينة اكتشاف", en: "Discovery kit" },
  round: { ar: "جولة عينات", en: "Sample round" },
};

// ─── العينات المسمّاة ─────────────────────────────────────────────
export const SAMPLE_UNITS = ["%", "g", "ml", "drops"] as const;
export type SampleUnit = (typeof SAMPLE_UNITS)[number];
export const SAMPLE_UNIT_LABELS: Record<SampleUnit, Bi> = {
  "%": { ar: "٪", en: "%" },
  g: { ar: "غ", en: "g" },
  ml: { ar: "مل", en: "ml" },
  drops: { ar: "قطرة", en: "drops" },
};
export interface SampleIngredient {
  name: string;
  amount: number;
  unit: SampleUnit;
  /** في عرض العميل: الكمية محجوبة */
  masked?: boolean;
}
export type SampleDecision = "accepted" | "rejected";
export interface KitSample {
  id: string;
  /** الحرف المطبوع على العبوة: A، B، C… */
  code: string;
  name: string;
  /** التركيز أو الحجم: EDP 18% · 5 مل */
  concentration: string;
  notes: string;
  ingredients: SampleIngredient[];
  decision?: SampleDecision;
  comment?: string;
  decidedAt?: string;
}
export const SAMPLE_LIMITS = { samples: 24, ingredients: 40, name: 80, notes: 400, comment: 600, concentration: 60, ingredient: 80 } as const;

export interface KitAddress {
  name?: string;
  country: string;
  city: string;
  district: string;
  street: string;
  building: string;
  postal: string;
  shortAddress: string;
  /** وصف إضافي: معلم قريب، رقم الشقة، أوقات الاستلام */
  address: string;
  lat?: number | null;
  lng?: number | null;
}

/** ما يراه حامل رمز الورقة (QR): العينات بمكوناتها والعنوان، بلا بريد ولا جوال */
export interface KitSheet extends KitTrack, Omit<KitAddress, "city"> {
  kind: KitKind;
  name: string;
  directions: string;
  samples: KitSample[];
  decidedAt?: string | null;
  addressConfirmedAt?: string | null;
  disclosure: Disclosure;
  /** الكميات مكشوفة الآن؟ */
  amounts: boolean;
  /** الشحنة مربوطة بمشروع: اعتماد العينة يثبّت تركيبته */
  hasProject: boolean;
  approvedSample?: string | null;
  approvedAt?: string | null;
}

export interface KitDecisionInput {
  id: string;
  decision: SampleDecision;
  comment?: string;
}

/** جولة عينات جديدة ينشئها العطّار */
export interface KitDraft extends KitAddress {
  email: string;
  phone: string;
  name: string;
  projectId?: string | null;
  contactId?: string | null;
  directions?: string;
  disclosure?: Disclosure;
  samples: KitSample[];
}

/** ما يُنشر للعميل من الرابط العام /kit/:ref — بلا بيانات شخصية */
export interface KitTrack {
  ref: string;
  status: KitStatus;
  city: string;
  carrier: string;
  trackingNo: string;
  trackingUrl: string;
  createdAt: string;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  history: { status: KitStatus; at: string }[];
}

export type KitPatch = Partial<Pick<KitOrder, "status" | "carrier" | "trackingNo" | "trackingUrl" | "note" | "samples" | "name" | "phone" | "directions" | "disclosure">> & Partial<KitAddress>;

/** مادة عينة تُصرف من المخزون عند الشحن */
export interface KitIssue {
  itemId: string;
  qty: number;
}

// شركات الشحن المتداولة في السعودية والخليج مع قالب رابط التتبع ({no} = رقم التتبع)
export interface Carrier {
  id: string;
  name: string;
  track: string;
}
export const CARRIERS: readonly Carrier[] = [
  { id: "SMSA", name: "SMSA Express", track: "https://www.smsaexpress.com/trackingdetails?tracknumbers={no}" },
  { id: "Aramex", name: "Aramex", track: "https://www.aramex.com/track/results?ShipmentNumber={no}" },
  { id: "SPL", name: "سبل · البريد السعودي", track: "https://splonline.com.sa/ar/track/?id={no}" },
  { id: "Naqel", name: "ناقل إكسبرس", track: "https://www.naqelexpress.com/ar/tracking?id={no}" },
  { id: "DHL", name: "DHL Express", track: "https://www.dhl.com/sa-en/home/tracking.html?tracking-id={no}" },
  { id: "FedEx", name: "FedEx", track: "https://www.fedex.com/fedextrack/?trknbr={no}" },
  { id: "UPS", name: "UPS", track: "https://www.ups.com/track?tracknum={no}" },
  { id: "J&T", name: "J&T Express", track: "https://www.jtexpress.sa/trajectoryQuery?waybillNo={no}" },
  { id: "iMile", name: "iMile", track: "https://www.imile.com/track/?no={no}" },
  { id: "Zajil", name: "زاجل", track: "https://zajil-express.com/ar/track-shipment?no={no}" },
  { id: "Hand", name: "تسليم يدوي / مندوب", track: "" },
];

export const isKitStatus = (s: unknown): s is KitStatus => typeof s === "string" && (KIT_STATUSES as readonly string[]).includes(s);
export const KIT_REF_RE = /^(KIT|SMP)-[A-Z0-9]{6}$/;
export const SHORT_ADDRESS_RE = /^[A-Z]{4}[0-9]{4}$/;

/** رابط التتبع: الصريح إن أُدخل، وإلا من قالب الشركة ورقم الشحنة */
export function trackingUrlFor(carrier: string, trackingNo: string, explicit = ""): string {
  const e = explicit.trim();
  if (/^https:\/\//.test(e)) return e;
  const no = trackingNo.trim();
  const c = CARRIERS.find((x) => x.id === carrier.trim() || x.name === carrier.trim());
  return c && c.track && no ? c.track.replace("{no}", encodeURIComponent(no)) : "";
}

/** موضع الحالة على شريط التقدم: 0..3 (المرتجع يقف على موضع الشحن) */
export function kitProgress(status: KitStatus): { step: number; total: number; pct: number } {
  const total = KIT_FLOW.length;
  const step = status === "returned" ? KIT_FLOW.indexOf("shipped") : KIT_FLOW.indexOf(status);
  return { step, total, pct: Math.round(((step + 1) / total) * 100) };
}

/** الانتقالات المسموحة من الواجهة (الخادم يقبل أي انتقال لكننا نرشد الفريق) */
export function nextStatuses(status: KitStatus): KitStatus[] {
  switch (status) {
    case "new":
      return ["preparing", "shipped"];
    case "preparing":
      return ["shipped", "new"];
    case "shipped":
      return ["delivered", "returned"];
    case "delivered":
      return ["returned"];
    case "returned":
      return ["preparing", "shipped"];
  }
}

/** تاريخ آخر انتقال إلى حالة ما */
export const statusAt = (o: Pick<KitOrder, "history">, s: KitStatus) => [...o.history].reverse().find((h) => h.status === s)?.at ?? null;

// ─── العينات: التسمية، التنظيف، وقرارات العميل ───────────────────
/** حرف العبوة حسب ترتيبها: A … Z ثم A2 … */
export const sampleCode = (i: number) => String.fromCharCode(65 + (i % 26)) + (i >= 26 ? String(Math.floor(i / 26) + 1) : "");
const sid = () => Math.random().toString(36).slice(2, 10);
export const newSample = (i: number): KitSample => ({ id: sid(), code: sampleCode(i), name: "", concentration: "", notes: "", ingredients: [] });
const cut = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const isUnit = (u: unknown): u is SampleUnit => (SAMPLE_UNITS as readonly string[]).includes(u as string);

/** ينظّف قائمة العينات كما يقبلها الخادم (kit_samples_ok): اسم لازم، حدود للأطوال والأعداد */
export function sanitizeSamples(raw: unknown): KitSample[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: KitSample[] = [];
  for (const r of raw.slice(0, SAMPLE_LIMITS.samples)) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const name = cut(o.name, SAMPLE_LIMITS.name);
    let id = cut(o.id, 24) || sid();
    if (!name) continue;
    while (seen.has(id)) id = sid();
    seen.add(id);
    const ingredients = (Array.isArray(o.ingredients) ? o.ingredients : [])
      .slice(0, SAMPLE_LIMITS.ingredients)
      .map((g): SampleIngredient | null => {
        if (!g || typeof g !== "object") return null;
        const x = g as Record<string, unknown>;
        const n = cut(x.name, SAMPLE_LIMITS.ingredient);
        const amount = Math.round(Math.max(0, Math.min(100000, Number(x.amount) || 0)) * 1000) / 1000;
        // الخادم يحجب الكمية بحذف حقلها: اسم بلا amount = كمية محجوبة
        const masked = x.amount === undefined || x.masked === true;
        return n ? { name: n, amount, unit: isUnit(x.unit) ? x.unit : "%", ...(masked ? { masked: true } : {}) } : null;
      })
      .filter((g): g is SampleIngredient => !!g);
    const s: KitSample = { id, code: cut(o.code, 8) || sampleCode(out.length), name, concentration: cut(o.concentration, SAMPLE_LIMITS.concentration), notes: cut(o.notes, SAMPLE_LIMITS.notes), ingredients };
    if (o.decision === "accepted" || o.decision === "rejected") {
      s.decision = o.decision;
      s.comment = cut(o.comment, SAMPLE_LIMITS.comment);
      if (typeof o.decided_at === "string") s.decidedAt = o.decided_at;
      else if (typeof o.decidedAt === "string") s.decidedAt = o.decidedAt;
    }
    out.push(s);
  }
  return out;
}

/** تعديل الفريق لا يمس قرارات العميل: تُحفظ بالمعرّف مهما أُرسل (مطابق لـ kit_order_guard) */
export function mergeTeamSamples(prev: KitSample[], next: KitSample[]): KitSample[] {
  const old = new Map(prev.map((s) => [s.id, s]));
  return sanitizeSamples(next).map((s) => {
    const o = old.get(s.id);
    const clean: KitSample = { id: s.id, code: s.code, name: s.name, concentration: s.concentration, notes: s.notes, ingredients: s.ingredients };
    return o?.decision ? { ...clean, decision: o.decision, comment: o.comment ?? "", decidedAt: o.decidedAt } : clean;
  });
}

/** قرارات العميل على العينات بأسمائها (مطابق لـ kit_decide): المعرّفات المجهولة والقيم الغريبة تُهمل */
export function applyDecisions(samples: KitSample[], decisions: KitDecisionInput[], at: string): KitSample[] {
  const by = new Map(decisions.filter((d) => d.decision === "accepted" || d.decision === "rejected").map((d) => [d.id, d]));
  return samples.map((s) => {
    const d = by.get(s.id);
    return d ? { ...s, decision: d.decision, comment: (d.comment ?? "").trim().slice(0, SAMPLE_LIMITS.comment), decidedAt: at } : s;
  });
}

export function sampleTotals(samples: KitSample[]) {
  const accepted = samples.filter((s) => s.decision === "accepted").length;
  const rejected = samples.filter((s) => s.decision === "rejected").length;
  return { total: samples.length, accepted, rejected, pending: samples.length - accepted - rejected };
}

/** مجموع النسب المئوية لمكونات العينة (للتنبيه إن تجاوز 100) */
export const percentSum = (s: KitSample) => Math.round(s.ingredients.filter((g) => g.unit === "%").reduce((n, g) => n + g.amount, 0) * 1000) / 1000;

// ─── العنوان والموقع ─────────────────────────────────────────────
export const emptyAddress = (): KitAddress => ({ country: "SA", city: "", district: "", street: "", building: "", postal: "", shortAddress: "", address: "", lat: null, lng: null });
export const addressOf = (o: KitAddress): KitAddress => ({ country: o.country, city: o.city, district: o.district, street: o.street, building: o.building, postal: o.postal, shortAddress: o.shortAddress, address: o.address, lat: o.lat ?? null, lng: o.lng ?? null });

/** ينظّف العنوان كما يحفظه الخادم (kit_set_address) */
export function cleanAddress(a: Partial<KitAddress>): KitAddress {
  const country = (a.country ?? "").trim().toUpperCase();
  const short = (a.shortAddress ?? "").replace(/\s/g, "").toUpperCase();
  const lat = Number(a.lat);
  const lng = Number(a.lng);
  const geo = a.lat != null && a.lng != null && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
  return {
    country: /^[A-Z]{2}$/.test(country) ? country : "",
    city: cut(a.city, 60),
    district: cut(a.district, 80),
    street: cut(a.street, 120),
    building: cut(a.building, 40),
    postal: (a.postal ?? "").replace(/[^0-9A-Za-z -]/g, "").slice(0, 12),
    shortAddress: SHORT_ADDRESS_RE.test(short) ? short : "",
    address: cut(a.address, 300),
    lat: geo ? Math.round(lat * 1e6) / 1e6 : null,
    lng: geo ? Math.round(lng * 1e6) / 1e6 : null,
  };
}

/** سطر العنوان للعرض والطباعة */
export function addressLine(a: Partial<KitAddress>, countryName = ""): string {
  const street = [a.building, a.street].filter(Boolean).join(" ");
  return [street, a.district, a.city, a.postal, countryName || a.country, a.address].map((x) => (x ?? "").toString().trim()).filter(Boolean).join("، ");
}
export const hasGeo = (a: Partial<KitAddress>) => typeof a.lat === "number" && typeof a.lng === "number";
export const mapsLink = (a: Partial<KitAddress>) => (hasGeo(a) ? `https://www.google.com/maps?q=${a.lat},${a.lng}` : "");

/** يستخرج الإحداثيات من رابط خرائط أو من نص «24.7136, 46.6753» */
export function parseLatLng(text: string): { lat: number; lng: number } | null {
  const t = text.trim();
  const m = t.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/) || t.match(/[?&](?:q|ll|query|destination)=(-?\d{1,2}\.\d+)(?:,|%2C)(-?\d{1,3}\.\d+)/i) || t.match(/!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/) || t.match(/^(-?\d{1,2}\.\d+)\s*[,،\s]\s*(-?\d{1,3}\.\d+)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 } : null;
}

/** العنوان قابل للتعديل من العميل قبل الشحن فقط */
export const addressOpen = (status: KitStatus) => status === "new" || status === "preparing";
/** التقييم متاح بعد الشحن */
export const canDecide = (status: KitStatus) => status === "shipped" || status === "delivered";

/** مسار صفحة العينات برمزها (ما يحمله رمز QR) */
export const sheetPath = (ref: string, token: string, print = false) => `/kit/${ref}${print ? "/sheet" : ""}?k=${token}`;

/** عدد الخانات العشرية اللازمة لعرض الكمية كما كُتبت (حتى ثلاث): 4.5 تبقى 4.5 لا 5 */
export const amountDigits = (n: number) => {
  const frac = (Math.round(n * 1000) / 1000).toString().split(".")[1] ?? "";
  return Math.min(3, frac.length);
};
