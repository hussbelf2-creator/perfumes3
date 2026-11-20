// التذكيرات الآلية: ما الذي ينتظر العميل أو الفريق اليوم؟ منطق واحد تستخدمه الدالة المجدولة على الخادم (api/reminders)
// ومعاينة «المستحق الآن» في مركز التحكم. بلا استيراد بالاسم المستعار @ لأن الخادم يحمّله أيضاً.
// كل تذكير له مفتاح = النوع + الهدف + رقم المحاولة، ويُحجز في reminder_log قبل الإرسال فلا يتكرر.

export interface ReminderConfig {
  enabled: boolean;
  /** عرض سعر أُرسل ولم يُرد عليه */
  quoteDays: number;
  /** عرض اعتُمد ولم يُدفع عربونه */
  depositDays: number;
  /** عقد أُرسل ولم يوقّعه العميل */
  contractDays: number;
  /** تصميم ينتظر الاعتماد */
  designDays: number;
  /** شحنة عينات لم يؤكَّد عنوانها */
  addressDays: number;
  /** عينات وصلت ولم تُقيَّم (أو قُبلت ولم تُعتمد تركيبتها) */
  ratingDays: number;
  /** قبل تاريخ استحقاق الدفعة بكم يوم نذكّر */
  dueBeforeDays: number;
  /** بين المحاولة والتي تليها */
  repeatDays: number;
  /** أقصى عدد محاولات للتذكير الواحد */
  maxRepeats: number;
}
export const DEFAULT_REMINDERS: ReminderConfig = { enabled: true, quoteDays: 3, depositDays: 2, contractDays: 3, designDays: 3, addressDays: 2, ratingDays: 3, dueBeforeDays: 3, repeatDays: 4, maxRepeats: 3 };
export const REMINDER_BOUNDS: Record<Exclude<keyof ReminderConfig, "enabled">, [number, number]> = { quoteDays: [1, 30], depositDays: [1, 30], contractDays: [1, 30], designDays: [1, 30], addressDays: [1, 30], ratingDays: [1, 30], dueBeforeDays: [0, 30], repeatDays: [1, 30], maxRepeats: [1, 6] };

export function cleanReminderConfig(v: unknown): ReminderConfig {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_REMINDERS, enabled: typeof o.enabled === "boolean" ? o.enabled : DEFAULT_REMINDERS.enabled };
  for (const k of Object.keys(REMINDER_BOUNDS) as (keyof typeof REMINDER_BOUNDS)[]) {
    const [min, max] = REMINDER_BOUNDS[k];
    const n = o[k];
    if (typeof n === "number" && Number.isFinite(n)) out[k] = Math.min(max, Math.max(min, Math.round(n)));
  }
  return out;
}

export interface RProject { id: string; title: string; email: string; phone: string; status: string; ownerId?: string | null; contactId?: string | null }
export interface RQuote { id: string; projectId: string; ref: string; status: string; total: number; deposit: number; sentAt?: string | null; decidedAt?: string | null }
export interface RContract { id: string; projectId: string; ref: string; status: string; sentAt?: string | null; clientSignedAt?: string | null; total: number; quoteId?: string | null; schedule: { id: string; label: string; percent: number; dueDate?: string }[] }
export interface RPayment { contractId: string; installmentId: string }
export interface RItem { id: string; projectId: string; title: string; status: string; byClient: boolean; createdAt: string }
export interface RKit { id: string; ref: string; token: string; email: string; phone: string; kind: string; status: string; projectId?: string | null; samples: number; accepted: number; decidedAt?: string | null; addressConfirmedAt?: string | null; approvedSample?: string | null; createdAt: string; shippedAt?: string | null; deliveredAt?: string | null }
export interface RData { projects: RProject[]; quotes: RQuote[]; contracts: RContract[]; payments: RPayment[]; items: RItem[]; kits: RKit[] }

export const REMINDER_KINDS = ["quote_pending", "deposit_due", "contract_unsigned", "design_pending", "kit_address", "kit_rating", "kit_formula", "kit_call", "installment_due", "installment_overdue", "installment_overdue_team"] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];
export const REMINDER_KIND_LABELS: Record<ReminderKind, { ar: string; en: string }> = {
  quote_pending: { ar: "عرض سعر بلا رد", en: "Quote awaiting a reply" },
  deposit_due: { ar: "عربون لم يُدفع", en: "Deposit unpaid" },
  contract_unsigned: { ar: "عقد لم يوقَّع", en: "Contract unsigned" },
  design_pending: { ar: "تصميم ينتظر الاعتماد", en: "Design awaiting approval" },
  kit_address: { ar: "عنوان عينات لم يؤكَّد", en: "Sample address unconfirmed" },
  kit_rating: { ar: "عينات لم تُقيَّم", en: "Samples unrated" },
  kit_formula: { ar: "تركيبة لم تُعتمد", en: "Formula not approved" },
  kit_call: { ar: "دعوة لمكالمة بعد العينة", en: "Follow-up call invitation" },
  installment_due: { ar: "دفعة تستحق قريبًا", en: "Installment due soon" },
  installment_overdue: { ar: "دفعة متأخرة", en: "Installment overdue" },
  installment_overdue_team: { ar: "دفعة متأخرة (للفريق)", en: "Installment overdue (team)" },
};

export interface Reminder {
  key: string;
  kind: ReminderKind;
  audience: "client" | "team";
  projectId: string | null;
  email: string;
  phone: string;
  subject: string;
  text: string;
  /** المسار داخل الموقع */
  path: string;
  /** رقم المحاولة (1 = الأولى) */
  step: number;
  /** نص الزر في الرسالة */
  cta: string;
  /** لتذكيرات الفريق: من تُسند له المهمة */
  ownerId?: string | null;
  contactId?: string | null;
}

const DAY = 86_400_000;
const daysSince = (iso: string | null | undefined, now: Date) => (iso ? (now.getTime() - new Date(iso).getTime()) / DAY : -1);
/** رقم المحاولة المستحقة الآن: 0 = لم يحن بعد. الأولى بعد first يوماً، ثم كل every، حتى max */
export function stepFor(age: number, first: number, every: number, max: number): number {
  if (age < first) return 0;
  return Math.min(max, 1 + Math.floor((age - first) / Math.max(1, every)));
}
const sar = (n: number) => `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
/** مبلغ الدفعة (الأخيرة تأخذ الباقي) */
function instAmount(c: RContract, i: number): number {
  const parts = c.schedule.map((r) => r2((c.total * r.percent) / 100));
  if (parts.length) parts[parts.length - 1] = r2(c.total - parts.slice(0, -1).reduce((n, x) => n + x, 0));
  return parts[i] ?? 0;
}
/** أيام بين تاريخين تقويميين بتوقيت الرياض (موجب = التاريخ في المستقبل) */
export function daysUntil(date: string, now: Date): number {
  const today = new Date(now.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY);
}

/** كل ما يستحق تذكيراً الآن (المحاولة الحالية فقط لكل هدف) */
export function dueReminders(d: RData, cfg: ReminderConfig, now = new Date()): Reminder[] {
  if (!cfg.enabled) return [];
  const out: Reminder[] = [];
  const projects = new Map(d.projects.filter((p) => p.status === "active").map((p) => [p.id, p]));
  const again = (n: number) => (n > 1 ? "تذكير: " : "");
  const push = (kind: ReminderKind, target: string, step: number, p: RProject | null, r: Omit<Reminder, "key" | "kind" | "step" | "projectId" | "email" | "phone" | "audience"> & { audience?: "client" | "team"; email?: string; phone?: string }) => {
    if (step < 1) return;
    out.push({ audience: "client", email: p?.email ?? "", phone: p?.phone ?? "", ownerId: p?.ownerId ?? null, contactId: p?.contactId ?? null, ...r, key: `${kind}:${target}:${step}`, kind, step, projectId: p?.id ?? null });
  };

  for (const q of d.quotes) {
    const p = projects.get(q.projectId);
    if (!p) continue;
    if (q.status === "sent") {
      const step = stepFor(daysSince(q.sentAt, now), cfg.quoteDays, cfg.repeatDays, cfg.maxRepeats);
      push("quote_pending", q.id, step, p, { subject: `${again(step)}عرض السعر ${q.ref} بانتظار ردّك`, text: `عرض السعر ${q.ref} لمشروع «${p.title}» (${sar(q.total)} شامل الضريبة) ينتظر اعتمادك أو ملاحظاتك. لا يبدأ العمل قبل اعتماده.`, path: `/account/projects/${p.id}#pj-offers`, cta: "راجع العرض" });
    } else if (q.status === "accepted" && q.deposit > 0) {
      const step = stepFor(daysSince(q.decidedAt, now), cfg.depositDays, cfg.repeatDays, cfg.maxRepeats);
      push("deposit_due", q.id, step, p, { subject: `${again(step)}العربون ${sar(q.deposit)} ليبدأ مشروعك`, text: `اعتمدتَ عرض السعر ${q.ref} لمشروع «${p.title}». يبدأ العمل عند سداد العربون ${sar(q.deposit)}، وهو نفسه الدفعة الأولى من عقدك.`, path: `/account/projects/${p.id}#pj-offers`, cta: "ادفع العربون" });
    }
  }

  const paid = new Set(d.payments.map((x) => `${x.contractId}:${x.installmentId}`));
  for (const c of d.contracts) {
    const p = projects.get(c.projectId);
    if (!p) continue;
    if (c.status === "sent") {
      const step = stepFor(daysSince(c.sentAt, now), cfg.contractDays, cfg.repeatDays, cfg.maxRepeats);
      push("contract_unsigned", c.id, step, p, { subject: `${again(step)}العقد ${c.ref} بانتظار توقيعك`, text: `عقد مشروع «${p.title}» (${c.ref}) ينتظر توقيعك. راجع البنود وجدول الدفعات ثم وقّع أو اطلب تعديلًا.`, path: `/account/projects/${p.id}#pj-contract`, cta: "راجع العقد ووقّع" });
    }
    if (c.status !== "client_signed" && c.status !== "signed") continue;
    c.schedule.forEach((inst, i) => {
      if (!inst.dueDate || paid.has(`${c.id}:${inst.id}`)) return;
      const until = daysUntil(inst.dueDate, now);
      const amount = sar(instAmount(c, i));
      const path = `/invoice/due/${c.id}/${inst.id}`;
      if (until >= 0 && until <= cfg.dueBeforeDays) {
        push("installment_due", `${c.id}:${inst.id}`, 1, p, { subject: `دفعة «${inst.label}» تستحق ${until === 0 ? "اليوم" : `خلال ${until} أيام`}`, text: `دفعة «${inst.label}» من العقد ${c.ref} (${amount}) تستحق في ${inst.dueDate}. تجد المطالبة وبيانات التحويل في الرابط.`, path, cta: "افتح المطالبة" });
      } else if (until < 0) {
        const late = -until;
        const step = stepFor(late, 1, cfg.repeatDays, cfg.maxRepeats);
        push("installment_overdue", `${c.id}:${inst.id}`, step, p, { subject: `${again(step)}دفعة «${inst.label}» متأخرة ${late} يومًا`, text: `دفعة «${inst.label}» من العقد ${c.ref} (${amount}) كانت تستحق في ${inst.dueDate}. نرجو سدادها أو إخبارنا إن حوّلتها لنصدر فاتورتها.`, path, cta: "افتح المطالبة" });
        // مهمة تحصيل واحدة للفريق
        push("installment_overdue_team", `${c.id}:${inst.id}`, 1, p, { audience: "team", subject: `تحصيل: دفعة «${inst.label}» (${amount}) من ${c.ref} متأخرة منذ ${inst.dueDate}`, text: `مشروع «${p.title}»: تواصل مع العميل لتحصيل الدفعة أو سجّل سدادها إن وصلت.`, path: `/admin/projects/${p.id}#pj-contract`, cta: "" });
      }
    });
  }

  for (const it of d.items) {
    const p = projects.get(it.projectId);
    if (!p || it.status !== "pending" || it.byClient) continue;
    const step = stepFor(daysSince(it.createdAt, now), cfg.designDays, cfg.repeatDays, cfg.maxRepeats);
    push("design_pending", it.id, step, p, { subject: `${again(step)}«${it.title}» بانتظار اعتمادك`, text: `تصميم «${it.title}» في مشروع «${p.title}» ينتظر اعتمادك أو ملاحظاتك. كل يوم انتظار يُضاف إلى موعد التسليم.`, path: `/account/projects/${p.id}#it-${it.id}`, cta: "راجع التصميم" });
  }

  for (const k of d.kits) {
    const p = k.projectId ? (projects.get(k.projectId) ?? null) : null;
    if (k.projectId && !p) continue;
    const to = { email: k.email, phone: k.phone };
    const path = `/kit/${k.ref}?k=${k.token}`;
    if ((k.status === "new" || k.status === "preparing") && !k.addressConfirmedAt && (k.kind === "round" || k.samples > 0)) {
      const step = stepFor(daysSince(k.createdAt, now), cfg.addressDays, cfg.repeatDays, cfg.maxRepeats);
      push("kit_address", k.id, step, p, { ...to, subject: `${again(step)}أكّد عنوان تسليم عيناتك ${k.ref}`, text: `عيناتك ${k.ref} جاهزة للشحن وننتظر تأكيد عنوان التسليم وموقعك على الخريطة.`, path, cta: "أكّد العنوان" });
    } else if ((k.status === "shipped" || k.status === "delivered") && k.samples > 0 && !k.decidedAt) {
      const age = k.deliveredAt ? daysSince(k.deliveredAt, now) : daysSince(k.shippedAt, now) - 4;
      const step = stepFor(age, cfg.ratingDays, cfg.repeatDays, cfg.maxRepeats);
      push("kit_rating", k.id, step, p, { ...to, subject: `${again(step)}ما رأيك في عيناتك ${k.ref}؟`, text: `وصلتك ${k.samples} عينات (${k.ref}). حدّد المقبولة والمرفوضة بأسمائها واكتب ملاحظتك ليكمل العطّار العمل.`, path, cta: "قيّم العينات" });
    } else if (k.decidedAt && k.accepted > 0 && !k.approvedSample && k.projectId) {
      const step = stepFor(daysSince(k.decidedAt, now), cfg.ratingDays, cfg.repeatDays, cfg.maxRepeats);
      push("kit_formula", k.id, step, p, { ...to, subject: `${again(step)}اعتمد تركيبتك النهائية من ${k.ref}`, text: `قبلتَ ${k.accepted === 1 ? "عينة" : `${k.accepted} عينات`} من ${k.ref}. اعتمد واحدة تركيبةً نهائية ليبدأ المصنع عليها.`, path, cta: "اعتمد التركيبة" });
    } else if (k.kind === "kit" && k.status === "delivered" && k.samples === 0) {
      const step = stepFor(daysSince(k.deliveredAt, now), 3, cfg.repeatDays, 1);
      push("kit_call", k.id, step, p, { ...to, subject: `جرّبت عينة الاكتشاف ${k.ref}؟ احجز مكالمة المتابعة`, text: `مرّت أيام على وصول عينتك ${k.ref}. احجز مكالمة قصيرة لنختار الاتجاه العطري ونبدأ مشروعك.`, path: `/book?kit=${k.ref}`, cta: "احجز المكالمة" });
    }
  }
  return out;
}
