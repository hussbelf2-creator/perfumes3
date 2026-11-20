// Vercel Function مجدولة (vercel.json ← crons): تحسب كل يوم ما ينتظر العميل ولم يتحرك، وتذكّره مرة واحدة لكل محاولة.
//   عرض بلا رد · عربون لم يُدفع · عقد لم يوقَّع · تصميم ينتظر الاعتماد · عنوان عينات لم يؤكَّد · عينات لم تُقيَّم ·
//   تركيبة لم تُعتمد · دفعة تستحق قريباً أو تأخرت (ومهمة تحصيل للفريق).
// الحجز في reminder_log (reminder_claim) يمنع التكرار، والمهل وعدد المحاولات من «مركز التحكم ← التذكيرات».
//
// الحماية: Authorization: Bearer <CRON_SECRET> (يرسله Vercel Cron تلقائياً حين يُضبط المتغير)، أو x-webhook-secret = LEAD_WEBHOOK_SECRET.
// المتغيرات: CRON_SECRET (32 حرفاً على الأقل)، SUPABASE_URL، SUPABASE_SERVICE_ROLE_KEY، SITE_URL، وقناة: RESEND_API_KEY + NOTIFY_EMAIL_FROM أو واتساب.
// ?dry=1 يعيد المستحق بلا حجز ولا إرسال.

import { timingSafeEqual } from "node:crypto";
import { deliver } from "./client-notify";
import { cleanReminderConfig, dueReminders, type RData, type Reminder } from "../src/reminders/logic";

type Row = Record<string, unknown>;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const str = (v: unknown) => (v == null ? "" : String(v));
const same = (got: string, want: string) => {
  const a = Buffer.from(got);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
};
function authorized(request: Request): boolean | null {
  const cron = process.env.CRON_SECRET ?? "";
  const hook = process.env.LEAD_WEBHOOK_SECRET ?? "";
  if (cron.length < 32 && hook.length < 32) return null;
  const bearer = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (cron.length >= 32 && bearer && same(bearer, cron)) return true;
  const h = request.headers.get("x-webhook-secret") ?? "";
  return hook.length >= 32 && !!h && same(h, hook);
}

/** يقرأ ما تحتاجه التذكيرات بمفتاح الخدمة ويحوّله لشكل المنطق */
export async function loadData(url: string, headers: Record<string, string>): Promise<{ data: RData; config: ReturnType<typeof cleanReminderConfig> }> {
  const get = async (path: string): Promise<Row[]> => {
    const r = await fetch(`${url}/rest/v1/${path}`, { headers });
    if (!r.ok) throw new Error(`${path.split("?")[0]} ${r.status}`);
    return (await r.json()) as Row[];
  };
  const [projects, contacts, quotes, contracts, payments, items, kits, ops] = await Promise.all([
    get("projects?status=eq.active&select=id,title,client_email,status,owner_id,contact_id&limit=2000"),
    get("contacts?select=id,phone&limit=5000"),
    get("project_quotes?status=in.(sent,accepted)&select=id,project_id,ref,status,total,deposit,sent_at,decided_at&limit=2000"),
    get("project_contracts?status=in.(sent,client_signed,signed)&select=id,project_id,ref,status,sent_at,client_signed_at,total,quote_id,schedule&limit=2000"),
    get("contract_payments?select=contract_id,installment_id&limit=10000"),
    get("project_items?status=eq.pending&select=id,project_id,title,status,by_client,created_at&limit=2000"),
    get("kit_orders?status=in.(new,preparing,shipped,delivered)&select=id,ref,token,email,phone,kind,status,project_id,samples,decided_at,address_confirmed_at,approved_sample,created_at,shipped_at,delivered_at&limit=2000"),
    get("site_content?key=eq.ops&select=value"),
  ]);
  const phone = new Map(contacts.map((c) => [str(c.id), str(c.phone)]));
  const data: RData = {
    projects: projects.map((p) => ({ id: str(p.id), title: str(p.title), email: str(p.client_email), phone: phone.get(str(p.contact_id)) ?? "", status: str(p.status), ownerId: (p.owner_id as string) ?? null, contactId: (p.contact_id as string) ?? null })),
    quotes: quotes.map((q) => ({ id: str(q.id), projectId: str(q.project_id), ref: str(q.ref), status: str(q.status), total: Number(q.total) || 0, deposit: Number(q.deposit) || 0, sentAt: (q.sent_at as string) ?? null, decidedAt: (q.decided_at as string) ?? null })),
    contracts: contracts.map((c) => ({ id: str(c.id), projectId: str(c.project_id), ref: str(c.ref), status: str(c.status), sentAt: (c.sent_at as string) ?? null, clientSignedAt: (c.client_signed_at as string) ?? null, total: Number(c.total) || 0, quoteId: (c.quote_id as string) ?? null, schedule: (Array.isArray(c.schedule) ? (c.schedule as Row[]) : []).map((x) => ({ id: str(x.id), label: str(x.label), percent: Number(x.percent) || 0, ...(x.due_date ? { dueDate: str(x.due_date) } : {}) })) })),
    payments: payments.map((x) => ({ contractId: str(x.contract_id), installmentId: str(x.installment_id) })),
    items: items.map((i) => ({ id: str(i.id), projectId: str(i.project_id), title: str(i.title), status: str(i.status), byClient: i.by_client === true, createdAt: str(i.created_at) })),
    kits: kits.map((k) => {
      const samples = Array.isArray(k.samples) ? (k.samples as Row[]) : [];
      return { id: str(k.id), ref: str(k.ref), token: str(k.token), email: str(k.email), phone: str(k.phone), kind: str(k.kind), status: str(k.status), projectId: (k.project_id as string) ?? null, samples: samples.length, accepted: samples.filter((s) => s.decision === "accepted").length, decidedAt: (k.decided_at as string) ?? null, addressConfirmedAt: (k.address_confirmed_at as string) ?? null, approvedSample: (k.approved_sample as string) ?? null, createdAt: str(k.created_at), shippedAt: (k.shipped_at as string) ?? null, deliveredAt: (k.delivered_at as string) ?? null };
    }),
  };
  return { data, config: cleanReminderConfig((ops[0]?.value as Row | undefined)?.reminders) };
}

async function run(request: Request): Promise<Response> {
  const auth = authorized(request);
  if (auth === null) return json({ ok: false, error: "not_configured" }, 503);
  if (!auth) return json({ ok: false, error: "unauthorized" }, 401);
  const url = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json({ ok: false, error: "not_configured" }, 503);
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

  let due: Reminder[];
  try {
    const { data, config } = await loadData(url, headers);
    if (!config.enabled) return json({ ok: true, disabled: true, due: 0, sent: 0 });
    due = dueReminders(data, config, new Date());
  } catch (e) {
    return json({ ok: false, error: "db_unreachable", detail: String((e as Error).message).slice(0, 120) }, 502);
  }
  if (new URL(request.url).searchParams.get("dry") === "1") return json({ ok: true, dry: true, due: due.map((r) => ({ key: r.key, kind: r.kind, audience: r.audience, subject: r.subject })) });
  if (!due.length) return json({ ok: true, due: 0, claimed: 0, sent: 0 });

  // الحجز أولاً: ما سبق إرساله لا يعود، وتشغيلان متزامنان لا يكرران
  let claimed: Set<string>;
  try {
    const r = await fetch(`${url}/rest/v1/rpc/reminder_claim`, { method: "POST", headers, body: JSON.stringify({ p: due.map((x) => ({ key: x.key, kind: x.kind, audience: x.audience, project_id: x.projectId ?? "", subject: x.subject })) }) });
    if (!r.ok) return json({ ok: false, error: "claim_failed", status: r.status }, 502);
    claimed = new Set((await r.json()) as string[]);
  } catch {
    return json({ ok: false, error: "db_unreachable" }, 502);
  }

  let sent = 0, tasks = 0;
  const failed: string[] = [];
  for (const r of due.filter((x) => claimed.has(x.key))) {
    if (r.audience === "team") {
      const t = await fetch(`${url}/rest/v1/tasks`, { method: "POST", headers: { ...headers, Prefer: "return=minimal" }, body: JSON.stringify({ title: r.subject.slice(0, 300), due_at: new Date().toISOString(), assignee_id: r.ownerId ?? null, contact_id: r.contactId ?? null }) }).catch(() => null);
      if (t?.ok) tasks++;
      else failed.push(r.key);
      continue;
    }
    const res = await deliver(r, { email: r.email, phone: r.phone }, r.cta || "افتح حسابك").catch(() => ({ sent: [] as string[], failed: ["error"], noChannel: false }));
    if (res.sent.length) sent++;
    else failed.push(res.noChannel ? `${r.key} (no_channel)` : r.key);
  }
  return json({ ok: true, due: due.length, claimed: claimed.size, sent, tasks, failed });
}

export const GET = run;
export const POST = run;
