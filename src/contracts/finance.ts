// العقد المالي: قيمة العقد (شاملة الضريبة)، جدول دفعاته بالنسب، سداد كل دفعة، وفاتورتها الضريبية.
// نفس القواعد في supabase/schema.sql (contract_installment_amount و record_contract_payment).
import type { Bi } from "@/i18n/context";

export interface Installment {
  id: string;
  label: string;
  /** نسبة من قيمة العقد، ومجموع الجدول 100 */
  percent: number;
  /** موعد الاستحقاق كما يُكتب في العقد: «عند التوقيع»، «قبل الشحن»، أو تاريخ */
  due: string;
  /** تاريخ استحقاق اختياري (YYYY-MM-DD): تُبنى عليه التذكيرات */
  dueDate?: string;
}

export const PAY_METHODS = ["bank", "cash", "card", "online"] as const;
export type PayMethod = (typeof PAY_METHODS)[number];
export const PAY_METHOD_LABELS: Record<PayMethod, Bi> = {
  bank: { ar: "تحويل بنكي", en: "Bank transfer" },
  cash: { ar: "نقدًا", en: "Cash" },
  card: { ar: "بطاقة", en: "Card" },
  online: { ar: "دفع إلكتروني", en: "Online payment" },
};

export interface InvoiceParty {
  name: string;
  vatNumber?: string;
  cr?: string;
  idLabel?: string;
  idNumber?: string;
  address?: string;
}

/** سداد دفعة من العقد = فاتورة ضريبية برقم متسلسل */
export interface ContractPayment {
  id: string;
  contractId: string;
  projectId: string;
  installmentId: string;
  label: string;
  percent: number;
  amount: number;
  vatRate: number;
  netAmount: number;
  vatAmount: number;
  method: PayMethod;
  ref: string;
  note: string;
  paidAt: string;
  invoiceNo: string;
  issuedAt: string;
  seller: InvoiceParty;
  buyer: InvoiceParty;
  /** deposit = سُدِّدت تلقائياً من عربون عرض السعر المربوط */
  source?: "manual" | "deposit";
  quoteId?: string | null;
}

export const SCHEDULE_LIMITS = { rows: 12, label: 120, due: 120, maxTotal: 100_000_000 } as const;
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const sid = () => Math.random().toString(36).slice(2, 10);

/** جداول جاهزة شائعة في التصنيع بالطلب */
export const SCHEDULE_PRESETS: { id: string; name: Bi; rows: Omit<Installment, "id">[] }[] = [
  { id: "50-50", name: { ar: "50٪ مقدم · 50٪ قبل التسليم", en: "50% upfront · 50% before delivery" }, rows: [{ label: "دفعة مقدمة عند التوقيع", percent: 50, due: "عند توقيع العقد" }, { label: "الدفعة النهائية", percent: 50, due: "قبل التسليم أو الشحن" }] },
  { id: "50-30-20", name: { ar: "50٪ · 30٪ · 20٪", en: "50% · 30% · 20%" }, rows: [{ label: "دفعة مقدمة عند التوقيع", percent: 50, due: "عند توقيع العقد" }, { label: "دفعة بدء الإنتاج", percent: 30, due: "عند اعتماد العينة النهائية" }, { label: "الدفعة النهائية", percent: 20, due: "قبل التسليم أو الشحن" }] },
  { id: "30-40-30", name: { ar: "30٪ · 40٪ · 30٪", en: "30% · 40% · 30%" }, rows: [{ label: "دفعة مقدمة عند التوقيع", percent: 30, due: "عند توقيع العقد" }, { label: "دفعة بدء الإنتاج", percent: 40, due: "عند اعتماد العينة النهائية" }, { label: "الدفعة النهائية", percent: 30, due: "قبل التسليم أو الشحن" }] },
  { id: "100", name: { ar: "دفعة واحدة", en: "Single payment" }, rows: [{ label: "كامل قيمة العقد", percent: 100, due: "عند توقيع العقد" }] },
];
export const presetRows = (id: string): Installment[] => (SCHEDULE_PRESETS.find((p) => p.id === id)?.rows ?? []).map((r) => ({ ...r, id: sid() }));
export const newInstallment = (percent = 0): Installment => ({ id: sid(), label: "", percent, due: "" });

/** جدول من عرض السعر: العربون نسبةً ثم الباقي */
export function scheduleFromQuote(total: number, deposit: number): Installment[] {
  if (!(total > 0)) return [];
  const pct = Math.min(100, Math.max(0, Math.round((deposit / total) * 1e8) / 1e6));
  if (pct <= 0 || pct >= 100) return presetRows(pct >= 100 ? "100" : "50-50");
  return [
    { id: sid(), label: "دفعة مقدمة عند التوقيع", percent: pct, due: "عند توقيع العقد" },
    { id: sid(), label: "الدفعة النهائية", percent: Math.round((100 - pct) * 1e6) / 1e6, due: "قبل التسليم أو الشحن" },
  ];
}

/** مجموع النسب (بدقة ست خانات: نسبة مطابقة لعربون مدفوع قد لا تكون مدوّرة) */
export const percentTotal = (schedule: Installment[]) => Math.round(schedule.reduce((n, r) => n + (Number(r.percent) || 0), 0) * 1e6) / 1e6;

/** فحص القيمة والجدول قبل الحفظ (الخادم يفرض الحدود نفسها؛ ومجموع 100 شرط الإرسال) */
export function financeProblem(total: number, vatRate: number, schedule: Installment[], forSend = false): string | null {
  if (!(total >= 0 && total <= SCHEDULE_LIMITS.maxTotal) || !(vatRate >= 0 && vatRate <= 100)) return "contract_total";
  if (schedule.length > SCHEDULE_LIMITS.rows) return "contract_schedule";
  if (new Set(schedule.map((r) => r.id)).size !== schedule.length) return "contract_schedule";
  for (const r of schedule) {
    if (!r.label.trim() || r.label.length > SCHEDULE_LIMITS.label || r.due.length > SCHEDULE_LIMITS.due) return "contract_schedule";
    if (!(Number(r.percent) > 0 && Number(r.percent) <= 100)) return "contract_schedule";
    if (r.dueDate && !/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(r.dueDate)) return "contract_schedule";
  }
  if (forSend && schedule.length) {
    if (!(total > 0)) return "contract_total";
    if (percentTotal(schedule) !== 100) return "contract_schedule";
  }
  return null;
}

/** مبلغ كل دفعة؛ الأخيرة تأخذ الباقي فلا تضيع هللة في التقريب */
export function installmentAmounts(total: number, schedule: Installment[]): number[] {
  const parts = schedule.map((r) => round2((total * r.percent) / 100));
  if (parts.length) parts[parts.length - 1] = round2(total - parts.slice(0, -1).reduce((n, x) => n + x, 0));
  return parts;
}

export function vatSplit(amount: number, vatRate: number) {
  const net = round2(amount / (1 + vatRate / 100));
  return { net, vat: round2(amount - net) };
}

export interface ScheduleRow {
  inst: Installment;
  index: number;
  amount: number;
  payment: ContractPayment | null;
}
export interface ContractMoney {
  total: number;
  net: number;
  vat: number;
  paid: number;
  remaining: number;
  rows: ScheduleRow[];
  /** أول دفعة لم تُسدد */
  next: ScheduleRow | null;
  settled: boolean;
}
/** الموقف المالي للعقد: كل دفعة بمبلغها وسدادها، والمدفوع والمتبقي */
export function contractMoney(c: { id: string; total: number; vatRate: number; schedule: Installment[] }, payments: ContractPayment[]): ContractMoney {
  const mine = payments.filter((p) => p.contractId === c.id);
  const amounts = installmentAmounts(c.total, c.schedule);
  const rows = c.schedule.map((inst, index) => ({ inst, index, amount: amounts[index], payment: mine.find((p) => p.installmentId === inst.id) ?? null }));
  const paid = round2(mine.reduce((n, p) => n + p.amount, 0));
  const { net, vat } = vatSplit(c.total, c.vatRate);
  return { total: c.total, net, vat, paid, remaining: round2(Math.max(0, c.total - paid)), rows, next: rows.find((r) => !r.payment) ?? null, settled: rows.length > 0 && rows.every((r) => r.payment) };
}

/** السداد متاح بعد توقيع العميل */
export const payable = (status: string) => status === "client_signed" || status === "signed";

// ─── رمز QR للفاتورة الضريبية (هيئة الزكاة والضريبة، المرحلة الأولى) ───
// TLV: 1 اسم البائع، 2 الرقم الضريبي، 3 وقت الفاتورة ISO 8601، 4 الإجمالي شامل الضريبة، 5 مبلغ الضريبة. ثم Base64.
export function zatcaTlv(v: { seller: string; vatNumber: string; timestamp: string; total: number; vat: number }): string {
  const enc = new TextEncoder();
  const fields = [v.seller, v.vatNumber, v.timestamp, v.total.toFixed(2), v.vat.toFixed(2)];
  const bytes: number[] = [];
  fields.forEach((f, i) => {
    const b = enc.encode(f).slice(0, 255);
    bytes.push(i + 1, b.length, ...b);
  });
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
/** يفك الرمز (للاختبار والتحقق) */
export function parseZatcaTlv(b64: string): string[] {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  const out: string[] = [];
  const dec = new TextDecoder();
  for (let i = 0; i + 1 < bytes.length; ) {
    const len = bytes[i + 1];
    out[bytes[i] - 1] = dec.decode(bytes.slice(i + 2, i + 2 + len));
    i += 2 + len;
  }
  return out;
}
export const zatcaTimestamp = (iso: string) => new Date(iso).toISOString().replace(/\.\d{3}Z$/, "Z");

/** رقم فاتورة متسلسل (الوضع التجريبي؛ على الخادم من invoice_seq) */
export const invoiceNo = (seq: number, at = new Date()) => `INV-${at.getFullYear()}-${String(seq).padStart(5, "0")}`;

// ─── العربون = الدفعة الأولى ──────────────────────────────────────
// عربون عرض السعر المربوط بالعقد هو دفعته الأولى، لا مبلغ ثانٍ (مطابق لـ contract_apply_deposit في schema.sql).
export interface DepositQuote {
  id: string;
  ref: string;
  status: string;
  deposit: number;
  paidAmount?: number | null;
  paymentMethod?: string | null;
  paymentRef?: string | null;
  paidAt?: string | null;
}
/** العربون المنتظر من العرض المربوط: المدفوع فعلاً إن دُفع، وإلا عربون العرض. null = لا ربط */
export function expectedDeposit(q: DepositQuote | null | undefined): number | null {
  if (!q || !(q.deposit > 0) || !["sent", "accepted", "paid"].includes(q.status)) return null;
  return q.status === "paid" ? round2(q.paidAmount ?? q.deposit) : q.deposit;
}
export const firstInstallmentAmount = (total: number, schedule: Installment[]) => (schedule.length ? installmentAmounts(total, schedule)[0] : null);
/** الدفعة الأولى لا تساوي عربون العرض المربوط؟ (يمنع الإرسال) */
export function depositMismatch(total: number, schedule: Installment[], q: DepositQuote | null | undefined): { expected: number; first: number } | null {
  const expected = expectedDeposit(q);
  const first = firstInstallmentAmount(total, schedule);
  if (expected == null || first == null) return null;
  return Math.abs(first - expected) > 0.01 ? { expected, first } : null;
}
/** يضبط الدفعة الأولى على العربون والأخيرة على الباقي؛ إن لم يتسع الجدول صار دفعتين */
export function matchDeposit(total: number, schedule: Installment[], expected: number): Installment[] {
  if (!(total > 0) || !(expected > 0)) return schedule;
  const pct = Math.min(100, Math.round((expected / total) * 1e8) / 1e6);
  const first: Installment = schedule[0] ? { ...schedule[0], percent: pct } : { id: sid(), label: "دفعة مقدمة عند التوقيع", percent: pct, due: "عند توقيع العقد" };
  if (pct >= 100) return [{ ...first, percent: 100 }];
  const middle = schedule.slice(1, -1);
  const rest = Math.round((100 - pct - middle.reduce((n, r) => n + r.percent, 0)) * 1e6) / 1e6;
  if (schedule.length >= 2 && rest > 0) return [first, ...middle, { ...schedule[schedule.length - 1], percent: rest }];
  return [first, { id: sid(), label: "الدفعة النهائية", percent: Math.round((100 - pct) * 1e6) / 1e6, due: "قبل التسليم أو الشحن" }];
}
/** طريقة دفع العرض كما تُكتب في فاتورة الدفعة */
export const depositMethod = (m: string | null | undefined): PayMethod => (m === "moyasar" ? "online" : m === "cash" ? "cash" : "bank");
/** والعكس: طريقة سداد الدفعة الأولى كما تُسجَّل على العرض */
export const quoteMethod = (m: PayMethod): "moyasar" | "bank" | "cash" => (m === "online" ? "moyasar" : m === "cash" ? "cash" : "bank");
