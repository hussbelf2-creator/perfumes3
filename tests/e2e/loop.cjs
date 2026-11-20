// الحلقة الكاملة في الوضع التجريبي: العربون يسدّد الدفعة الأولى من العقد، مفتاح الإفصاح عن الكميات،
// العينة المعتمدة تصير تركيبة المشروع وتُنسخ في أمر الإنتاج، التذكيرات الآلية في مركز التحكم، وإعادة الطلب بنقرة.
const { chromium, OUT, url } = require('./lib.cjs');
const B = url('admin');
const EMAIL = 'majed@loop.test';
(async () => {
  const browser = await chromium.launch();
  const results = [], errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('_i')) { localStorage.setItem('pp_lang', 'ar'); sessionStorage.setItem('_i', '1'); } } catch {} });
  await ctx.route(/readdy\.ai\/api\/form/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"code":"OK"}' }));
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
    await p.getByLabel('البريد الإلكتروني').fill(EMAIL);
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
  const store = (p, key) => p.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), key);
  const ingredients = async (p, name) => {
    const card = p.getByTestId('sample-card').filter({ hasText: name }).first();
    await card.waitFor();
    if (!(await card.getByTestId('sample-ingredients').count())) {
      if (await card.locator('summary').count()) await card.locator('summary').click();
    }
    return (await card.getByTestId('sample-ingredients').count()) ? (await card.getByTestId('sample-ingredients').textContent()) : null;
  };
  let pid = '', ref = '', token = '';

  await run('client requests manufacturing; sales prices it; the client approves', async (p) => {
    await p.goto(B + '/start/E', { waitUntil: 'networkidle' });
    for (const s of ['نعم، جاهزة', 'نعم', '300 – 1,000', 'مرن']) await p.getByText(s, { exact: true }).first().click();
    await p.locator('fieldset').filter({ hasText: 'الباقة الأقرب لك' }).locator('label').first().click();
    await p.getByRole('button', { name: 'التالي' }).click();
    await p.getByLabel('الاسم الأول').fill('ماجد'); await p.getByLabel('اسم العائلة').fill('الحربي');
    await p.getByLabel('البريد الإلكتروني').fill(EMAIL); await p.getByLabel('الجوال (واتساب)').fill('0554446666');
    await p.getByLabel('كلمة المرور (8 أحرف على الأقل)').fill('Passw0rd!x');
    await p.getByRole('button', { name: 'أنشئ حسابي وأرسل الطلب' }).click();
    await p.waitForURL(/\?new=1/);
    pid = new URL(p.url()).pathname.split('/').pop();
    if (await p.getByTestId('reorder-open').count()) throw new Error('reorder offered before any quote or contract');
    await asStaff(p, 'sales');
    await p.goto(`${B}/admin/projects/${pid}`, { waitUntil: 'networkidle' });
    await p.getByRole('button', { name: 'أنشئ عرض السعر' }).click();
    await p.getByLabel('وصف البند 1').fill('عطر 50 مل');
    await p.getByLabel('كمية البند 1').fill('1000');
    await p.getByLabel('سعر وحدة البند 1').fill('10');
    await p.getByRole('button', { name: 'حفظ وإرسال للعميل' }).click();
    await toast(p, /أُرسل|أرسل/);
    await asClient(p);
    await p.goto(`${B}/account/projects/${pid}`, { waitUntil: 'networkidle' });
    await p.getByRole('button', { name: 'اعتمد العرض' }).click();
    await p.getByRole('button', { name: 'تأكيد الاعتماد' }).click();
    await toast(p, /اعتُمد العرض/);
  });

  await run('sales records the deposit by bank transfer before any contract exists', async (p) => {
    await asStaff(p, 'sales');
    await p.goto(`${B}/admin/projects/${pid}`, { waitUntil: 'networkidle' });
    await p.getByRole('button', { name: 'تسجيل دفعة مستلمة' }).click();
    await p.getByLabel('المرجع').fill('DEP-7781');
    await p.getByRole('button', { name: 'تأكيد الاستلام' }).click();
    await toast(p, /./);
    const d = await store(p, 'pp_projects_v1');
    const q = d.quotes.find((x) => x.projectId === pid);
    if (q.status !== 'paid' || q.paidAmount !== 5750) throw new Error(`quote ${q.status} ${q.paidAmount}`);
    if ((d.contractPayments || []).length) throw new Error('an invoice was issued with no contract');
  });

  await run('perfumer: a sample round for the project; by default the client sees names without amounts', async (p) => {
    await asStaff(p, 'production');
    await p.goto(`${B}/admin/projects/${pid}`, { waitUntil: 'networkidle' });
    await p.getByTestId('project-no-formula').waitFor();
    await p.getByTestId('project-new-round').click();
    await p.waitForURL(/\/admin\/kits\?new=1&project=/);
    const f = p.getByTestId('new-round');
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
    const o = (await store(p, 'pp_kits_v1')).orders.find((x) => x.projectId === pid);
    ref = o.ref; token = o.token;
    if (o.disclosure !== 'contract' || o.samples[0].ingredients[0].amount !== 4.5) throw new Error('round not saved');
    await p.goto(`${B}/kit/${ref}?k=${token}`, { waitUntil: 'networkidle' });
    await p.getByTestId('disclosure-note').waitFor();
    const t = await ingredients(p, 'عود الفجر');
    if (!t || !t.includes('عود كمبودي') || t.includes('4.5')) throw new Error('names without amounts expected: ' + t);
    await p.screenshot({ path: `${OUT}/kit-masked.png`, fullPage: true });
    await p.goto(`${B}/kit/${ref}/sheet?k=${token}`, { waitUntil: 'networkidle' });
    const sheet = await p.getByTestId('sheet-doc').textContent();
    if (!sheet.includes('عود كمبودي') || sheet.includes('4.5') || !(await p.getByTestId('sheet-disclosure').count())) throw new Error('printed sheet leaks amounts');
  });

  await run('the disclosure switch: no ingredients, names only, or everything', async (p) => {
    await asStaff(p, 'production');
    const set = async (value) => {
      await p.goto(`${B}/admin/kits`, { waitUntil: 'networkidle' });
      await p.getByTestId('kits-table').locator('tbody tr').filter({ hasText: ref }).first().click();
      const d = p.getByTestId('kit-detail');
      await d.getByTestId('kit-disclosure').locator('select').selectOption(value);
      await d.getByRole('button', { name: 'حفظ' }).click();
      await toast(p, /حُفظت الشحنة/);
      await p.goto(`${B}/kit/${ref}?k=${token}`, { waitUntil: 'networkidle' });
      return ingredients(p, 'عود الفجر');
    };
    if ((await set('hidden')) !== null) throw new Error('hidden still lists ingredients');
    const names = await set('names');
    if (!names || !names.includes('عود كمبودي') || names.includes('4.5')) throw new Error('names: ' + names);
    if ((await p.getByTestId('disclosure-note').getAttribute('data-disclosure')) !== 'names' || (await p.getByTestId('disclosure-note').textContent()).includes('بعد توقيع')) throw new Error('«names» must not promise amounts after the contract');
    const full = await set('full');
    if (!full || !full.includes('4.5')) throw new Error('full: ' + full);
    const back = await set('contract');
    if (!back || back.includes('4.5')) throw new Error('contract: ' + back);
  });

  await run('the team sets the approved formula; the project carries it; the client sees its name only', async (p) => {
    await asStaff(p, 'production');
    await p.goto(`${B}/admin/kits`, { waitUntil: 'networkidle' });
    await p.getByTestId('kits-table').locator('tbody tr').filter({ hasText: ref }).first().click();
    const box = p.getByTestId('kit-detail').getByTestId('kit-formula');
    p.once('dialog', (d) => d.accept());
    await box.locator('li').filter({ hasText: 'عود الفجر' }).getByTestId('kit-set-formula').click();
    await toast(p, /اعتُمدت التركيبة للمشروع/);
    await box.locator('li').filter({ hasText: 'عود الفجر' }).getByTestId('kit-approved').waitFor();
    const d = await store(p, 'pp_projects_v1');
    const pr = d.projects.find((x) => x.id === pid);
    const full = (d.formulas || []).find((x) => x.projectId === pid);
    if (pr.formula?.name !== 'عود الفجر' || pr.formula.by !== 'team' || 'ingredients' in pr.formula) throw new Error('project summary ' + JSON.stringify(pr.formula));
    if (!full || full.ingredients[0].amount !== 4.5) throw new Error('full formula not stored');
    await p.goto(`${B}/admin/projects/${pid}`, { waitUntil: 'networkidle' });
    const ing = await p.getByTestId('project-formula-ingredients').textContent();
    if (!ing.includes('عود كمبودي') || !ing.includes('4.5')) throw new Error('team view ' + ing);
    await asClient(p);
    await p.goto(`${B}/account/projects/${pid}`, { waitUntil: 'networkidle' });
    const card = await p.getByTestId('project-formula').textContent();
    if (!card.includes('عود الفجر') || card.includes('4.5') || card.includes('عود كمبودي')) throw new Error('client card ' + card);
  });

  await run('contract: the first installment must equal the paid deposit; a mismatch cannot be sent', async (p) => {
    await asStaff(p, 'sales');
    await p.goto(`${B}/admin/projects/${pid}`, { waitUntil: 'networkidle' });
    await p.getByRole('button', { name: 'أنشئ عقداً' }).click();
    const fe = p.getByTestId('finance-editor');
    if ((await fe.getByTestId('contract-total').inputValue()) !== '11500') throw new Error('total not from the quote');
    const link = fe.getByTestId('deposit-link');
    if ((await link.getAttribute('data-mismatch')) !== '0') throw new Error('should match at first');
    const rows = fe.getByTestId('schedule-row');
    await rows.nth(0).getByTestId('schedule-percent').fill('30');
    await rows.nth(1).getByTestId('schedule-percent').fill('70');
    if ((await link.getAttribute('data-mismatch')) !== '1') throw new Error('mismatch not flagged');
    await fe.scrollIntoViewIfNeeded();
    await p.screenshot({ path: `${OUT}/deposit-mismatch.png` });
    await p.getByRole('button', { name: 'احفظ وأرسل للعميل' }).click();
    await p.getByText(/الدفعة الأولى لا تساوي عربون عرض السعر/).first().waitFor();
    await fe.getByTestId('deposit-match').click();
    if ((await link.getAttribute('data-mismatch')) !== '0') throw new Error('«طابق العربون» did not fix it');
    if ((await rows.nth(0).getByTestId('schedule-percent').inputValue()) !== '50') throw new Error('first installment not 50%');
    await rows.nth(1).getByTestId('schedule-due-date').fill(new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10));
    await p.getByRole('button', { name: 'احفظ وأرسل للعميل' }).click();
    await toast(p, /أُرسل العقد للعميل/);
    const d = await store(p, 'pp_projects_v1');
    if ((d.contractPayments || []).length) throw new Error('invoiced before the client signed');
  });

  await run('client signs: the paid deposit settles the first installment with its invoice, and the amounts appear', async (p) => {
    await asClient(p);
    await p.goto(`${B}/account/contracts`, { waitUntil: 'networkidle' });
    await p.getByTestId('my-contract-open').first().click();
    await p.getByRole('button', { name: 'راجعت العقد — أوقّع' }).click();
    const box = p.getByTestId('sign-client');
    await box.getByRole('checkbox').check();
    await drawSignature(p);
    await box.getByRole('button', { name: 'وقّع العقد' }).click();
    await toast(p, /وُقّع العقد/);
    const d = await store(p, 'pp_projects_v1');
    const pay = d.contractPayments.filter((x) => x.projectId === pid);
    if (pay.length !== 1 || pay[0].source !== 'deposit' || pay[0].amount !== 5750 || pay[0].ref !== 'DEP-7781' || !/^INV-\d{4}-\d{5}$/.test(pay[0].invoiceNo)) throw new Error('deposit invoice ' + JSON.stringify(pay));
    await p.goto(`${B}/account/projects/${pid}`, { waitUntil: 'networkidle' });
    const inst = p.getByTestId('contract-schedule').getByTestId('installment');
    await inst.nth(0).getByTestId('from-deposit').waitFor();
    if ((await inst.nth(0).getAttribute('data-paid')) !== '1' || (await inst.nth(1).getAttribute('data-paid')) === '1') throw new Error('installment states');
    await p.getByTestId('contract-schedule').scrollIntoViewIfNeeded();
    await p.screenshot({ path: `${OUT}/deposit-installment.png` });
    await p.goto(`${B}/account/invoices`, { waitUntil: 'networkidle' });
    if (await p.getByTestId('my-invoice').count() !== 1 || await p.getByTestId('my-dues').locator('li').count() !== 1) throw new Error('one invoice and one due expected');
    await p.goto(`${B}/kit/${ref}?k=${token}`, { waitUntil: 'networkidle' });
    const t = await ingredients(p, 'عود الفجر');
    if (!t || !t.includes('4.5')) throw new Error('amounts not revealed after signing: ' + t);
    if (await p.getByTestId('disclosure-note').count()) throw new Error('disclosure note after signing');
    await asStaff(p, 'sales');
    await p.goto(`${B}/admin/projects/${pid}`, { waitUntil: 'networkidle' });
    const adminInst = p.getByTestId('contract-schedule').getByTestId('installment');
    if (await adminInst.nth(0).getByTestId('pay-open').count()) throw new Error('the deposit installment can be collected twice');
    if (!(await adminInst.nth(1).getByTestId('pay-open').count())) throw new Error('second installment not collectable');
  });

  await run('control centre: reminders tab lists the overdue installment for the client and the team; settings persist', async (p) => {
    await asStaff(p, 'owner');
    await p.goto(`${B}/admin/settings?tab=reminders`, { waitUntil: 'networkidle' });
    const tab = p.getByTestId('settings-reminders');
    const due = tab.getByTestId('reminders-due');
    await due.locator('[data-kind="installment_overdue"]').filter({ hasText: 'الدفعة النهائية' }).waitFor();
    await due.locator('[data-kind="installment_overdue_team"]').waitFor();
    if (!(await due.locator('[data-kind="installment_overdue"]').first().textContent()).includes(EMAIL)) throw new Error('client reminder without the address');
    // عنوان العينات لم يؤكَّد: لا تذكير قبل مهلته، ويظهر بعد مرورها
    if (await due.locator('[data-kind="kit_address"]').filter({ hasText: ref }).count()) throw new Error('address reminder before its delay');
    await p.evaluate((r) => { const d = JSON.parse(localStorage.getItem('pp_kits_v1')); const o = d.orders.find((x) => x.ref === r); o.createdAt = new Date(Date.now() - 3 * 86_400_000).toISOString(); localStorage.setItem('pp_kits_v1', JSON.stringify(d)); }, ref);
    await p.reload({ waitUntil: 'networkidle' });
    await due.locator('[data-kind="kit_address"]').filter({ hasText: ref }).waitFor();
    await tab.getByTestId('reminder-addressDays').fill('0');
    if ((await tab.getByTestId('reminder-addressDays').inputValue()) !== '1') throw new Error('delay below its minimum');
    await tab.getByTestId('reminder-quoteDays').fill('5');
    await tab.screenshot({ path: `${OUT}/reminders-tab.png` });
    await tab.getByTestId('reminder-maxRepeats').fill('99');
    if ((await tab.getByTestId('reminder-maxRepeats').inputValue()) !== '6') throw new Error('attempts not clamped: ' + await tab.getByTestId('reminder-maxRepeats').inputValue());
    await tab.getByTestId('reminders-enabled').uncheck();
    await p.getByTestId('settings-save').click();
    await toast(p, /./);
    await p.reload({ waitUntil: 'networkidle' });
    if (await p.getByTestId('reminders-enabled').isChecked() || (await p.getByTestId('reminder-quoteDays').inputValue()) !== '5') throw new Error('settings not persisted');
    await asStaff(p, 'designer');
    await p.goto(`${B}/admin/settings?tab=reminders`, { waitUntil: 'networkidle' });
    if (await p.getByTestId('reminders-enabled').count() && await p.getByTestId('reminders-enabled').isEnabled()) throw new Error('a designer can change reminders');
  });

  await run('production order: carries the approved formula scaled to the batch; without a project it says so', async (p) => {
    await asStaff(p, 'production');
    await p.goto(`${B}/admin/projects/${pid}`, { waitUntil: 'networkidle' });
    await p.getByTestId('project-new-po').click();
    await p.waitForURL(/\/admin\/production\?new=1&project=/);
    const f = p.getByTestId('po-new');
    await f.getByTestId('po-new-formula').getByText(/عود الفجر/).waitFor();
    await f.getByRole('button', { name: 'أنشئ أمر الإنتاج' }).click();
    await toast(p, /أُنشئ أمر الإنتاج/);
    const table = await p.getByTestId('po-formula-table').textContent();
    if (!table.includes('عود كمبودي') || !table.includes('4.5')) throw new Error('formula table ' + table);
    await p.getByTestId('po-formula').scrollIntoViewIfNeeded();
    await p.screenshot({ path: `${OUT}/po-formula.png` });
    const po = (await store(p, 'pp_production_v1')).find((x) => x.projectId === pid);
    if (po.formula?.name !== 'عود الفجر' || po.formula.ingredients[0].amount !== 4.5 || !String(po.formulaRef).startsWith(ref)) throw new Error('snapshot ' + JSON.stringify(po.formula));
  });

  await run('one-click reorder: a new project with the formula and draft quote and contract at the new quantity; capped at two unpriced', async (p) => {
    await asClient(p);
    await p.goto(`${B}/account/projects/${pid}`, { waitUntil: 'networkidle' });
    await p.getByTestId('reorder-open').click();
    const box = p.getByTestId('reorder-box');
    if ((await box.getByTestId('reorder-qty').inputValue()) !== '1000') throw new Error('previous quantity not prefilled');
    await box.screenshot({ path: `${OUT}/reorder-box.png` });
    await box.getByTestId('reorder-qty').fill('2500');
    await box.getByTestId('reorder-note').fill('نفس العبوة بغطاء ذهبي');
    await box.getByTestId('reorder-submit').click();
    await p.waitForURL(/\?reorder=1$/);
    const nid = new URL(p.url()).pathname.split('/').pop();
    await p.getByTestId('reorder-of').filter({ hasText: /الكمية 2,500/ }).waitFor();
    await p.getByTestId('project-formula').getByText('عود الفجر').waitFor();
    if (await p.getByTestId('quote-total').count()) throw new Error('the client sees the draft quote');
    const d = await store(p, 'pp_projects_v1');
    const np = d.projects.find((x) => x.id === nid);
    const q = d.quotes.find((x) => x.projectId === nid);
    const c = d.contracts.find((x) => x.projectId === nid);
    if (np.reorderOf !== pid || np.stage !== 'sourcing' || !np.title.endsWith('إعادة طلب 1')) throw new Error('project ' + JSON.stringify([np.reorderOf, np.stage, np.title]));
    if (q.status !== 'draft' || q.lines[0].qty !== 2500 || q.total !== 28750 || q.deposit !== 14375) throw new Error('quote ' + JSON.stringify([q.status, q.lines[0].qty, q.total, q.deposit]));
    if (c.status !== 'draft' || c.total !== 28750 || c.schedule[0].percent !== 50 || c.schedule.some((r) => r.dueDate)) throw new Error('contract ' + JSON.stringify([c.status, c.total, c.schedule]));
    if (!(d.formulas || []).some((x) => x.projectId === nid)) throw new Error('formula not carried over');
    // الفريق: يرى الأصل والإعادة، وينشئ إعادة ثانية للعميل، والثالثة تُرفض حتى تُسعَّر السابقتان
    await asStaff(p, 'sales');
    await p.goto(`${B}/admin/projects/${nid}`, { waitUntil: 'networkidle' });
    await p.getByTestId('reorder-panel').getByTestId('reorder-of').waitFor();
    if ((await p.getByLabel('كمية البند 1').inputValue()) !== '2500') throw new Error('draft quote not open for the team');
    await p.goto(`${B}/admin/projects/${pid}`, { waitUntil: 'networkidle' });
    const panel = p.getByTestId('reorder-panel');
    await panel.getByTestId('reorder-children').getByText(/إعادة طلب 1/).waitFor();
    await panel.getByTestId('reorder-open').click();
    await panel.getByTestId('reorder-qty').fill('500');
    await panel.getByTestId('reorder-submit').click();
    await toast(p, /أُنشئت إعادة الطلب/);
    await p.waitForURL((u) => u.pathname.startsWith('/admin/projects/') && !u.pathname.endsWith(pid));
    await p.goto(`${B}/admin/projects/${pid}`, { waitUntil: 'networkidle' });
    await p.getByTestId('reorder-panel').getByTestId('reorder-open').click();
    await p.getByTestId('reorder-panel').getByTestId('reorder-submit').click();
    await p.getByText(/ينتظران التسعير/).first().waitFor();
    if ((await store(p, 'pp_projects_v1')).projects.filter((x) => x.reorderOf === pid).length !== 2) throw new Error('third reorder created');
  });

  console.log(results.join('\n'));
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})();
