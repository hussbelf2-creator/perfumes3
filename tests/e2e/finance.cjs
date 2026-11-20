// العقود والدفعات والفواتير، الملاحظات بالمرفقات، وقسم التعليم:
// طلب بمرفقات ← عقد بقيمة وجدول دفعات ← توقيع ← «تسجيل السداد» ← فاتورة ضريبية برمز QR ← فواتير العميل.
const fs = require('fs');
const path = require('path');
const { chromium, OUT, url, FIX } = require('./lib.cjs');
const B = url('admin');
(async () => {
  const browser = await chromium.launch();
  const results = [], errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('_i')) { localStorage.setItem('pp_lang', 'ar'); sessionStorage.setItem('_i', '1'); } } catch {} });
  await ctx.route(/readdy\.ai\/api\/form/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"code":"OK"}' }));
  await ctx.route(/readdy\.ai\/api\/search-image/, (r) => r.fulfill({ path: `${FIX}/face.jpg`, contentType: 'image/jpeg' }));
  const run = async (name, fn) => {
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    p.on('console', (m) => { if (m.type() === 'error' && !/ERR_|net::|Failed to load resource|remixicon/.test(m.text())) errors.push(`${name} console: ${m.text()}`); });
    try { await fn(p); results.push('PASS ' + name); } catch (e) { results.push(`FAIL ${name}: ${e.message.split('\n')[0]}`); await p.screenshot({ path: `${OUT}/fail-${name.replace(/\W+/g, '-').slice(0, 60)}.png`, fullPage: true }).catch(() => {}); }
    await p.close();
  };
  const toast = (p, re) => p.getByRole('status').filter({ hasText: re }).first().waitFor({ timeout: 8000 });
  const asStaff = async (p, role) => {
    await p.goto(B + '/', { waitUntil: 'networkidle' });
    await p.evaluate(() => localStorage.removeItem('pp_session_email'));
    await p.goto(B + '/auth', { waitUntil: 'networkidle' });
    await p.getByLabel(/الدور التجريبي/).selectOption(role);
    await p.getByRole('button', { name: /دخول كفريق المنصة/ }).click();
    await p.waitForURL(/\/admin/);
  };
  const asClient = async (p) => {
    await p.goto(B + '/', { waitUntil: 'networkidle' });
    await p.evaluate(() => localStorage.removeItem('pp_session_email'));
    await p.goto(B + '/auth', { waitUntil: 'networkidle' });
    await p.getByLabel('البريد الإلكتروني').fill('salem@finance.test');
    await p.locator('#a-pass').fill('Passw0rd!x');
    await p.locator('form button[type=submit]').click();
    await p.waitForURL((u) => !u.pathname.startsWith('/auth'));
  };
  const drawSignature = async (p) => {
    const box = await p.getByTestId('signature-canvas').boundingBox();
    await p.mouse.move(box.x + 40, box.y + 100);
    await p.mouse.down();
    for (let i = 1; i <= 20; i++) await p.mouse.move(box.x + 40 + i * 18, box.y + 100 + Math.sin(i / 2) * 30);
    await p.mouse.up();
  };
  const exe = path.join(OUT, 'tool.exe');
  fs.writeFileSync(exe, 'MZ');
  let project = '', invoice1 = '';

  await run('start flow: the client attaches files to the request and finds them in the project notes', async (p) => {
    await p.goto(B + '/start/E', { waitUntil: 'networkidle' });
    for (const s of ['نعم، جاهزة', 'نعم', '300 – 1,000', 'مرن']) await p.getByText(s, { exact: true }).first().click();
    await p.locator('fieldset').filter({ hasText: 'الباقة الأقرب لك' }).locator('label').first().click();
    await p.getByRole('button', { name: /أضف تفاصيل/ }).click();
    const files = p.getByTestId('start-files');
    await files.getByTestId('start-files-input').setInputFiles([`${FIX}/brief.pdf`, `${FIX}/photo-bottle.jpg`, exe]);
    await files.getByText(/نوع «tool\.exe» غير مقبول/).waitFor();
    if (await files.getByTestId('start-files-list').locator('li').count() !== 2) throw new Error('two accepted files expected');
    await files.scrollIntoViewIfNeeded();
    await p.screenshot({ path: `${OUT}/start-files.png` });
    await p.getByRole('button', { name: 'التالي' }).click();
    await p.getByLabel('الاسم الأول').fill('سالم'); await p.getByLabel('اسم العائلة').fill('الدوسري');
    await p.getByLabel('البريد الإلكتروني').fill('salem@finance.test'); await p.getByLabel('الجوال (واتساب)').fill('0553335555');
    await p.getByLabel('كلمة المرور (8 أحرف على الأقل)').fill('Passw0rd!x');
    await p.getByRole('button', { name: 'أنشئ حسابي وأرسل الطلب' }).click();
    await p.waitForURL(/\?new=1/);
    project = new URL(p.url()).pathname;
    const thread = p.getByTestId('notes-thread');
    await thread.getByText('مرفقات طلبي').waitFor({ timeout: 15000 });
    const note = thread.getByTestId('note').filter({ hasText: 'مرفقات طلبي' });
    if (await note.locator('[data-kind="image"]').count() !== 1 || await note.locator('[data-kind="file"]').count() !== 1) throw new Error('one image and one file expected');
    await note.locator('[data-kind="image"] img').waitFor();
    await note.locator('[data-kind="file"]').getByText('brief.pdf').waitFor();
    if (await p.evaluate(() => localStorage.getItem('pp_start_files_v1'))) throw new Error('pending files not cleared');
    await p.getByRole('heading', { name: 'الملاحظات والمرفقات' }).waitFor();
    await p.getByTestId('project-learn').getByTestId('lesson-card').first().waitFor();
  });

  await run('notes: client and team exchange notes with images and documents; odd types are refused', async (p) => {
    await asClient(p);
    await p.goto(B + project, { waitUntil: 'networkidle' });
    const thread = p.getByTestId('notes-thread');
    if (!(await thread.getByTestId('note-send').isDisabled())) throw new Error('send enabled on an empty note');
    await thread.getByTestId('attach-input').setInputFiles([exe]);
    await thread.getByText(/نوع «tool\.exe» غير مقبول/).waitFor();
    await thread.getByTestId('attach-input').setInputFiles([`${FIX}/work.png`, `${FIX}/brief.pdf`]);
    await thread.getByTestId('attach-pending').locator('li').nth(1).waitFor();
    await thread.getByTestId('note-body').fill('هذا الشعار ومواصفات العبوة');
    await thread.getByTestId('note-send').click();
    const mine = thread.getByTestId('note').filter({ hasText: 'هذا الشعار ومواصفات العبوة' });
    await mine.getByTestId('attachment').nth(1).waitFor();
    if (await thread.getByTestId('attach-pending').count()) throw new Error('pending list not cleared after sending');
    // مرفق بلا نص
    await thread.getByTestId('attach-input').setInputFiles([`${FIX}/brief.pdf`]);
    await thread.getByTestId('attach-pending').locator('li').first().waitFor();
    await thread.getByTestId('note-send').click();
    await thread.getByTestId('note').nth(2).waitFor();
    if (!(await thread.getByTestId('note').nth(2).textContent()).includes('مرفقات')) throw new Error('a files-only note gets the default body');
    if (await thread.getByTestId('note').nth(2).getByTestId('attachment').count() !== 1) throw new Error('files-only note attachment');
    await mine.scrollIntoViewIfNeeded();
    await p.screenshot({ path: `${OUT}/client-notes.png` });
    await asStaff(p, 'sales');
    await p.goto(B + project.replace('/account/', '/admin/'), { waitUntil: 'networkidle' });
    const t2 = p.getByTestId('notes-thread');
    await t2.getByTestId('note').filter({ hasText: 'هذا الشعار ومواصفات العبوة' }).locator('[data-kind="image"] img').waitFor();
    await t2.getByTestId('attach-input').setInputFiles([`${FIX}/photo-cap.png`]);
    await t2.getByTestId('attach-pending').locator('li').first().waitFor();
    await t2.getByTestId('note-body').fill('وصلت الملفات، وهذا مقترح الغطاء');
    await t2.getByTestId('note-send').click();
    await t2.getByTestId('note').filter({ hasText: 'وصلت الملفات' }).getByTestId('attachment').waitFor();
  });

  await run('sales builds a contract with a value and a payment schedule; it cannot be sent unless it totals 100%', async (p) => {
    await asStaff(p, 'sales');
    // بيانات الفوترة: تدخل لقطة البائع في كل فاتورة
    await p.evaluate(() => {
      const at = new Date().toISOString();
      localStorage.setItem('pp_cms_v1', JSON.stringify({ published: { site: { value: { billing: { legalName: 'شركة مصنع العطور', vatNumber: '310122393500003', cr: '1010101010', bankName: 'مصرف الراجحي', iban: 'SA0380000000608010167519' } }, at } }, drafts: {}, versions: [] }));
    });
    await p.goto(B + project.replace('/account/', '/admin/'), { waitUntil: 'networkidle' });
    await p.getByRole('button', { name: 'أنشئ عقداً' }).click();
    const fe = p.getByTestId('finance-editor');
    if (await fe.getByTestId('schedule-row').count()) throw new Error('no schedule expected before a value is entered');
    await fe.getByTestId('contract-total').fill('11500');
    if (await fe.getByTestId('schedule-row').count() !== 2) throw new Error('50/50 suggested on the first value');
    await fe.getByText(/قبل الضريبة 10,000\.00 ر\.س · الضريبة 1,500\.00 ر\.س/).waitFor();
    await fe.getByTestId('schedule-preset').selectOption('50-30-20');
    const rows = fe.getByTestId('schedule-row');
    if (await rows.count() !== 3) throw new Error('three installments');
    const amounts = await rows.evaluateAll((els) => els.map((e) => e.textContent.replace(/\s+/g, ' ')));
    for (const [i, a] of ['5,750.00', '3,450.00', '2,300.00'].entries()) if (!amounts[i].includes(a)) throw new Error(`installment ${i + 1} amount`);
    await rows.nth(0).getByTestId('schedule-percent').fill('40');
    await fe.getByTestId('schedule-sum').getByText(/مجموع النسب 90٪ · يجب أن يساوي 100٪/).waitFor();
    await p.getByRole('button', { name: 'احفظ وأرسل للعميل' }).click();
    await p.getByText('راجع جدول الدفعات: لكل دفعة اسم ونسبة، ومجموع النسب 100٪.').first().waitFor();
    await rows.nth(0).getByTestId('schedule-percent').fill('50');
    await fe.getByTestId('schedule-sum').getByText(/^مجموع النسب 100٪$/).waitFor();
    // ملف عقد مرفوع يُرفق مع البنود
    await fe.getByTestId('contract-file-input').setInputFiles(`${FIX}/brief.pdf`);
    await fe.getByTestId('contract-file-name').getByText('brief.pdf').waitFor({ timeout: 15000 });
    await fe.scrollIntoViewIfNeeded();
    await p.screenshot({ path: `${OUT}/contract-finance-editor.png` });
    await p.getByRole('button', { name: 'احفظ وأرسل للعميل' }).click();
    await toast(p, /أُرسل العقد للعميل/);
    const sch = p.getByTestId('contract-schedule');
    await sch.getByTestId('contract-value').getByText('11,500.00 ر.س').waitFor();
    if (await sch.getByTestId('installment').count() !== 3) throw new Error('schedule not shown on the document');
    await p.getByTestId('contract-file').getByText('brief.pdf').waitFor();
    if (await p.getByTestId('pay-open').count()) throw new Error('payment offered before the client signs');
  });

  await run('client: «عقودي» shows the contract to sign with its value; signing opens the installments', async (p) => {
    await asClient(p);
    await p.goto(B + '/account/contracts', { waitUntil: 'networkidle' });
    const card = p.getByTestId('my-contract').first();
    await card.getByText('11,500.00 ر.س').first().waitFor();
    const badge = await p.getByRole('navigation', { name: 'حسابي' }).first().getByRole('link', { name: /عقودي/ }).textContent();
    if (!badge.includes('1')) throw new Error(`nav badge ${badge}`);
    await p.goto(B + '/account/invoices', { waitUntil: 'networkidle' });
    await p.getByTestId('invoices-empty').waitFor();
    await p.goto(B + '/account/contracts', { waitUntil: 'networkidle' });
    await p.getByTestId('my-contract-open').first().click();
    await p.waitForURL(/#pj-contract/);
    await p.getByTestId('contract-schedule').getByTestId('installment').nth(2).waitFor();
    if (await p.getByTestId('proforma-link').count()) throw new Error('payment requests before signing');
    await p.getByRole('button', { name: 'راجعت العقد — أوقّع' }).click();
    const sign = p.getByTestId('sign-client');
    await sign.getByRole('checkbox').check();
    await drawSignature(p);
    await sign.getByRole('button', { name: 'وقّع العقد' }).click();
    await toast(p, /وُقّع العقد/);
    await p.getByTestId('proforma-link').first().waitFor();
    await p.getByText('مستحقة الآن').waitFor();
  });

  await run('«تسجيل السداد»: sales records the first installment and a numbered tax invoice with a QR is issued', async (p) => {
    await asStaff(p, 'production');
    await p.goto(B + project.replace('/account/', '/admin/'), { waitUntil: 'networkidle' });
    if (await p.getByTestId('pay-open').count()) throw new Error('production must not record payments');
    await asStaff(p, 'sales');
    await p.goto(B + project.replace('/account/', '/admin/'), { waitUntil: 'networkidle' });
    const inst = p.getByTestId('contract-schedule').getByTestId('installment');
    await inst.nth(0).getByTestId('pay-open').click();
    const box = p.getByTestId('pay-box');
    await box.getByText(/تسجيل سداد «دفعة مقدمة عند التوقيع» بمبلغ 5,750\.00 ر\.س/).waitFor();
    await box.getByTestId('pay-ref').fill('TRX-889900');
    await p.screenshot({ path: `${OUT}/pay-box.png` });
    await box.getByTestId('pay-submit').click();
    await toast(p, /سُجّل السداد وصدرت الفاتورة/);
    if ((await inst.nth(0).getAttribute('data-paid')) !== '1') throw new Error('installment not marked paid');
    if (await inst.nth(0).getByTestId('pay-open').count()) throw new Error('paid installment still payable');
    await p.getByTestId('contract-paid').getByText('5,750.00 ر.س').waitFor();
    await p.getByTestId('contract-remaining').getByText('5,750.00 ر.س').waitFor();
    const link = inst.nth(0).getByTestId('invoice-link');
    const no = (await link.textContent()).trim();
    if (!/^INV-\d{4}-\d{5}$/.test(no)) throw new Error(`invoice no ${no}`);
    invoice1 = await link.getAttribute('href');
    await p.getByTestId('notes-thread').getByText(new RegExp(`استلمنا دفعة «دفعة مقدمة عند التوقيع».*${no}`)).waitFor();
    await p.goto(B + invoice1, { waitUntil: 'networkidle' });
    const doc = p.getByTestId('invoice-doc');
    await doc.waitFor();
    if ((await doc.getAttribute('data-kind')) !== 'tax') throw new Error('tax invoice expected');
    await doc.getByRole('heading', { name: 'فاتورة ضريبية' }).waitFor();
    const text = (await doc.textContent()).replace(/\s+/g, ' ');
    for (const s of [no, 'شركة مصنع العطور', '310122393500003', 'سالم الدوسري', '5,000.00', '750.00', '5,750.00', 'تحويل بنكي', 'TRX-889900']) if (!text.includes(s)) throw new Error(`invoice missing ${s}`);
    const qr = await doc.locator('svg[data-qr]').getAttribute('data-qr');
    const fields = await p.evaluate((b64) => { const bin = atob(b64); const b = Uint8Array.from(bin, (c) => c.charCodeAt(0)); const out = []; for (let i = 0; i + 1 < b.length;) { const n = b[i + 1]; out.push(new TextDecoder().decode(b.slice(i + 2, i + 2 + n))); i += 2 + n; } return out; }, qr);
    if (fields[0] !== 'شركة مصنع العطور' || fields[1] !== '310122393500003' || fields[3] !== '5750.00' || fields[4] !== '750.00' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(fields[2])) throw new Error(`QR fields ${JSON.stringify(fields)}`);
    if ((await doc.getByTestId('invoice-paid-before').textContent()).trim() !== '0.00') throw new Error('paid-before on the first invoice');
    if ((await doc.getByTestId('invoice-remaining').textContent()).trim() !== '5,750.00') throw new Error('remaining after the first invoice');
    await p.screenshot({ path: `${OUT}/tax-invoice.png`, fullPage: true });
  });

  await run('contracts screen: every contract with its collection status, and the invoices tab', async (p) => {
    await asStaff(p, 'sales');
    await p.getByRole('navigation', { name: /لوحة الإدارة/ }).getByRole('link', { name: 'العقود والفواتير' }).click();
    const row = p.getByTestId('contract-row').first();
    await row.waitFor();
    if ((await row.getByTestId('money-bar').getAttribute('data-pct')) !== '50') throw new Error('50% collected expected');
    await row.getByText('دفعة بدء الإنتاج').waitFor();
    await p.getByText('المتبقي للتحصيل').waitFor();
    await p.screenshot({ path: `${OUT}/admin-contracts.png`, fullPage: true });
    await p.getByTestId('tab-invoices').click();
    const inv = p.getByTestId('invoice-row');
    if (await inv.count() !== 1) throw new Error('one invoice');
    await inv.getByText('سالم الدوسري').waitFor();
    await inv.getByText('5,750.00 ر.س').waitFor();
    await p.getByTestId('tab-contracts').click();
    await p.getByLabel('الحالة').selectOption('due');
    if (await p.getByTestId('contract-row').count() !== 1) throw new Error('unpaid filter');
    // المصمم لا يرى الشاشة
    await asStaff(p, 'designer');
    if (await p.getByRole('navigation', { name: /لوحة الإدارة/ }).getByRole('link', { name: 'العقود والفواتير' }).count()) throw new Error('designer sees contracts');
  });

  await run('client: «فواتيري» lists dues with bank details and issued invoices; the next invoice deducts what was paid', async (p) => {
    await asStaff(p, 'sales');
    await p.goto(B + project.replace('/account/', '/admin/'), { waitUntil: 'networkidle' });
    await p.getByTestId('contract-schedule').getByTestId('installment').nth(1).getByTestId('pay-open').click();
    await p.getByTestId('pay-box').getByTestId('pay-method').selectOption('cash');
    await p.getByTestId('pay-box').getByTestId('pay-submit').click();
    await toast(p, /سُجّل السداد وصدرت الفاتورة/);
    await asClient(p);
    await p.goto(B + '/account/invoices', { waitUntil: 'networkidle' });
    if (await p.getByTestId('my-dues').locator('li').count() !== 1) throw new Error('one due installment left');
    const invs = p.getByTestId('my-invoice');
    if (await invs.count() !== 2) throw new Error('two issued invoices');
    await p.screenshot({ path: `${OUT}/client-invoices.png`, fullPage: true });
    const [due] = await Promise.all([ctx.waitForEvent('page'), p.getByTestId('my-due-open').click()]);
    await due.waitForLoadState('networkidle');
    const pd = due.getByTestId('invoice-doc');
    if ((await pd.getAttribute('data-kind')) !== 'proforma') throw new Error('proforma expected');
    const pt = (await pd.textContent()).replace(/\s+/g, ' ');
    for (const s of ['مطالبة بالدفع', 'SA0380000000608010167519', 'مصرف الراجحي', '2,300.00', '9,200.00']) if (!pt.includes(s)) throw new Error(`proforma missing ${s}`);
    if (await pd.locator('svg[data-qr]').count()) throw new Error('a payment request must not carry the tax QR');
    await due.screenshot({ path: `${OUT}/proforma.png`, fullPage: true });
    await due.close();
    const [inv] = await Promise.all([ctx.waitForEvent('page'), invs.first().getByTestId('my-invoice-open').click()]);
    await inv.waitForLoadState('networkidle');
    const d2 = inv.getByTestId('invoice-doc');
    if ((await d2.getByTestId('invoice-amount').textContent()).trim() !== '3,450.00') throw new Error('second invoice amount');
    if ((await d2.getByTestId('invoice-paid-before').textContent()).trim() !== '5,750.00') throw new Error('second invoice should deduct the first');
    if ((await d2.getByTestId('invoice-remaining').textContent()).trim() !== '2,300.00') throw new Error('remaining after the second');
    await d2.getByText('نقدًا').waitFor();
    await inv.close();
    await p.goto(B + '/account/contracts', { waitUntil: 'networkidle' });
    if ((await p.getByTestId('my-contract').first().getByTestId('money-bar').getAttribute('data-pct')) !== '80') throw new Error('80% paid on the client card');
    // عميل آخر لا يفتح الفاتورة
    await p.goto(B + '/auth', { waitUntil: 'networkidle' });
    await p.evaluate(() => localStorage.removeItem('pp_session_email'));
    await p.goto(B + '/auth', { waitUntil: 'networkidle' });
    await p.getByRole('button', { name: /دخول كعميل تجريبي/ }).click();
    await p.waitForURL((u) => !u.pathname.startsWith('/auth'));
    await p.goto(B + invoice1, { waitUntil: 'networkidle' });
    await p.getByTestId('invoice-missing').waitFor();
  });

  await run('learning: lessons by service, a lesson page with its takeaway and next lesson, linked from the service page', async (p) => {
    await p.goto(B + '/learn', { waitUntil: 'networkidle' });
    const all = await p.getByTestId('learn-list').getByTestId('lesson-card').count();
    if (all < 12) throw new Error(`only ${all} lessons`);
    await p.getByTestId('learn-filter').locator('[data-track="F"]').click();
    await p.getByTestId('learn-service').getByText(/دروس خدمة «طباعة وتنفيذ»/).waitFor();
    const f = await p.getByTestId('learn-list').getByTestId('lesson-card').count();
    if (!(f >= 2 && f < all)) throw new Error(`track F shows ${f}`);
    await p.screenshot({ path: `${OUT}/learn.png`, fullPage: true });
    await p.getByTestId('learn-list').getByTestId('lesson-card').first().click();
    await p.waitForURL(/\/learn\/[a-z-]+\?track=F/);
    const lesson = p.getByTestId('lesson');
    await lesson.getByTestId('lesson-takeaway').waitFor();
    if (await lesson.locator('section').count() < 3) throw new Error('lesson sections');
    if (!(await lesson.getByTestId('lesson-apply').getAttribute('href')).startsWith('/')) throw new Error('apply link');
    await p.getByText(/الدرس 1 من/).waitFor();
    await p.screenshot({ path: `${OUT}/lesson.png`, fullPage: true });
    await p.getByRole('heading', { name: 'الدرس التالي' }).locator('..').getByTestId('lesson-card').click();
    await p.waitForURL(/\/learn\/[a-z-]+\?track=F/);
    await p.getByText(/الدرس 2 من/).waitFor();
    await p.goto(B + '/learn/nope', { waitUntil: 'networkidle' });
    await p.getByTestId('lesson-missing').waitFor();
    await p.goto(B + '/services/E', { waitUntil: 'networkidle' });
    const strip = p.getByTestId('learn-strip');
    await strip.getByTestId('lesson-card').first().waitFor();
    if (!(await strip.getByTestId('lesson-card').first().getAttribute('href')).includes('?track=E')) throw new Error('service strip keeps the track');
    await p.goto(B + '/', { waitUntil: 'networkidle' });
    if (!(await p.locator('footer').getByRole('link', { name: 'التعليم' }).count())) throw new Error('footer link to learn');
  });

  await run('mobile: contracts, invoices and the invoice page fit a phone', async (p) => {
    await asClient(p);
    await p.setViewportSize({ width: 390, height: 844 });
    for (const path of ['/account/contracts', '/account/invoices', '/account/settings', invoice1, '/learn', project]) {
      await p.goto(B + path, { waitUntil: 'networkidle' });
      const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (over > 1) throw new Error(`${path} overflows by ${over}px`);
    }
    await asStaff(p, 'sales');
    await p.setViewportSize({ width: 390, height: 844 });
    for (const path of ['/admin/contracts', '/admin/kits']) {
      await p.goto(B + path, { waitUntil: 'networkidle' });
      const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (over > 1) throw new Error(`${path} overflows by ${over}px`);
    }
  });

  console.log(results.join('\n'));
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})();
