// Vercel Function: يخبر العميل بما ينتظره — تصميم للاعتماد، عرض سعر، مرحلة جديدة، استلام العربون.
// الاعتماد هو عنق الزجاجة: كل يوم لا يعرف فيه العميل أن تصميماً ينتظره يؤخر الإنتاج.
//
// الإعداد في Supabase (Database → Webhooks)، سبعة Webhooks بطريقة POST إلى https://<نطاقك>/api/client-notify
// وبترويسة  x-webhook-secret: <LEAD_WEBHOOK_SECRET>:
//   project_items   ← Insert   (تصميم أرسله الفريق للاعتماد)
//   project_quotes  ← Update   (أُرسل العرض / دُفع العربون)
//   projects        ← Update   (تغيّرت المرحلة)
//   project_contracts ← Update (أُرسل العقد للتوقيع / اكتمل توقيعه)
//   kit_orders      ← Insert, Update (جولة عينات جديدة: أكّد عنوانك / شُحنت العينات: قيّمها بالاسم / سُلِّمت)
//   contract_payments ← Insert (سُجّل سداد دفعة من العقد: فاتورتك الضريبية)
//   production_orders ← Update (بدأ التعتيق / أُفرج عن التشغيلة)
//
// المتغيرات (بدون VITE_): LEAD_WEBHOOK_SECRET, SITE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY، ثم قناة على الأقل:
//   البريد: RESEND_API_KEY, NOTIFY_EMAIL_FROM
//   واتساب: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, CLIENT_WHATSAPP_TEMPLATE (قالب Utility معتمد بمتغير نصي واحد)، WHATSAPP_TEMPLATE_LANG

import { timingSafeEqual } from "node:crypto";
import { stageLabel, stagesFor } from "../src/projects/stages";

type Row = Record<string, unknown>;
interface Event {
  type?: string;
  table?: string;
  record?: Row;
  old_record?: Row | null;
}
export interface Notice {
  /** فارغ لإشعارات شحنة العينة (المستلم من kit_orders لا من مشروع) */
  projectId: string;
  subject: string;
  text: string;
  /** المسار داخل الموقع */
  path: string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const str = (v: unknown) => (v == null ? "" : String(v));
const sar = (v: unknown) => `${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function secretOk(got: string | null, want: string) {
  if (!got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** ما الذي يستحق إخبار العميل في هذا الحدث؟ (null = لا شيء) */
export function noticeFor(e: Event, title: string): Notice | null {
  const r = e.record ?? {};
  const o = e.old_record ?? {};
  if (e.table === "project_items" && e.type === "INSERT" && !r.by_client && r.status === "pending") {
    const v = Number(r.version) > 1 ? ` (نسخة ${r.version})` : "";
    return { projectId: str(r.project_id), subject: `تصميم بانتظار اعتمادك: ${str(r.title)}`, text: `أرسل الفريق «${str(r.title)}»${v} في مشروع «${title}». راجعه واعتمده أو اطلب تعديله.`, path: `/account/projects/${str(r.project_id)}#it-${str(r.id)}` };
  }
  if (e.table === "project_quotes" && e.type === "UPDATE") {
    if (r.status === "sent" && o.status !== "sent")
      return { projectId: str(r.project_id), subject: `عرض سعر ${str(r.ref)} بانتظار اعتمادك`, text: `وصلك عرض السعر ${str(r.ref)} لمشروع «${title}» بإجمالي ${sar(r.total)} شامل الضريبة.`, path: `/account/projects/${str(r.project_id)}` };
    if (r.status === "paid" && o.status !== "paid")
      return { projectId: str(r.project_id), subject: `استلمنا العربون — ${str(r.ref)}`, text: `استلمنا ${sar(r.paid_amount)} عربون مشروع «${title}». بدأ العمل، وستصلك التصاميم للاعتماد في حسابك.`, path: `/account/projects/${str(r.project_id)}` };
    return null;
  }
  if (e.table === "project_contracts" && e.type === "UPDATE") {
    const path = `/account/projects/${str(r.project_id)}#pj-contract`;
    if (r.status === "sent" && o.status !== "sent")
      return { projectId: str(r.project_id), subject: `عقد ${str(r.ref)} بانتظار توقيعك`, text: `أرسل المصنع عقد مشروع «${title}» (${str(r.ref)}) مع ملحق المواصفات والكميات. راجعه ثم وقّعه أو اطلب تعديله من حسابك.`, path };
    if (r.status === "signed" && o.status !== "signed")
      return { projectId: str(r.project_id), subject: `اكتمل توقيع العقد ${str(r.ref)}`, text: `وقّع الطرفان عقد مشروع «${title}» (${str(r.ref)}). تجد نسخته الموقّعة في حسابك.`, path };
    return null;
  }
  if (e.table === "contract_payments" && e.type === "INSERT")
    return { projectId: str(r.project_id), subject: `استلمنا دفعتك: فاتورة ${str(r.invoice_no)}`, text: `سُجّل سداد «${str(r.label)}» بمبلغ ${sar(r.amount)} لمشروع «${title}». فاتورتك الضريبية ${str(r.invoice_no)} جاهزة للطباعة في حسابك.`, path: `/invoice/${str(r.id)}` };
  if (e.table === "production_orders" && e.type === "UPDATE" && r.project_id) {
    const path = `/account/projects/${str(r.project_id)}#pj-production`;
    // بدأ التعتيق: نشرح الانتظار ونعطي أبكر موعد تعبئة
    if (r.maceration_start && !o.maceration_start && Number(r.maceration_days) > 0) {
      const from = new Date(new Date(str(r.maceration_start)).getTime() + Number(r.maceration_days) * 86_400_000);
      const day = from.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "long", timeZone: "Asia/Riyadh" });
      return { projectId: str(r.project_id), subject: `بدأ تعتيق عطرك — تشغيلة ${str(r.batch_no)}`, text: `حُضّر عطر «${title}» وبدأ تعتيقه في الخزانات. يرتاح ${Number(r.maceration_days)} يوماً ليكتسب ثباته وعمقه، وتبدأ التعبئة من ${day}.`, path };
    }
    if (r.status === "released" && o.status !== "released")
      return { projectId: str(r.project_id), subject: `اكتمل تصنيع «${title}» — تشغيلة ${str(r.batch_no)}`, text: `اجتازت تشغيلة ${str(r.batch_no)} (${Number(r.qty).toLocaleString("en-US")} وحدة) الفحص النهائي وأُفرج عنها. سننسّق معك التسليم.`, path };
    return null;
  }
  if (e.table === "projects" && e.type === "UPDATE" && r.stage !== o.stage && o.stage) {
    const track = str(r.track) || null;
    const stages = stagesFor(track);
    const at = stages.findIndex((s) => s.id === r.stage);
    const label = stageLabel(track, str(r.stage)).ar;
    const next = at >= 0 && at < stages.length - 1 ? ` المرحلة التالية: ${stages[at + 1].label.ar}.` : "";
    return { projectId: str(r.id), subject: `مشروعك «${title}» انتقل إلى: ${label}`, text: r.stage === "delivered" ? `اكتمل مشروع «${title}» ووصل مرحلة التسليم. شكراً لثقتك.` : `انتقل مشروع «${title}» إلى مرحلة «${label}».${next}`, path: `/account/projects/${str(r.id)}` };
  }
  return null;
}

/**
 * شحنات العينات. المسار بلا رمز؛ يضيف المعالج رمز الورقة من قاعدة البيانات ليفتح العميل صفحته بلا دخول.
 * جولة جديدة: أكّد عنوانك. شُحنت: تتبّع وقيّم كل عينة باسمها. سُلِّمت بلا تقييم: ذكّر بالتقييم.
 */
export function kitNoticeFor(e: Event): Notice | null {
  if (e.table !== "kit_orders") return null;
  const r = e.record ?? {};
  const o = e.old_record ?? {};
  const ref = str(r.ref);
  const path = `/kit/${ref}`;
  const count = Array.isArray(r.samples) ? r.samples.length : 0;
  const what = r.kind === "round" ? "جولة العينات" : "عينة الاكتشاف";
  if (e.type === "INSERT") {
    // عينة الاكتشاف تأكيدها من مسار الدفع؛ الجولة ينشئها العطّار فنخبر العميل
    if (r.kind !== "round") return null;
    return { projectId: "", subject: `عيناتك ${ref} قيد التجهيز: أكّد عنوان التسليم`, text: `يجهّز العطّار ${count > 0 ? `${count} عينات بأسمائها` : "عيناتك"} (${ref}). أكّد عنوان التسليم وحدّد موقعك على الخريطة لنشحنها فور جاهزيتها.`, path };
  }
  if (e.type !== "UPDATE" || r.status === o.status) return null;
  if (r.status === "shipped") {
    const carrier = str(r.carrier);
    const no = str(r.tracking_no);
    const url = str(r.tracking_url);
    const via = carrier ? ` عبر ${carrier}` : "";
    const track = no ? ` رقم التتبع: ${no}.` : "";
    const link = /^https:\/\//.test(url) ? ` تتبّعها عند شركة الشحن: ${url}` : "";
    const rate = count > 0 ? " مع الشحنة ورقة بمكوّنات كل عينة؛ بعد وصولها اقبل أو ارفض كل عينة باسمها من الرابط." : "";
    return { projectId: "", subject: `شُحنت ${what} ${ref}`, text: `شُحنت عيناتك ${ref}${via}.${track}${link}${rate}`.trim(), path };
  }
  if (r.status === "delivered") {
    // قيّمها العميل بنفسه (kit_decide يثبت الوصول): لا رسالة
    if (r.decided_at) return null;
    return count > 0
      ? { projectId: "", subject: `وصلت ${what} ${ref}: قيّمها بالاسم`, text: `سُلِّمت عيناتك ${ref}. جرّب كل عينة يومًا كاملًا على بشرتك، ثم حدّد المقبولة والمرفوضة بأسمائها واكتب ملاحظتك للعطّار.`, path }
      : { projectId: "", subject: `وصلت عينة الاكتشاف ${ref}`, text: `سُلِّمت عينتك ${ref}. جرّب الاتجاهات الثلاثة على بشرتك ومع جمهورك عدة أيام، ثم احجز مكالمة المتابعة لنختار الاتجاه ونبدأ: سنذكّرك بعد ثلاثة أيام.`, path: `/book?kit=${ref}` };
  }
  return null;
}

/** أي صيغة (05xxxxxxxx محلي سعودي، أو +<رمز الدولة>…) → أرقام دولية لواتساب، أو فارغ إن لم يصلح */
export const waNumber = (phone: string) => {
  let d = phone.replace(/\D/g, "");
  const intl = phone.trim().startsWith("+") || d.startsWith("00");
  if (d.startsWith("00")) d = d.slice(2);
  if (!intl) {
    if (/^05\d{8}$/.test(d)) return `966${d.slice(1)}`;
    if (/^5\d{8}$/.test(d)) return `966${d}`;
  }
  if (d.startsWith("966")) return /^9665\d{8}$/.test(d) ? d : "";
  // E.164: حتى 15 رقماً؛ ولا يبدأ رمز دولة بصفر
  return intl && /^[1-9]\d{7,14}$/.test(d) ? d : "";
};

async function send(name: string, url: string, init: RequestInit) {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`${name} ${r.status}`);
  return name;
}

/** يرسل إشعاراً للعميل بالبريد وواتساب (ما ضُبط منهما). تستخدمه أيضاً دالة التذكيرات المجدولة */
export async function deliver(n: Pick<Notice, "subject" | "text" | "path">, to: { email: string; phone: string }, cta: string): Promise<{ sent: string[]; failed: string[]; noChannel: boolean }> {
  // رابط نسبي لا يفتح من بريد أو واتساب: بلا SITE_URL صالح نرسل الرسالة دون رابط
  const site = (process.env.SITE_URL ?? "").replace(/\/$/, "");
  const link = /^https:\/\//.test(site) ? `${site}${n.path}` : "";
  const jobs: Promise<string>[] = [];
  const from = process.env.NOTIFY_EMAIL_FROM;
  if (process.env.RESEND_API_KEY && from && to.email) {
    const html = `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;font-size:15px;line-height:1.8;color:#111"><p>${esc(n.text)}</p>${link ? `<p><a href="${esc(link)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 20px;border-radius:999px">${cta}</a></p>` : ""}</div>`;
    jobs.push(send("email", "https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: [to.email], subject: n.subject, text: link ? `${n.text}\n\n${link}` : n.text, html }) }));
  }
  const wa = { token: process.env.WHATSAPP_TOKEN, id: process.env.WHATSAPP_PHONE_NUMBER_ID, template: process.env.CLIENT_WHATSAPP_TEMPLATE, to: waNumber(to.phone) };
  if (wa.token && wa.id && wa.template && wa.to) {
    jobs.push(
      send("whatsapp", `https://graph.facebook.com/v21.0/${encodeURIComponent(wa.id)}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${wa.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to: wa.to, type: "template", template: { name: wa.template, language: { code: process.env.WHATSAPP_TEMPLATE_LANG || "ar" }, components: [{ type: "body", parameters: [{ type: "text", text: `${n.text} ${link}`.replace(/\s+/g, " ").slice(0, 900) }] }] } }),
      }),
    );
  }
  if (!jobs.length) return { sent: [], failed: [], noChannel: true };
  const results = await Promise.allSettled(jobs);
  return {
    sent: results.filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled").map((r) => r.value),
    failed: results.filter((r): r is PromiseRejectedResult => r.status === "rejected").map((r) => String(r.reason?.message ?? r.reason)),
    noChannel: false,
  };
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.LEAD_WEBHOOK_SECRET ?? "";
  if (secret.length < 32) return json({ ok: false, error: "not_configured" }, 503);
  if (!secretOk(request.headers.get("x-webhook-secret"), secret)) return json({ ok: false, error: "unauthorized" }, 401);
  let e: Event;
  try {
    e = await request.json();
  } catch {
    return json({ ok: false, error: "bad_json" }, 400);
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json({ ok: false, error: "not_configured" }, 503);
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  let n: Notice | null;
  let to: { email: string; phone: string };
  if (e.table === "kit_orders") {
    // شحنة العينة: المستلم من الصف نفسه في قاعدة البيانات (لا نثق ببريد الحدث)
    const id = str(e.record?.id);
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ ok: true, skipped: "no_order" });
    n = kitNoticeFor(e);
    if (!n) return json({ ok: true, skipped: "nothing_to_tell" });
    let row: { email: string; phone: string; ref: string; token?: string } | undefined;
    try {
      const r = await fetch(`${url}/rest/v1/kit_orders?id=eq.${id}&select=email,phone,ref,token`, { headers });
      [row] = r.ok ? await r.json() : [];
    } catch {
      return json({ ok: false, error: "db_unreachable" }, 502);
    }
    if (!row) return json({ ok: true, skipped: "order_not_found" });
    to = { email: str(row.email), phone: str(row.phone) };
    // رمز الورقة من قاعدة البيانات: يفتح صفحة العميل بعيّناته وعنوانه بلا دخول
    if (n.path.startsWith("/kit/") && /^[0-9a-f]{32}$/.test(str(row.token))) n = { ...n, path: `${n.path}?k=${row.token}` };
  } else {
    const projectId = str(e.table === "projects" ? e.record?.id : e.record?.project_id);
    if (!/^[0-9a-f-]{36}$/i.test(projectId)) return json({ ok: true, skipped: "no_project" });

    // العنوان والمستلم من قاعدة البيانات (لا نثق بما في الحدث إلا معرّف المشروع)
    let project: { title: string; client_email: string; contact_id: string | null } | undefined;
    let phone = "";
    try {
      const r = await fetch(`${url}/rest/v1/projects?id=eq.${projectId}&select=title,client_email,contact_id`, { headers });
      [project] = r.ok ? await r.json() : [];
      if (project?.contact_id) {
        const c = await fetch(`${url}/rest/v1/contacts?id=eq.${project.contact_id}&select=phone`, { headers });
        phone = c.ok ? str((await c.json())[0]?.phone) : "";
      }
    } catch {
      return json({ ok: false, error: "db_unreachable" }, 502);
    }
    if (!project) return json({ ok: true, skipped: "project_not_found" });
    n = noticeFor(e, project.title);
    if (!n) return json({ ok: true, skipped: "nothing_to_tell" });
    to = { email: project.client_email, phone };
  }

  const r = await deliver(n, to, e.table === "kit_orders" ? "تابع شحنتك" : "افتح مشروعك");
  if (r.noChannel) return json({ ok: false, error: "no_channel" }, 503);
  return json({ ok: r.sent.length > 0, sent: r.sent, failed: r.failed, subject: n.subject }, r.sent.length ? 200 : 502);
}
