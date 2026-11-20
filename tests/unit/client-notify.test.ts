// @ts-nocheck — اختبار سلوك (fetch مزيّف)
import { test } from "node:test";
import assert from "node:assert/strict";
import { noticeFor, waNumber, POST } from "../../api/client-notify";
const t = (n, f) => test(n, f);
const P = '11111111-2222-3333-4444-555555555555';
await t('design sent for approval → notice with deep link', () => {
  const n = noticeFor({ table: 'project_items', type: 'INSERT', record: { id: 'I1', project_id: P, title: 'الملصق', version: 2, by_client: false, status: 'pending' } }, 'مسك الليل');
  assert.equal(n.subject, 'تصميم بانتظار اعتمادك: الملصق'); assert.match(n.text, /\(نسخة 2\)/); assert.equal(n.path, `/account/projects/${P}#it-I1`);
});
await t('client-sent design and superseding updates are silent', () => {
  assert.equal(noticeFor({ table: 'project_items', type: 'INSERT', record: { project_id: P, by_client: true, status: 'submitted' } }, 'x'), null);
  assert.equal(noticeFor({ table: 'project_items', type: 'UPDATE', record: { project_id: P, status: 'superseded' } }, 'x'), null);
});
await t('quote sent / paid; other quote updates silent', () => {
  assert.match(noticeFor({ table: 'project_quotes', type: 'UPDATE', record: { project_id: P, status: 'sent', ref: 'QT-1', total: 13800 }, old_record: { status: 'draft' } }, 'p').text, /13,800.00 ر.س/);
  assert.match(noticeFor({ table: 'project_quotes', type: 'UPDATE', record: { project_id: P, status: 'paid', ref: 'QT-1', paid_amount: 6900 }, old_record: { status: 'accepted' } }, 'p').subject, /استلمنا العربون/);
  assert.equal(noticeFor({ table: 'project_quotes', type: 'UPDATE', record: { project_id: P, status: 'accepted' }, old_record: { status: 'sent' } }, 'p'), null);
  assert.equal(noticeFor({ table: 'project_quotes', type: 'UPDATE', record: { project_id: P, status: 'void' }, old_record: { status: 'sent' } }, 'p'), null);
});
await t('stage change uses the track labels and names the next stage', () => {
  const n = noticeFor({ table: 'projects', type: 'UPDATE', record: { id: P, track: 'A', stage: 'formula' }, old_record: { stage: 'brief' } }, 'مسك');
  assert.equal(n.subject, 'مشروعك «مسك» انتقل إلى: التركيبة والعينات'); assert.match(n.text, /المرحلة التالية: الهوية والعبوة/);
  assert.match(noticeFor({ table: 'projects', type: 'UPDATE', record: { id: P, track: 'F', stage: 'delivered' }, old_record: { stage: 'printing' } }, 'x').text, /اكتمل/);
  assert.equal(noticeFor({ table: 'projects', type: 'UPDATE', record: { id: P, stage: 'brief', title: 'new' }, old_record: { stage: 'brief' } }, 'x'), null);
});
await t('Saudi numbers normalised for WhatsApp; others dropped', () => {
  assert.equal(waNumber('055 123 4567'), '966551234567'); assert.equal(waNumber('+966551234567'), '966551234567'); assert.equal(waNumber('551234567'), '966551234567'); assert.equal(waNumber('0112345678'), ''); assert.equal(waNumber(''), '');
});
await t('secret required', async () => {
  process.env.LEAD_WEBHOOK_SECRET = 's'.repeat(40);
  const r = await POST(new Request('https://x/api/client-notify', { method: 'POST', headers: { 'x-webhook-secret': 'nope' }, body: '{}' })); assert.equal(r.status, 401);
});

await t('contract sent and fully signed → client notices with a deep link', () => {
  const sent = noticeFor({ table: 'project_contracts', type: 'UPDATE', record: { project_id: P, ref: 'CT-260001', status: 'sent' }, old_record: { status: 'draft' } }, 'مسك الليل');
  assert.equal(sent.subject, 'عقد CT-260001 بانتظار توقيعك');
  assert.equal(sent.path, `/account/projects/${P}#pj-contract`);
  const signed = noticeFor({ table: 'project_contracts', type: 'UPDATE', record: { project_id: P, ref: 'CT-260001', status: 'signed' }, old_record: { status: 'client_signed' } }, 'مسك الليل');
  assert.match(signed.subject, /اكتمل توقيع العقد/);
  assert.equal(noticeFor({ table: 'project_contracts', type: 'UPDATE', record: { project_id: P, status: 'client_signed' }, old_record: { status: 'sent' } }, 'x'), null, 'the client signing is not notified back to the client');
});

await t('kit shipped → tracking message; delivered → call invitation; other changes silent', async () => {
  const { kitNoticeFor } = await import("../../api/client-notify");
  const shipped = kitNoticeFor({ table: 'kit_orders', type: 'UPDATE', record: { id: P, ref: 'KIT-7F3K9Q', status: 'shipped', carrier: 'SMSA', tracking_no: '2901', tracking_url: 'https://www.smsaexpress.com/trackingdetails?tracknumbers=2901', email: 'spoof@x.sa' }, old_record: { status: 'preparing' } });
  assert.equal(shipped.subject, 'شُحنت عينة الاكتشاف KIT-7F3K9Q');
  assert.match(shipped.text, /عبر SMSA/); assert.match(shipped.text, /رقم التتبع: 2901/); assert.match(shipped.text, /smsaexpress\.com/);
  assert.equal(shipped.path, '/kit/KIT-7F3K9Q');
  const hand = kitNoticeFor({ table: 'kit_orders', type: 'UPDATE', record: { id: P, ref: 'KIT-ABC123', status: 'shipped', carrier: 'Hand', tracking_no: '', tracking_url: '' }, old_record: { status: 'new' } });
  assert.equal(hand.text, 'شُحنت عيناتك KIT-ABC123 عبر Hand.');
  const delivered = kitNoticeFor({ table: 'kit_orders', type: 'UPDATE', record: { id: P, ref: 'KIT-7F3K9Q', status: 'delivered' }, old_record: { status: 'shipped' } });
  assert.match(delivered.subject, /وصلت عينة الاكتشاف/); assert.match(delivered.text, /مكالمة المتابعة/); assert.equal(delivered.path, '/book?kit=KIT-7F3K9Q');
  assert.equal(kitNoticeFor({ table: 'kit_orders', type: 'UPDATE', record: { id: P, ref: 'KIT-7F3K9Q', status: 'preparing' }, old_record: { status: 'new' } }), null, 'preparing is internal');
  assert.equal(kitNoticeFor({ table: 'kit_orders', type: 'UPDATE', record: { id: P, ref: 'KIT-7F3K9Q', status: 'shipped', note: 'x' }, old_record: { status: 'shipped' } }), null, 'same status is silent');
  assert.equal(kitNoticeFor({ table: 'kit_orders', type: 'INSERT', record: { id: P, status: 'new' } }), null);
});

await t('sample rounds: created → confirm address; shipped → rate by name; delivered unrated → reminder; rated by the client → silent', async () => {
  const { kitNoticeFor, noticeFor } = await import("../../api/client-notify");
  const samples = [{ id: 's1', name: 'مسك الليل' }, { id: 's2', name: 'ورد' }];
  const created = kitNoticeFor({ table: 'kit_orders', type: 'INSERT', record: { id: P, ref: 'SMP-ABC234', kind: 'round', status: 'new', samples } });
  assert.match(created.subject, /أكّد عنوان التسليم/); assert.match(created.text, /2 عينات بأسمائها/); assert.equal(created.path, '/kit/SMP-ABC234');
  assert.equal(kitNoticeFor({ table: 'kit_orders', type: 'INSERT', record: { id: P, ref: 'KIT-7F3K9Q', kind: 'kit', status: 'new' } }), null, 'a paid kit is confirmed by the payment flow');
  const shipped = kitNoticeFor({ table: 'kit_orders', type: 'UPDATE', record: { id: P, ref: 'SMP-ABC234', kind: 'round', status: 'shipped', carrier: 'SMSA', tracking_no: '77', samples }, old_record: { status: 'preparing' } });
  assert.equal(shipped.subject, 'شُحنت جولة العينات SMP-ABC234'); assert.match(shipped.text, /اقبل أو ارفض كل عينة باسمها/);
  const delivered = kitNoticeFor({ table: 'kit_orders', type: 'UPDATE', record: { id: P, ref: 'SMP-ABC234', kind: 'round', status: 'delivered', samples }, old_record: { status: 'shipped' } });
  assert.match(delivered.subject, /قيّمها بالاسم/); assert.equal(delivered.path, '/kit/SMP-ABC234');
  assert.equal(kitNoticeFor({ table: 'kit_orders', type: 'UPDATE', record: { id: P, ref: 'SMP-ABC234', kind: 'round', status: 'delivered', decided_at: '2026-11-06T00:00:00Z', samples }, old_record: { status: 'shipped' } }), null, 'the client just rated them: nothing to tell');
  const paid = noticeFor({ table: 'contract_payments', type: 'INSERT', record: { id: P, project_id: P, label: 'دفعة مقدمة', amount: 5750, invoice_no: 'INV-2026-00007' } }, 'عطر الليل');
  assert.match(paid.subject, /INV-2026-00007/); assert.match(paid.text, /5,750\.00 ر\.س/); assert.equal(paid.path, `/invoice/${P}`);
});

await t('kit webhook adds the sheet token from the database so the link opens without sign-in', async () => {
  const { POST } = await import("../../api/client-notify");
  const env = { LEAD_WEBHOOK_SECRET: 's'.repeat(40), SITE_URL: 'https://site.example', SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_ROLE_KEY: 'k', RESEND_API_KEY: 'r', NOTIFY_EMAIL_FROM: 'a@site.example' };
  const before = { ...process.env }; Object.assign(process.env, env);
  const calls = []; const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('/rest/v1/kit_orders')) return new Response(JSON.stringify([{ email: 'real@x.sa', phone: '', ref: 'SMP-ABC234', token: '0123456789abcdef0123456789abcdef' }]), { status: 200 });
    return new Response('{}', { status: 200 });
  };
  try {
    const r = await POST(new Request('https://x/api/client-notify', { method: 'POST', headers: { 'x-webhook-secret': 's'.repeat(40) }, body: JSON.stringify({ type: 'INSERT', table: 'kit_orders', record: { id: P, ref: 'SMP-ABC234', kind: 'round', status: 'new', samples: [{ id: 's1', name: 'x' }], token: 'spoofed' } }) }));
    assert.equal(r.status, 200);
    assert.match(calls[0].url, /select=email,phone,ref,token/);
    const mail = JSON.parse(calls.find((c) => c.url.includes('resend')).init.body);
    assert.match(mail.text, /https:\/\/site\.example\/kit\/SMP-ABC234\?k=0123456789abcdef0123456789abcdef/);
    assert.ok(!mail.text.includes('spoofed'));
  } finally { globalThis.fetch = realFetch; for (const k of Object.keys(env)) { if (before[k] === undefined) delete process.env[k]; else process.env[k] = before[k]; } }
});

await t('kit webhook: recipient read from the database row, email + whatsapp sent, spoofed event email ignored', async () => {
  process.env.LEAD_WEBHOOK_SECRET = 's'.repeat(40);
  process.env.SUPABASE_URL = 'https://db.example'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'; process.env.SITE_URL = 'https://site.example/';
  process.env.RESEND_API_KEY = 'r'; process.env.NOTIFY_EMAIL_FROM = 'x@site.example';
  process.env.WHATSAPP_TOKEN = 'w'; process.env.WHATSAPP_PHONE_NUMBER_ID = '1'; process.env.CLIENT_WHATSAPP_TEMPLATE = 'tpl';
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null });
    if (String(url).includes('/rest/v1/kit_orders')) return new Response(JSON.stringify([{ email: 'real@x.sa', phone: '0551234567', ref: 'KIT-7F3K9Q' }]), { status: 200 });
    return new Response('{}', { status: 200 });
  };
  try {
    const r = await POST(new Request('https://x/api/client-notify', { method: 'POST', headers: { 'x-webhook-secret': 's'.repeat(40) }, body: JSON.stringify({ type: 'UPDATE', table: 'kit_orders', record: { id: P, ref: 'KIT-7F3K9Q', status: 'shipped', carrier: 'SMSA', tracking_no: '2901', email: 'spoof@x.sa' }, old_record: { status: 'preparing' } }) }));
    const body = await r.json();
    assert.equal(r.status, 200); assert.deepEqual(body.sent.sort(), ['email', 'whatsapp']);
    assert.match(calls[0].url, /kit_orders\?id=eq\./);
    const mail = calls.find((c) => c.url.includes('resend')).body;
    assert.deepEqual(mail.to, ['real@x.sa']); assert.match(mail.text, /https:\/\/site\.example\/kit\/KIT-7F3K9Q/); assert.match(mail.html, /تابع شحنتك/);
    const wa = calls.find((c) => c.url.includes('graph.facebook')).body;
    assert.equal(wa.to, '966551234567');
    // لا شيء يُرسل لتغيير داخلي
    calls.length = 0;
    const r2 = await POST(new Request('https://x/api/client-notify', { method: 'POST', headers: { 'x-webhook-secret': 's'.repeat(40) }, body: JSON.stringify({ type: 'UPDATE', table: 'kit_orders', record: { id: P, ref: 'KIT-7F3K9Q', status: 'preparing' }, old_record: { status: 'new' } }) }));
    assert.equal((await r2.json()).skipped, 'nothing_to_tell'); assert.equal(calls.length, 0, 'no db or channel call for internal changes');
  } finally {
    globalThis.fetch = realFetch;
    for (const k of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SITE_URL','RESEND_API_KEY','NOTIFY_EMAIL_FROM','WHATSAPP_TOKEN','WHATSAPP_PHONE_NUMBER_ID','CLIENT_WHATSAPP_TEMPLATE']) delete process.env[k];
  }
});

await t('production: maceration start explains the wait with the earliest fill date; release announces the batch', () => {
  const mac = noticeFor({ table: 'production_orders', type: 'UPDATE', record: { id: 'x', project_id: P, batch_no: 'B261114-01', maceration_start: '2026-11-14T08:00:00Z', maceration_days: 21, status: 'in_progress', qty: 2000 }, old_record: { maceration_start: null, status: 'in_progress' } }, 'مسك الليل');
  assert.equal(mac.subject, 'بدأ تعتيق عطرك — تشغيلة B261114-01');
  assert.match(mac.text, /يرتاح 21 يوماً/); assert.match(mac.text, /5 ديسمبر/);
  assert.equal(mac.path, `/account/projects/${P}#pj-production`);
  const rel = noticeFor({ table: 'production_orders', type: 'UPDATE', record: { id: 'x', project_id: P, batch_no: 'B261114-01', status: 'released', qty: 2000, maceration_start: '2026-11-14T08:00:00Z', maceration_days: 21 }, old_record: { status: 'in_progress', maceration_start: '2026-11-14T08:00:00Z' } }, 'مسك الليل');
  assert.match(rel.subject, /اكتمل تصنيع «مسك الليل»/); assert.match(rel.text, /2,000 وحدة/);
  assert.equal(noticeFor({ table: 'production_orders', type: 'UPDATE', record: { id: 'x', project_id: P, status: 'in_progress', note: 'x' }, old_record: { status: 'in_progress' } }, 'x'), null, 'internal edits are silent');
  assert.equal(noticeFor({ table: 'production_orders', type: 'UPDATE', record: { id: 'x', project_id: null, status: 'released' }, old_record: { status: 'in_progress' } }, 'x'), null, 'internal batches notify nobody');
});
