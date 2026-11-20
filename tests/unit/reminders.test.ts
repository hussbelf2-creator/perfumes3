// @ts-nocheck — اختبار سلوك: التذكيرات الآلية (المنطق والدالة المجدولة مع fetch مزيّف)
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_REMINDERS, REMINDER_KINDS, REMINDER_KIND_LABELS, cleanReminderConfig, daysUntil, dueReminders, stepFor } from "../../src/reminders/logic";

const NOW = new Date("2026-11-20T06:00:00Z"); // 09:00 الرياض
const ago = (days) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
const P = { id: "p1", title: "عطر الليل", email: "client@x.sa", phone: "0551234567", status: "active", ownerId: "u1", contactId: "c1" };
const base = () => ({ projects: [P], quotes: [], contracts: [], payments: [], items: [], kits: [] });
const kinds = (list) => list.map((r) => r.kind).sort();
const cfg = DEFAULT_REMINDERS;

test("attempt number: nothing before the first delay, then every N days up to the cap", () => {
  assert.equal(stepFor(2.9, 3, 4, 3), 0);
  assert.equal(stepFor(3, 3, 4, 3), 1);
  assert.equal(stepFor(6.9, 3, 4, 3), 1);
  assert.equal(stepFor(7, 3, 4, 3), 2);
  assert.equal(stepFor(11, 3, 4, 3), 3);
  assert.equal(stepFor(100, 3, 4, 3), 3, "capped: no fourth message");
  assert.equal(stepFor(-1, 3, 4, 3), 0);
});

test("calendar days to a due date are counted in Riyadh time", () => {
  assert.equal(daysUntil("2026-11-20", NOW), 0);
  assert.equal(daysUntil("2026-11-23", NOW), 3);
  assert.equal(daysUntil("2026-11-18", NOW), -2);
  // 22:30 بتوقيت UTC = اليوم التالي في الرياض
  assert.equal(daysUntil("2026-11-21", new Date("2026-11-20T22:30:00Z")), 0);
});

test("settings are clamped and default sensibly; every kind is labelled", () => {
  assert.deepEqual(cleanReminderConfig(null), DEFAULT_REMINDERS);
  const c = cleanReminderConfig({ enabled: false, quoteDays: 0, maxRepeats: 99, repeatDays: 2.6, contractDays: "5" });
  assert.equal(c.enabled, false); assert.equal(c.quoteDays, 1); assert.equal(c.maxRepeats, 6); assert.equal(c.repeatDays, 3); assert.equal(c.contractDays, DEFAULT_REMINDERS.contractDays);
  for (const k of REMINDER_KINDS) assert.ok(REMINDER_KIND_LABELS[k].ar && REMINDER_KIND_LABELS[k].en, k);
});

test("quotes: no reply after 3 days; approved but deposit unpaid after 2; paid or fresh ones are silent", () => {
  const d = base();
  d.quotes = [
    { id: "q1", projectId: "p1", ref: "QT-1", status: "sent", total: 11500, deposit: 5750, sentAt: ago(3.2) },
    { id: "q2", projectId: "p1", ref: "QT-2", status: "sent", total: 100, deposit: 50, sentAt: ago(1) },
    { id: "q3", projectId: "p1", ref: "QT-3", status: "accepted", total: 11500, deposit: 5750, decidedAt: ago(2.5) },
    { id: "q4", projectId: "p1", ref: "QT-4", status: "accepted", total: 100, deposit: 0, decidedAt: ago(9) },
    { id: "q5", projectId: "gone", ref: "QT-5", status: "sent", total: 1, deposit: 1, sentAt: ago(9) },
  ];
  const out = dueReminders(d, cfg, NOW);
  assert.deepEqual(kinds(out), ["deposit_due", "quote_pending"]);
  const q = out.find((r) => r.kind === "quote_pending");
  assert.equal(q.key, "quote_pending:q1:1"); assert.equal(q.email, "client@x.sa"); assert.equal(q.path, "/account/projects/p1#pj-offers"); assert.match(q.text, /11,500\.00 ر\.س/);
  assert.match(out.find((r) => r.kind === "deposit_due").text, /نفسه الدفعة الأولى من عقدك/);
  // بعد أسبوع: المحاولة الثانية بمفتاح جديد وعنوان «تذكير»
  d.quotes[0].sentAt = ago(7.5);
  const again = dueReminders(d, cfg, NOW).find((r) => r.kind === "quote_pending");
  assert.equal(again.key, "quote_pending:q1:2"); assert.match(again.subject, /^تذكير: /);
});

test("contracts: unsigned after 3 days; installments remind before the due date, then when overdue with one team task", () => {
  const d = base();
  d.contracts = [
    { id: "c1", projectId: "p1", ref: "CT-1", status: "sent", sentAt: ago(4), total: 1000, schedule: [] },
    { id: "c2", projectId: "p1", ref: "CT-2", status: "signed", sentAt: ago(30), total: 11500, schedule: [
      { id: "a", label: "مقدمة", percent: 50, dueDate: "2026-11-10" },
      { id: "b", label: "إنتاج", percent: 30, dueDate: "2026-11-22" },
      { id: "c", label: "نهائية", percent: 20, dueDate: "2026-12-30" },
      { id: "d", label: "بلا تاريخ", percent: 0 },
    ] },
  ];
  d.payments = [];
  let out = dueReminders(d, cfg, NOW);
  assert.deepEqual(kinds(out), ["contract_unsigned", "installment_due", "installment_overdue", "installment_overdue_team"]);
  const over = out.find((r) => r.kind === "installment_overdue");
  assert.equal(over.key, "installment_overdue:c2:a:3", "10 days late = third attempt"); assert.match(over.text, /5,750\.00 ر\.س/); assert.equal(over.path, "/invoice/due/c2/a");
  const team = out.find((r) => r.kind === "installment_overdue_team");
  assert.equal(team.audience, "team"); assert.equal(team.ownerId, "u1"); assert.equal(team.key, "installment_overdue_team:c2:a:1", "one collection task, not one per attempt");
  const soon = out.find((r) => r.kind === "installment_due");
  assert.equal(soon.key, "installment_due:c2:b:1"); assert.match(soon.subject, /خلال 2 أيام/); assert.match(soon.text, /3,450\.00 ر\.س/);
  // سُدِّدت المتأخرة: تسكت
  d.payments = [{ contractId: "c2", installmentId: "a" }];
  out = dueReminders(d, cfg, NOW);
  assert.ok(!out.some((r) => r.kind.startsWith("installment_overdue")));
  // عقد لم يوقَّع بعد لا يذكّر بدفعاته
  d.contracts[1].status = "sent"; d.contracts[1].sentAt = ago(1);
  assert.ok(!dueReminders(d, cfg, NOW).some((r) => r.kind === "installment_due"));
});

test("designs awaiting approval; client-sent or decided ones are silent", () => {
  const d = base();
  d.items = [
    { id: "i1", projectId: "p1", title: "الملصق", status: "pending", byClient: false, createdAt: ago(3.1) },
    { id: "i2", projectId: "p1", title: "العلبة", status: "approved", byClient: false, createdAt: ago(9) },
    { id: "i3", projectId: "p1", title: "من العميل", status: "pending", byClient: true, createdAt: ago(9) },
  ];
  const out = dueReminders(d, cfg, NOW);
  assert.equal(out.length, 1); assert.equal(out[0].path, "/account/projects/p1#it-i1");
});

test("samples: confirm the address, rate after delivery, approve the formula; the tokenised link opens without sign-in", () => {
  const d = base();
  const kit = (over) => ({ id: "k", ref: "SMP-AAA111", token: "t".repeat(32), email: "kit@x.sa", phone: "", kind: "round", status: "preparing", projectId: null, samples: 2, accepted: 0, createdAt: ago(10), ...over });
  d.kits = [
    kit({ id: "k1", createdAt: ago(2.2) }),
    kit({ id: "k2", ref: "SMP-BBB222", addressConfirmedAt: ago(1) }),
    kit({ id: "k3", ref: "SMP-CCC333", status: "delivered", deliveredAt: ago(3.5) }),
    kit({ id: "k4", ref: "SMP-DDD444", status: "shipped", shippedAt: ago(5) }),
    kit({ id: "k5", ref: "SMP-EEE555", status: "delivered", deliveredAt: ago(9), decidedAt: ago(4), accepted: 2, projectId: "p1" }),
    kit({ id: "k6", ref: "SMP-FFF666", status: "delivered", deliveredAt: ago(9), decidedAt: ago(4), accepted: 1, projectId: "p1", approvedSample: "s1" }),
    kit({ id: "k7", ref: "KIT-GGG777", kind: "kit", samples: 0, status: "delivered", deliveredAt: ago(3.5) }),
    kit({ id: "k8", ref: "KIT-HHH888", kind: "kit", samples: 0, status: "new", createdAt: ago(9) }),
    kit({ id: "k9", ref: "SMP-III999", projectId: "archived", createdAt: ago(9) }),
  ];
  const out = dueReminders(d, cfg, NOW);
  assert.deepEqual(out.map((r) => `${r.kind}:${r.key.split(":")[1]}`).sort(), ["kit_address:k1", "kit_call:k7", "kit_formula:k5", "kit_rating:k3"]);
  const addr = out.find((r) => r.kind === "kit_address");
  assert.equal(addr.email, "kit@x.sa"); assert.equal(addr.path, `/kit/SMP-AAA111?k=${"t".repeat(32)}`);
  assert.match(out.find((r) => r.kind === "kit_formula").text, /قبلتَ 2 عينات/);
  assert.equal(out.find((r) => r.kind === "kit_formula").email, "kit@x.sa");
  assert.equal(out.find((r) => r.kind === "kit_call").path, "/book?kit=KIT-GGG777");
  // شُحنت منذ 8 أيام بلا تأكيد وصول: نذكّر بالتقييم
  d.kits = [kit({ id: "k4", status: "shipped", shippedAt: ago(8) })];
  assert.deepEqual(kinds(dueReminders(d, cfg, NOW)), ["kit_rating"]);
});

test("switched off, or a project on hold: nothing goes out", () => {
  const d = base();
  d.quotes = [{ id: "q1", projectId: "p1", ref: "QT-1", status: "sent", total: 1, deposit: 1, sentAt: ago(9) }];
  assert.equal(dueReminders(d, { ...cfg, enabled: false }, NOW).length, 0);
  d.projects = [{ ...P, status: "on_hold" }];
  assert.equal(dueReminders(d, cfg, NOW).length, 0);
});

// ─── الدالة المجدولة ───
const ENV = { CRON_SECRET: "c".repeat(40), SUPABASE_URL: "https://db.example", SUPABASE_SERVICE_ROLE_KEY: "svc", SITE_URL: "https://site.example", RESEND_API_KEY: "re", NOTIFY_EMAIL_FROM: "a@site.example" };
async function withApi(tables, fn, { claim = (keys) => keys, ops = null } = {}) {
  const before = { ...process.env }; Object.assign(process.env, ENV);
  const calls = []; const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url); calls.push({ url: u, init });
    if (u.includes("/rest/v1/rpc/reminder_claim")) return new Response(JSON.stringify(claim(JSON.parse(init.body).p.map((x) => x.key))), { status: 200 });
    if (u.includes("/rest/v1/tasks")) return new Response("", { status: 201 });
    if (u.includes("/rest/v1/site_content")) return new Response(JSON.stringify(ops ? [{ value: ops }] : []), { status: 200 });
    const t = u.match(/\/rest\/v1\/([a-z_]+)/)?.[1];
    if (t) return new Response(JSON.stringify(tables[t] ?? []), { status: 200 });
    if (u.includes("resend.com")) return new Response("{}", { status: 200 });
    return new Response("{}", { status: 404 });
  };
  try { return await fn(calls); } finally { globalThis.fetch = real; for (const k of Object.keys(ENV)) { if (before[k] === undefined) delete process.env[k]; else process.env[k] = before[k]; } }
}
const iso = (days) => new Date(Date.now() - days * 86_400_000).toISOString();
const TABLES = () => ({
  projects: [{ id: "p1", title: "عطر الليل", client_email: "client@x.sa", status: "active", owner_id: "u1", contact_id: "c1" }],
  contacts: [{ id: "c1", phone: "0551234567" }],
  project_quotes: [{ id: "q1", project_id: "p1", ref: "QT-1", status: "sent", total: 11500, deposit: 5750, sent_at: iso(4) }],
  project_contracts: [{ id: "c2", project_id: "p1", ref: "CT-2", status: "signed", sent_at: iso(40), total: 1000, quote_id: null, schedule: [{ id: "a", label: "مقدمة", percent: 100, due_date: "2020-01-01" }] }],
  contract_payments: [],
  project_items: [],
  kit_orders: [{ id: "k1", ref: "SMP-AAA111", token: "t".repeat(32), email: "kit@x.sa", phone: "", kind: "round", status: "delivered", project_id: null, samples: [{ id: "s1", name: "x" }, { id: "s2", name: "y", decision: "accepted" }], decided_at: null, created_at: iso(20), delivered_at: iso(4) }],
});

test("cron endpoint: needs the secret; a dry run lists what is due without claiming or sending", async () => {
  const { GET } = await import("../../api/reminders");
  await withApi(TABLES(), async (calls) => {
    assert.equal((await GET(new Request("https://x/api/reminders"))).status, 401);
    assert.equal((await GET(new Request("https://x/api/reminders", { headers: { authorization: "Bearer wrong" } }))).status, 401);
    assert.equal(calls.length, 0, "no database read without the secret");
    const r = await GET(new Request("https://x/api/reminders?dry=1", { headers: { authorization: `Bearer ${ENV.CRON_SECRET}` } }));
    const body = await r.json();
    assert.equal(r.status, 200); assert.equal(body.dry, true);
    assert.deepEqual(body.due.map((x) => x.kind).sort(), ["installment_overdue", "installment_overdue_team", "kit_rating", "quote_pending"]);
    assert.ok(!calls.some((c) => c.url.includes("reminder_claim") || c.url.includes("resend")));
  });
});

test("cron endpoint: claims first, emails only what it claimed, creates the team task, and a second run sends nothing", async () => {
  const { GET } = await import("../../api/reminders");
  const claimed = new Set();
  const claim = (keys) => keys.filter((k) => !claimed.has(k) && claimed.add(k));
  const hdr = { headers: { authorization: `Bearer ${ENV.CRON_SECRET}` } };
  await withApi(TABLES(), async (calls) => {
    const body = await (await GET(new Request("https://x/api/reminders", hdr))).json();
    assert.equal(body.due, 4); assert.equal(body.claimed, 4); assert.equal(body.sent, 3); assert.equal(body.tasks, 1); assert.deepEqual(body.failed, []);
    const mails = calls.filter((c) => c.url.includes("resend")).map((c) => JSON.parse(c.init.body));
    assert.deepEqual(mails.map((m) => m.to[0]).sort(), ["client@x.sa", "client@x.sa", "kit@x.sa"]);
    const rating = mails.find((m) => m.to[0] === "kit@x.sa");
    assert.match(rating.text, new RegExp(`https://site\\.example/kit/SMP-AAA111\\?k=${"t".repeat(32)}`)); assert.match(rating.html, /قيّم العينات/);
    const task = JSON.parse(calls.find((c) => c.url.includes("/rest/v1/tasks")).init.body);
    assert.match(task.title, /^تحصيل: دفعة «مقدمة»/); assert.equal(task.assignee_id, "u1"); assert.equal(task.contact_id, "c1");
    const claimCall = calls.findIndex((c) => c.url.includes("reminder_claim"));
    assert.ok(claimCall < calls.findIndex((c) => c.url.includes("resend")), "claimed before anything is sent");
    calls.length = 0;
    const again = await (await GET(new Request("https://x/api/reminders", hdr))).json();
    assert.equal(again.claimed, 0); assert.equal(again.sent, 0);
    assert.ok(!calls.some((c) => c.url.includes("resend") || c.url.includes("/rest/v1/tasks")));
  }, { claim });
});

test("cron endpoint: respects the control-centre switch and delays", async () => {
  const { POST } = await import("../../api/reminders");
  const hdr = { method: "POST", headers: { authorization: `Bearer ${ENV.CRON_SECRET}` } };
  await withApi(TABLES(), async (calls) => {
    const body = await (await POST(new Request("https://x/api/reminders", hdr))).json();
    assert.equal(body.disabled, true); assert.ok(!calls.some((c) => c.url.includes("resend")));
  }, { ops: { reminders: { enabled: false } } });
  await withApi(TABLES(), async () => {
    const body = await (await POST(new Request("https://x/api/reminders?dry=1", hdr))).json();
    assert.ok(!body.due.some((x) => x.kind === "quote_pending"), "a 10-day delay silences the 4-day-old quote");
  }, { ops: { reminders: { quoteDays: 10 } } });
});
