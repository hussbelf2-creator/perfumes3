// عميل حقيقي واحد على Supabase حي، من الطلب إلى الفاتورة ثم إعادة الطلب:
// طلب بمرفقات (تخزين) ← عرض سعر ← عينات مسمّاة محجوبة الكميات ← تأكيد العنوان ← تقييم واعتماد التركيبة ←
// عقد بجدول دفعات ← توقيع ← العربون عبر بوابة الدفع يسدّد الدفعة الأولى ويصدر فاتورتها ← الدفعة الثانية ←
// أمر إنتاج بلقطة التركيبة ← التذكيرات الآلية ← إعادة الطلب بنقرة.
const { execFileSync } = require('child_process');
const path = require('path');
const { chromium, B, sql, newCtx, login, harness, VERIFY, FIX, OUT } = require('./lib.cjs');
const ROOT = path.join(__dirname, '..', '..');
const EMAIL = 'salem@live.test';
(async () => {
  const browser = await chromium.launch();
  const { results, errors, run } = harness(OUT);
  // بداية نظيفة لكل تشغيل
  sql(`delete from public.reminder_log;
    delete from public.rate_events where bucket like 'lead:%';
    delete from public.contract_payments where project_id in (select id from public.projects where client_email in ('${EMAIL}','other@live.test'));
    delete from public.production_orders where project_id in (select id from public.projects where client_email='${EMAIL}');
    delete from public.kit_orders where email='${EMAIL}';
    delete from public.tasks where title like '%سالم%' or title like '%تحصيل%' or title like '%إعادة طلب%' or title like '%تركيبة معتمدة%';
    delete from public.projects where client_email in ('${EMAIL}','other@live.test');
    delete from public.leads where payload ->> 'email' = '${EMAIL}';
    delete from public.contacts where email='${EMAIL}';
    delete from auth.users where email in ('${EMAIL}','other@live.test');
    insert into public.site_content (key, value) values ('site', '{"billing":{"legalName":"شركة مصنع العطور","vatNumber":"310122393500003","cr":"1010101010","bankName":"مصرف الراجحي","iban":"SA0380000000608010167519"}}')
      on conflict (key) do update set value = public.site_content.value || excluded.value;`.replace(/\s+/g, ' '));
  const client = await newCtx(browser);
  const sales = await newCtx(browser);
  const perfumer = await newCtx(browser, 'ar', { geolocation: { latitude: 24.7136, longitude: 46.6753 }, permissions: ['geolocation'] });
  const anon = await newCtx(browser);
  const stranger = await newCtx(browser);
  for (const ctx of [client, sales, perfumer, anon, stranger]) {
    await ctx.route(/readdy\.ai\/api\/form/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"code":"OK"}' }));
    await ctx.route('**/api/payments/verify*', async (r) => { const u = new URL(r.request().url()); const res = await fetch(VERIFY + u.pathname + u.search); r.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() }); });
  }
  const toast = (p, re) => p.getByRole('status').filter({ hasText: re }).first().waitFor({ timeout: 12000 });
  const drawSignature = async (p) => {
    const box = await p.getByTestId('signature-canvas').boundingBox();
    await p.mouse.move(box.x + 40, box.y + 100);
    await p.mouse.down();
    for (let i = 1; i <= 20; i++) await p.mouse.move(box.x + 40 + i * 18, box.y + 100 + Math.sin(i / 2) * 30);
    await p.mouse.up();
  };
  const reminders = (dry) => JSON.parse(execFileSync(process.execPath, ['--env-file=tests/live/.out/live.env', '--import', './tests/unit/setup.mjs', '--import', 'jiti/register', 'tests/live/reminders-run.ts', ...(dry ? ['dry'] : [])], { cwd: ROOT }).toString().trim().split('\n').pop());
  let pid = '', kitRef = '', token = '', contractId = '', invoice1 = '';

  await run('client: request with attachments → account → project; the files land in private storage', client, async (p) => {
    await p.goto(B + '/start/E', { waitUntil: 'networkidle' });
    for (const s of ['نعم، جاهزة', 'نعم', '300 – 1,000', 'مرن']) await p.getByText(s, { exact: true }).first().click();
    await p.locator('fieldset').filter({ hasText: 'الباقة الأقرب لك' }).locator('label').first().click();
    await p.getByRole('button', { name: /أضف تفاصيل/ }).click();
    await p.getByTestId('start-files-input').setInputFiles([`${FIX}/brief.pdf`, `${FIX}/photo-bottle.jpg`]);
    await p.getByTestId('start-files-list').locator('li').nth(1).waitFor();
    await p.getByRole('button', { name: 'التالي' }).click();
    await p.getByLabel('الاسم الأول').fill('سالم'); await p.getByLabel('اسم العائلة').fill('الدوسري');
    await p.getByLabel('البريد الإلكتروني').fill(EMAIL); await p.getByLabel('الجوال (واتساب)').fill('0553335555');
    await p.getByLabel('كلمة المرور (8 أحرف على الأقل)').fill('Passw0rd!x');
    await p.getByRole('button', { name: 'أنشئ حسابي وأرسل الطلب' }).click();
    await p.waitForURL(/\/account\/projects\/[0-9a-f-]{36}\?new=1$/, { timeout: 20000 });
    pid = new URL(p.url()).pathname.split('/').pop();
    const note = p.getByTestId('notes-thread').getByTestId('note').filter({ hasText: 'مرفقات طلبي' });
    await note.waitFor({ timeout: 20000 });
    await note.locator('[data-kind="image"] img').waitFor({ timeout: 15000 });
    if (!(await note.locator('[data-kind="image"] img').evaluate((i) => i.complete && i.naturalWidth > 0))) throw new Error('image did not load from the signed URL');
    const files = sql(`select string_agg(f ->> 'path', ',') from public.project_comments c, jsonb_array_elements(c.files) f where c.project_id='${pid}'`);
    if (files.split(',').length !== 2 || !files.split(',').every((x) => x.startsWith(`sb:projects/${pid}/`))) throw new Error('attachment paths ' + files);
    if (sql(`select count(*) from storage.objects where bucket_id='projects' and name like '${pid}/%'`) !== '2') throw new Error('objects not in storage');
    if (sql(`select count(*) from public.projects where id='${pid}' and client_id is not null and track='E'`) !== '1') throw new Error('project not linked to the account');
  });

  await run('sales: prices the request and sends the quote', sales, async (p) => {
    await login(p, 'sales@live.test');
    await p.goto(`${B}/admin/projects/${pid}`, { waitUntil: 'networkidle' });
    await p.getByTestId('notes-thread').getByTestId('note').filter({ hasText: 'مرفقات طلبي' }).locator('[data-kind="file"]').waitFor();
    await p.getByRole('button', { name: 'أنشئ عرض السعر' }).click();
    await p.getByLabel('وصف البند 1').fill('عطر 50 مل');
    await p.getByLabel('كمية البند 1').fill('1000');
    await p.getByLabel('سعر وحدة البند 1').fill('10');
    await p.getByRole('button', { name: 'حفظ وإرسال للعميل' }).click();
    await toast(p, /أُرسل|أرسل/);
    if (sql(`select concat_ws('|', status, total, deposit) from public.project_quotes where project_id='${pid}'`) !== 'sent|11500.00|5750.00') throw new Error('quote ' + sql(`select concat_ws('|', status, total, deposit) from public.project_quotes where project_id='${pid}'`));
  });

  await run('client approves the quote', client, async (p) => {
    await p.goto(`${B}/account/projects/${pid}`, { waitUntil: 'networkidle' });
    await p.getByTestId('quote-total').filter({ hasText: '11,500.00' }).waitFor();
    await p.getByRole('button', { name: 'اعتمد العرض' }).click();
    await p.getByRole('button', { name: 'تأكيد الاعتماد' }).click();
    await toast(p, /اعتُمد العرض/);
  });

  await run('perfumer: a named sample round for the project, ingredients with amounts', perfumer, async (p) => {
    await login(p, 'perfumer@live.test');
    await p.goto(`${B}/admin/kits?new=1&project=${pid}`, { waitUntil: 'networkidle' });
    const f = p.getByTestId('new-round');
    await f.waitFor();
    await p.waitForFunction((e) => document.querySelector('[data-testid="round-email"]')?.value === e, EMAIL, { timeout: 10000 });
    const rows = f.getByTestId('sample-row');
    await rows.nth(0).getByTestId('sample-name').fill('عود الفجر');
    await rows.nth(0).getByTestId('add-ingredient').click();
    await rows.nth(0).getByLabel('المكوّن', { exact: true }).fill('عود كمبودي');
    await rows.nth(0).getByLabel('الكمية', { exact: true }).fill('4.5');
    await rows.nth(1).getByTestId('sample-name').fill('ورد المساء');
    await rows.nth(1).getByTestId('add-ingredient').click();
    await rows.nth(1).getByLabel('المكوّن', { exact: true }).fill('ورد طائفي');
    await rows.nth(1).getByLabel('الكمية', { exact: true }).fill('5');
    if ((await f.getByTestId('round-disclosure').locator('select').inputValue()) !== 'contract') throw new Error('default disclosure');
    await f.getByTestId('round-create').click();
    await toast(p, /أُنشئت جولة العينات/);
    const row = sql(`select concat_ws('|', ref, token, disclosure, kind, jsonb_array_length(samples)) from public.kit_orders where project_id='${pid}'`).split('|');
    [kitRef, token] = row;
    if (!/^SMP-[A-Z0-9]{6}$/.test(kitRef) || !/^[0-9a-f]{32}$/.test(token) || row[2] !== 'contract' || row[3] !== 'round' || row[4] !== '2') throw new Error('round ' + row.join('|'));
  });

  await run('QR link without sign-in: names shown, amounts hidden before the contract; the client confirms the address', anon, async (p) => {
    await p.goto(`${B}/kit/${kitRef}`, { waitUntil: 'networkidle' });
    await p.getByTestId('kit-track').waitFor();
    if (await p.getByTestId('sample-card').count()) throw new Error('samples shown without the token');
    await p.goto(`${B}/kit/${kitRef}?k=${token}`, { waitUntil: 'networkidle' });
    await p.getByTestId('disclosure-note').waitFor();
    const card = p.getByTestId('sample-card').first();
    await card.locator('summary').click();
    const table = await card.getByTestId('sample-ingredients').textContent();
    if (!table.includes('عود كمبودي') || table.includes('4.5')) throw new Error('disclosure leak: ' + table);
    const f = p.getByTestId('address-confirm');
    await f.locator('#kit-addr-city').fill('Riyadh');
    await f.locator('#kit-addr-district').fill('الياسمين');
    await f.getByTestId('maps-link').fill('https://www.google.com/maps/place/X/@24.8301,46.6601,17z');
    await f.getByTestId('maps-link-apply').click();
    await f.getByTestId('address-save').click();
    await p.getByTestId('address-confirmed').waitFor({ timeout: 10000 });
    if (sql(`select concat_ws('|', city, district, lat, lng, address_confirmed_at is not null) from public.kit_orders where ref='${kitRef}'`) !== 'Riyadh|الياسمين|24.830100|46.660100|t') throw new Error('address ' + sql(`select concat_ws('|', city, district, lat, lng) from public.kit_orders where ref='${kitRef}'`));
    // الورقة المطبوعة برمزها: نفس الحجب
    await p.goto(`${B}/kit/${kitRef}/sheet?k=${token}`, { waitUntil: 'networkidle' });
    const sheet = await p.getByTestId('sheet-doc').textContent();
    if (!sheet.includes('عود كمبودي') || sheet.includes('4.5') || !(await p.getByTestId('sheet-disclosure').count())) throw new Error('sheet disclosure');
    if (!(await p.locator('svg[data-qr]').getAttribute('data-qr')).endsWith(`/kit/${kitRef}?k=${token}`)) throw new Error('qr');
  });

  await run('perfumer ships; the client rates by name and approves the formula → project formula, team-only ingredients', perfumer, async (p) => {
    await p.goto(`${B}/admin/kits`, { waitUntil: 'networkidle' });
    await p.getByTestId('kits-table').locator('tbody tr').filter({ hasText: kitRef }).first().click();
    const d = p.getByTestId('kit-detail');
    await d.getByTestId('kit-address-confirmed').waitFor();
    await d.getByRole('radio', { name: 'شُحن' }).click();
    await d.getByRole('combobox', { name: /شركة الشحن/ }).selectOption('SMSA');
    await d.getByLabel('رقم التتبع').fill('290555000111');
    await d.getByRole('button', { name: 'حفظ' }).click();
    await toast(p, /سُجِّل الشحن/);
    const q = await anon.newPage();
    await q.goto(`${B}/kit/${kitRef}?k=${token}`, { waitUntil: 'networkidle' });
    const f = q.getByTestId('sample-decisions');
    await f.getByTestId('sample-card').filter({ hasText: 'عود الفجر' }).getByTestId('accept').click();
    await f.getByTestId('sample-card').filter({ hasText: 'ورد المساء' }).getByTestId('reject').click();
    await f.getByTestId('sample-card').filter({ hasText: 'ورد المساء' }).getByTestId('sample-comment').fill('حلوة أكثر من اللازم');
    await f.getByTestId('decisions-submit').click();
    await q.getByTestId('decisions-done').waitFor({ timeout: 10000 });
    q.once('dialog', (dlg) => dlg.accept());
    await q.getByTestId('approve-formula').click();
    await q.getByTestId('formula-approved').waitFor({ timeout: 10000 });
    await q.close();
    const row = sql(`select concat_ws('|', k.status, k.approved_sample is not null, p.formula ->> 'name', p.formula ->> 'by', (select jsonb_array_length(ingredients) from public.project_formulas f where f.project_id = p.id), (select ingredients -> 0 ->> 'amount' from public.project_formulas f where f.project_id = p.id)) from public.kit_orders k join public.projects p on p.id = k.project_id where k.ref='${kitRef}'`);
    if (row !== 'delivered|t|عود الفجر|client|1|4.5') throw new Error('formula ' + row);
    if (sql(`select count(*) from public.tasks where title like 'راجع تقييم العميل لعينات ${kitRef}%' or title like 'تركيبة معتمدة لمشروع%'`) !== '2') throw new Error('team tasks missing');
    // الفريق يرى التركيبة بمكوّناتها في صفحة المشروع
    await p.goto(`${B}/admin/projects/${pid}`, { waitUntil: 'networkidle' });
    await p.getByTestId('project-formula').getByText('عود الفجر').waitFor();
    await p.getByTestId('project-rounds').getByText(kitRef).waitFor();
  });

  await run('client account: the project shows the approved formula and the round; no direct table access', client, async (p) => {
    await p.goto(`${B}/account/projects/${pid}`, { waitUntil: 'networkidle' });
    await p.getByTestId('project-formula').getByText('عود الفجر').waitFor();
    await p.getByTestId('project-samples').getByTestId('kit-card').filter({ hasText: kitRef }).waitFor();
    await p.goto(`${B}/account/samples`, { waitUntil: 'networkidle' });
    await p.getByTestId('kit-card').filter({ hasText: kitRef }).locator('[data-decision="accepted"]').waitFor();
    const direct = await p.evaluate(async () => {
      const k = Object.keys(localStorage).find((x) => x.startsWith('sb-') && x.endsWith('-auth-token'));
      const tok = JSON.parse(localStorage.getItem(k)).access_token;
      const h = { apikey: window.__ANON__ || '', authorization: `Bearer ${tok}` };
      return tok ? { tok } : null;
    });
    if (!direct) throw new Error('no session');
    const res = await fetch(`${require('./lib.cjs').API}/rest/v1/kit_orders?select=ref,samples,note`, { headers: { apikey: require('./lib.cjs').ANON, authorization: `Bearer ${direct.tok}` } });
    if ((await res.json()).length !== 0) throw new Error('the client can read the shipments table directly');
    const pf = await fetch(`${require('./lib.cjs').API}/rest/v1/project_formulas?select=*`, { headers: { apikey: require('./lib.cjs').ANON, authorization: `Bearer ${direct.tok}` } });
    if ((await pf.json()).length !== 0) throw new Error('the client can read the formula ingredients');
  });

  await run('sales: contract from the quote, first installment = the deposit, a due date on the second; sent', sales, async (p) => {
    await p.goto(`${B}/admin/projects/${pid}`, { waitUntil: 'networkidle' });
    await p.getByRole('button', { name: 'أنشئ عقداً' }).click();
    const fe = p.getByTestId('finance-editor');
    if ((await fe.getByTestId('contract-total').inputValue()) !== '11500') throw new Error('total not prefilled from the quote');
    if ((await fe.getByTestId('deposit-link').getAttribute('data-mismatch')) !== '0') throw new Error('deposit should match');
    const rows = fe.getByTestId('schedule-row');
    if (await rows.count() !== 2) throw new Error('deposit + balance expected');
    await rows.nth(0).getByTestId('schedule-percent').fill('40');
    await rows.nth(1).getByTestId('schedule-percent').fill('60');
    if ((await fe.getByTestId('deposit-link').getAttribute('data-mismatch')) !== '1') throw new Error('mismatch not flagged');
    await p.getByRole('button', { name: 'احفظ وأرسل للعميل' }).click();
    await p.getByText(/الدفعة الأولى لا تساوي عربون عرض السعر/).first().waitFor({ timeout: 10000 });
    await fe.getByTestId('deposit-match').click();
    if ((await fe.getByTestId('deposit-link').getAttribute('data-mismatch')) !== '0') throw new Error('match button');
    const yesterday = new Date(Date.now() - 86_400_000 * 2).toISOString().slice(0, 10);
    await rows.nth(1).getByTestId('schedule-due-date').fill(yesterday);
    await p.getByRole('button', { name: 'احفظ وأرسل للعميل' }).click();
    await toast(p, /أُرسل العقد للعميل/);
    const row = sql(`select concat_ws('|', id, status, total, public.contract_first_amount(c), schedule -> 1 ->> 'due_date', length(content_hash)) from public.project_contracts c where project_id='${pid}' and status <> 'draft'`).split('|');
    contractId = row[0];
    if (row.slice(1).join('|') !== `sent|11500.00|5750.00|${yesterday}|64`) throw new Error('contract ' + row.join('|'));
    if (sql(`select count(*) from public.project_contracts where project_id='${pid}'`) !== '1') throw new Error('a failed send left a second draft');
  });

  await run('client signs; the signature is stored; the sample amounts now appear', client, async (p) => {
    await p.goto(`${B}/account/contracts`, { waitUntil: 'networkidle' });
    await p.getByTestId('my-contract-open').first().click();
    await p.getByTestId('deposit-hint').waitFor();
    await p.getByRole('button', { name: 'راجعت العقد — أوقّع' }).click();
    const box = p.getByTestId('sign-client');
    await box.getByRole('checkbox').check();
    await drawSignature(p);
    await box.getByRole('button', { name: 'وقّع العقد' }).click();
    await toast(p, /وُقّع العقد/);
    const row = sql(`select concat_ws('|', status, client_signature like 'sb:projects/${pid}/%', client_signed_ip is not null) from public.project_contracts where id='${contractId}'`);
    if (!row.startsWith('client_signed|t')) throw new Error('signature ' + row);
    if (sql(`select count(*) from public.contract_payments where contract_id='${contractId}'`) !== '0') throw new Error('invoiced before any payment');
    const q = await anon.newPage();
    await q.goto(`${B}/kit/${kitRef}?k=${token}`, { waitUntil: 'networkidle' });
    await q.getByTestId('sample-card').first().locator('summary').click();
    const table = await q.getByTestId('sample-card').first().getByTestId('sample-ingredients').textContent();
    if (!table.includes('4.5')) throw new Error('amounts not revealed after signing: ' + table);
    if (await q.getByTestId('disclosure-note').count()) throw new Error('disclosure note still shown');
    await q.close();
  });

  await run('deposit through the payment gateway settles the first installment and issues its tax invoice', client, async (p) => {
    const qid = sql(`select id from public.project_quotes where project_id='${pid}' and status='accepted'`);
    const pay = (id, amount) => fetch(VERIFY + '/mock', { method: 'POST', body: JSON.stringify({ id, status: 'paid', amount, currency: 'SAR', metadata: { kind: 'deposit', quote_id: qid }, source: { type: 'creditcard', company: 'mada' } }) });
    const good = '33333333-3333-4333-8333-333333333333';
    await pay(good, 575000);
    await p.goto(`${B}/account/projects/${pid}?pay=${qid}&id=${good}&status=paid`, { waitUntil: 'networkidle' });
    await p.getByRole('status').filter({ hasText: 'تم الدفع — استلمنا العربون' }).waitFor({ timeout: 15000 });
    const row = sql(`select concat_ws('|', installment_id is not null, amount, net_amount, vat_amount, source, method, ref, invoice_no ~ '^INV-[0-9]{4}-[0-9]{5}$', seller ->> 'vatNumber', buyer ->> 'name', recorded_by is null) from public.contract_payments where contract_id='${contractId}'`);
    if (row !== `t|5750.00|5000.00|750.00|deposit|online|${good}|t|310122393500003|سالم الدوسري|t`) throw new Error('deposit invoice ' + row);
    if (sql(`select status from public.project_quotes where id='${qid}'`) !== 'paid') throw new Error('quote not paid');
    const inst = p.getByTestId('contract-schedule').getByTestId('installment');
    await inst.nth(0).getByTestId('from-deposit').waitFor({ timeout: 10000 });
    if ((await inst.nth(0).getAttribute('data-paid')) !== '1') throw new Error('first installment not shown as paid');
    invoice1 = await inst.nth(0).getByTestId('invoice-link').getAttribute('href');
    await p.getByTestId('notes-thread').getByText(/عربونك المدفوع سدّد/).waitFor();
    await p.goto(B + invoice1, { waitUntil: 'networkidle' });
    const doc = p.getByTestId('invoice-doc');
    await doc.getByRole('heading', { name: 'فاتورة ضريبية' }).waitFor();
    const text = (await doc.textContent()).replace(/\s+/g, ' ');
    for (const s of ['شركة مصنع العطور', '310122393500003', 'سالم الدوسري', '5,000.00', '750.00', '5,750.00', 'دفع إلكتروني']) if (!text.includes(s)) throw new Error('invoice missing ' + s);
    if (!(await doc.locator('svg[data-qr]').count())) throw new Error('tax QR missing');
    await p.goto(`${B}/account/invoices`, { waitUntil: 'networkidle' });
    if (await p.getByTestId('my-invoice').count() !== 1 || await p.getByTestId('my-dues').locator('li').count() !== 1) throw new Error('invoices page');
    await p.screenshot({ path: `${OUT}/client-invoices.png`, fullPage: true });
  });

  await run('automatic reminders on the live database: the overdue installment is claimed once, with one team task', sales, async () => {
    const dry = reminders(true);
    if (dry.status !== 200 || !dry.dry) throw new Error('dry run ' + JSON.stringify(dry));
    const k = dry.due.map((x) => x.kind).sort().join(',');
    if (k !== 'installment_overdue,installment_overdue_team') throw new Error('due kinds ' + k);
    if (sql('select count(*) from public.reminder_log') !== '0') throw new Error('a dry run must not claim');
    const first = reminders(false);
    if (first.claimed !== 2 || first.tasks !== 1) throw new Error('first run ' + JSON.stringify(first));
    if (sql(`select string_agg(kind, ',' order by kind) from public.reminder_log where project_id='${pid}'`) !== 'installment_overdue,installment_overdue_team') throw new Error('log');
    if (sql(`select count(*) from public.tasks where title like 'تحصيل: دفعة «الدفعة النهائية»%'`) !== '1') throw new Error('collection task');
    const second = reminders(false);
    if (second.claimed !== 0 || second.tasks !== 0) throw new Error('second run repeated: ' + JSON.stringify(second));
  });

  await run('sales records the second installment → contract fully paid; the contracts screen and control centre reflect it', sales, async (p) => {
    await p.goto(`${B}/admin/projects/${pid}`, { waitUntil: 'networkidle' });
    const inst = p.getByTestId('contract-schedule').getByTestId('installment');
    if (await inst.nth(0).getByTestId('pay-open').count()) throw new Error('the deposit installment is payable again');
    await inst.nth(1).getByTestId('pay-open').click();
    await p.getByTestId('pay-box').getByTestId('pay-ref').fill('TRX-FINAL');
    await p.getByTestId('pay-box').getByTestId('pay-submit').click();
    await toast(p, /سُجّل السداد وصدرت الفاتورة/);
    if (sql(`select concat_ws('|', count(*), sum(amount), count(distinct invoice_no)) from public.contract_payments where contract_id='${contractId}'`) !== '2|11500.00|2') throw new Error('payments');
    await p.goto(`${B}/admin/contracts`, { waitUntil: 'networkidle' });
    if ((await p.getByTestId('contract-row').first().getByTestId('money-bar').getAttribute('data-pct')) !== '100') throw new Error('not 100%');
    await p.getByTestId('tab-invoices').click();
    if (await p.getByTestId('invoice-row').count() !== 2) throw new Error('two invoices');
    if (reminders(true).due.length !== 0) throw new Error('paid installment still reminded');
  });

  await run('perfumer: the production order carries the approved formula with batch quantities', perfumer, async (p) => {
    await p.goto(`${B}/admin/production?new=1&project=${pid}`, { waitUntil: 'networkidle' });
    const f = p.getByTestId('po-new');
    await f.getByTestId('po-new-formula').getByText(/عود الفجر/).waitFor({ timeout: 10000 });
    await f.getByRole('button', { name: 'أنشئ أمر الإنتاج' }).click();
    await toast(p, /أُنشئ أمر الإنتاج/);
    const row = sql(`select concat_ws('|', ref ~ '^PO-', formula ->> 'name', formula -> 'ingredients' -> 0 ->> 'amount', formula_ref like '${kitRef} · %') from public.production_orders where project_id='${pid}'`);
    if (row !== 't|عود الفجر|4.5|t') throw new Error('po ' + row);
    const table = await p.getByTestId('po-formula-table').textContent();
    if (!table.includes('عود كمبودي') || !table.includes('2.25')) throw new Error('batch quantities ' + table);
    await p.screenshot({ path: `${OUT}/production-formula.png`, fullPage: true });
  });

  await run('one-click reorder: the client gets a new project; the team gets a draft quote and contract at the new quantity', client, async (p) => {
    await p.goto(`${B}/account/projects/${pid}`, { waitUntil: 'networkidle' });
    await p.getByTestId('reorder-open').click();
    const box = p.getByTestId('reorder-box');
    if ((await box.getByTestId('reorder-qty').inputValue()) !== '1000') throw new Error('previous quantity not prefilled');
    await box.getByTestId('reorder-qty').fill('2500');
    await box.getByTestId('reorder-note').fill('نفس العبوة بغطاء ذهبي');
    await box.getByTestId('reorder-submit').click();
    await p.waitForURL(/\/account\/projects\/[0-9a-f-]{36}\?reorder=1$/, { timeout: 15000 });
    const nid = new URL(p.url()).pathname.split('/').pop();
    if (nid === pid) throw new Error('same project');
    await p.getByTestId('reorder-of').filter({ hasText: /الكمية 2,500/ }).waitFor();
    await p.getByTestId('project-formula').getByText('عود الفجر').waitFor();
    if (await p.getByTestId('quote-total').count()) throw new Error('the client sees the draft quote');
    const row = sql(`select concat_ws('|', p.title, p.stage, p.reorder_of = '${pid}', q.status, q.lines -> 0 ->> 'qty', q.total, q.deposit, c.status, c.total, public.contract_first_amount(c), c.specs is not null, (select count(*) from public.project_formulas f where f.project_id = p.id)) from public.projects p join public.project_quotes q on q.project_id = p.id join public.project_contracts c on c.project_id = p.id where p.id='${nid}'`);
    if (row !== 'تصنيع · سالم · إعادة طلب 1|sourcing|t|draft|2500|28750.00|14375.00|draft|28750.00|14375.00|t|1') throw new Error('reorder ' + row);
    const q = await sales.newPage();
    await q.goto(`${B}/admin/projects/${nid}`, { waitUntil: 'networkidle' });
    await q.getByTestId('reorder-panel').getByTestId('reorder-of').waitFor();
    // مسودة العرض تفتح للفريق في المحرر بالكمية الجديدة وسعر الوحدة السابق
    await q.getByText(/مسودة QT-.* — لا يراها العميل حتى ترسلها/).waitFor();
    if ((await q.getByLabel('كمية البند 1').inputValue()) !== '2500' || (await q.getByLabel('سعر وحدة البند 1').inputValue()) !== '10') throw new Error('draft quote line');
    await q.getByTestId('contract-schedule').getByTestId('contract-value').getByText('28,750.00').waitFor();
    await q.screenshot({ path: `${OUT}/reorder-admin.png`, fullPage: true });
    await q.close();
  });

  await run('isolation: another client cannot open the invoice, the project or the samples', stranger, async (p) => {
    await p.goto(B + '/auth?mode=register', { waitUntil: 'networkidle' });
    await p.getByLabel('الاسم الأول').fill('غريب'); await p.getByLabel('اسم العائلة').fill('آخر');
    await p.getByLabel('البريد الإلكتروني').fill('other@live.test');
    await p.locator('#a-pass').fill('Passw0rd!x');
    await p.getByRole('radio').first().click();
    await p.locator('form button[type=submit]').click();
    await p.waitForURL((u) => !u.pathname.startsWith('/auth'), { timeout: 15000 });
    await p.goto(B + invoice1, { waitUntil: 'networkidle' });
    await p.getByTestId('invoice-missing').waitFor();
    await p.goto(`${B}/account/samples`, { waitUntil: 'networkidle' });
    await p.getByTestId('samples-empty').waitFor();
    await p.goto(`${B}/account/contracts`, { waitUntil: 'networkidle' });
    await p.getByTestId('contracts-empty').waitFor();
  });

  // الرفض الوحيد المتوقع: الخادم يمنع إرسال عقد دفعته الأولى لا تطابق العربون
  const expected = errors.filter((e) => /HTTP 400 POST .*rpc\/send_contract/.test(e));
  const rest = errors.filter((e) => !expected.includes(e));
  results.push(`${expected.length === 1 ? 'PASS' : 'FAIL'} the server itself rejected the mismatching contract exactly once (${expected.length})`);
  console.log(results.join('\n'));
  console.log('errors:', rest.length ? rest : 'none');
  await browser.close();
})();
