// شحنات العينات: لوحة الإدارة (الحالات، التتبع، خصم المخزون، مهمة المتابعة)، بطاقة «عيناتي»، والصفحة العامة /kit/:ref
const { chromium, OUT, url } = require('./lib.cjs');
const B = url('admin');
(async () => {
  const browser = await chromium.launch();
  const results = [], errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('_i')) { localStorage.setItem('pp_lang', 'ar'); sessionStorage.setItem('_i', '1'); } } catch {} });
  const run = async (name, fn) => {
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(`${name}: ${e.message}`));
    p.on('console', m => { if (m.type() === 'error' && !/ERR_|net::|Failed to load resource|remixicon/.test(m.text())) errors.push(`${name} console: ${m.text()}`); });
    try { await fn(p); results.push('PASS ' + name); } catch (e) { results.push(`FAIL ${name}: ${e.message.split('\n')[0]}`); await p.screenshot({ path: `${OUT}/fail-${name.replace(/\W+/g, '-')}.png`, fullPage: true }).catch(() => {}); }
    await p.close();
  };
  const toast = (p, re) => p.getByRole('status').filter({ hasText: re }).first().waitFor({ timeout: 8000 });
  const as = async (p, role) => {
    await p.goto(B + '/', { waitUntil: 'networkidle' });
    await p.evaluate(() => localStorage.removeItem('pp_session_email'));
    await p.goto(B + '/auth', { waitUntil: 'networkidle' });
    await p.getByLabel(/الدور التجريبي|Demo role/).selectOption(role);
    await p.getByRole('button', { name: /دخول كفريق المنصة|Continue as platform staff/ }).click();
    await p.waitForURL(/\/admin$/);
    await p.getByRole('navigation', { name: /لوحة الإدارة|Admin/ }).getByRole('link', { name: /نظرة عامة|Overview/ }).waitFor();
  };
  const client = async (p) => {
    await p.goto(B + '/auth', { waitUntil: 'networkidle' });
    await p.evaluate(() => localStorage.removeItem('pp_session_email'));
    await p.goto(B + '/auth', { waitUntil: 'networkidle' });
    await p.getByRole('button', { name: /دخول كعميل تجريبي/ }).click();
    await p.waitForURL((u) => !u.pathname.startsWith('/auth'));
  };
  const nav = (p) => p.getByRole('navigation', { name: /لوحة الإدارة|Admin/ });
  const seedStock = (p) => p.evaluate(() => {
    const now = new Date().toISOString();
    localStorage.setItem('pp_inventory_v1', JSON.stringify({ items: [{ id: 'smp-2ml', sku: 'SMP-2ML', name: 'عينة 2 مل', category: 'sample', unit: 'pcs', onHand: 50, reserved: 0, avgCost: 3, reorderLevel: 10, supplier: '', notes: '', active: true, createdAt: now, updatedAt: now }], moves: [] }));
    localStorage.removeItem('pp_kits_v1');
  });
  let ref = '';

  await run('permissions: who sees and manages kit shipments', async (p) => {
    const want = { owner: [true, true], production: [true, true], sales: [true, true], designer: [false, false], editor: [false, false] };
    for (const [role, [view, manage]] of Object.entries(want)) {
      await as(p, role);
      if ((await nav(p).getByRole('link', { name: 'شحنات العينات' }).count() > 0) !== view) throw new Error(`${role} nav`);
      if (!view) continue;
      await p.goto(B + '/admin/kits', { waitUntil: 'networkidle' });
      await p.getByTestId('kits-table').waitFor();
      await p.getByTestId('kits-table').locator('tbody tr').first().click();
      await p.getByTestId('kit-detail').waitFor();
      if ((await p.getByRole('radiogroup', { name: 'الحالة' }).count() > 0) !== manage) throw new Error(`${role} manage form`);
    }
  });

  await run('demo seed: orders from kit leads with varied statuses, badge counts the ones to prepare', async (p) => {
    await as(p, 'production');
    await seedStock(p);
    await p.goto(B + '/admin/kits', { waitUntil: 'networkidle' });
    const rows = p.getByTestId('kits-table').locator('tbody tr');
    const n = await rows.count();
    if (n < 5) throw new Error(`only ${n} orders`);
    const statuses = await p.getByTestId('kits-table').locator('[data-status]').evaluateAll((els) => els.map((e) => e.getAttribute('data-status')));
    for (const s of ['new', 'preparing', 'shipped', 'delivered']) if (!statuses.includes(s)) throw new Error(`missing status ${s}: ${statuses}`);
    const open = statuses.filter((s) => s === 'new' || s === 'preparing').length;
    const badge = (await nav(p).getByRole('link', { name: /شحنات العينات/ }).textContent()).replace(/\D/g, '');
    if (Number(badge) !== open) throw new Error(`badge ${badge} vs ${open}`);
    // رابط التتبع في جدول الشحنات المشحونة
    const shippedRow = rows.filter({ has: p.locator('[data-status="shipped"]') }).first();
    const href = await shippedRow.getByRole('link').first().getAttribute('href');
    if (!/^https:\/\//.test(href || '')) throw new Error(`tracking link ${href}`);
    await p.screenshot({ path: `${OUT}/kits-admin.png`, fullPage: true });
  });

  await run('ship: carrier required, auto tracking link, stock deducted, client told; then delivered → follow-up task', async (p) => {
    await as(p, 'production');
    await p.goto(B + '/admin/kits?status=new', { waitUntil: 'networkidle' });
    const row = p.getByTestId('kits-table').locator('tbody tr').filter({ has: p.locator('[data-status="new"]') }).first();
    ref = (await row.locator('td').first().getByRole('button').textContent()).trim();
    if (!/^KIT-[A-Z0-9]{6}$/.test(ref)) throw new Error(`ref ${ref}`);
    await row.click();
    const d = p.getByTestId('kit-detail');
    await d.getByRole('radio', { name: 'شُحن' }).click();
    const issue = d.getByTestId('kit-issue');
    await issue.waitFor();
    await issue.getByLabel('كمية عينة 2 مل').fill('3');
    await d.getByRole('button', { name: 'حفظ' }).click();
    if (!(await d.getByRole('combobox', { name: /شركة الشحن/ }).evaluate((el) => !el.validity.valid))) throw new Error('carrier not required');
    await d.getByRole('combobox', { name: /شركة الشحن/ }).selectOption('SMSA');
    await d.getByLabel('رقم التتبع').fill('290123456789');
    const auto = await d.getByLabel(/رابط التتبع/).inputValue();
    if (!auto.includes('smsaexpress.com') || !auto.includes('290123456789')) throw new Error(`auto url ${auto}`);
    await d.getByText('سيُبلَّغ العميل برقم التتبع').waitFor();
    await d.getByRole('button', { name: 'حفظ' }).click();
    await toast(p, /سُجِّل الشحن/);
    await p.goto(B + '/admin/kits', { waitUntil: 'networkidle' });
    const shipped = p.getByTestId('kits-table').locator('tbody tr').filter({ hasText: ref }).first();
    if ((await shipped.locator('[data-status]').getAttribute('data-status')) !== 'shipped') throw new Error('not shipped');
    // المخزون خُصم
    const stock = await p.evaluate(() => JSON.parse(localStorage.getItem('pp_inventory_v1')));
    if (stock.items[0].onHand !== 47) throw new Error(`on hand ${stock.items[0].onHand}`);
    if (!stock.moves.some((m) => m.kind === 'issue' && m.qty === 3 && m.note.includes(ref))) throw new Error('issue move missing');
    // التسليم → مهمة بعد 3 أيام ونشاط في سجل العميل
    await shipped.click();
    const d2 = p.getByTestId('kit-detail');
    await d2.getByRole('radio', { name: 'سُلِّم' }).click();
    await d2.getByText('سيُسجَّل تذكير').waitFor();
    await d2.getByRole('button', { name: 'حفظ' }).click();
    await toast(p, /حُفظت الشحنة/);
    await p.goto(B + '/admin/tasks', { waitUntil: 'networkidle' });
    await p.getByRole('tab', { name: 'كل الفريق' }).click();
    await p.getByText(new RegExp(`ادعُ العميل لحجز مكالمة.*${ref}`)).first().waitFor();
    const crm = await p.evaluate(() => JSON.parse(localStorage.getItem('pp_crm_v1')));
    const task = crm.tasks.find((t) => t.title.includes(ref));
    const days = (new Date(task.dueAt) - Date.now()) / 864e5;
    if (days < 2.9 || days > 3.1) throw new Error(`due in ${days} days`);
    if (!crm.activities.some((a) => a.body.includes(`سُلِّمت عينة ${ref}`))) throw new Error('activity missing');
    await p.goto(B + '/admin/kits', { waitUntil: 'networkidle' });
    await p.getByTestId('kits-table').locator('tbody tr').filter({ hasText: ref }).first().click();
    await p.getByTestId('kit-detail').getByText('السجل').waitFor();
    await p.screenshot({ path: `${OUT}/kits-detail.png`, fullPage: true });
  });

  await run('public tracking page: by ref without login, no personal data; unknown ref → lookup form', async (p) => {
    await p.goto(B + '/', { waitUntil: 'networkidle' });
    await p.evaluate(() => localStorage.removeItem('pp_session_email'));
    await p.goto(B + `/kit/${ref.toLowerCase()}`, { waitUntil: 'networkidle' });
    const card = p.getByTestId('kit-track');
    await card.waitFor();
    await card.getByText(ref).waitFor();
    if ((await card.locator('[data-status]').getAttribute('data-status')) !== 'delivered') throw new Error('status');
    await card.getByRole('link', { name: /احجز مكالمة المتابعة/ }).waitFor();
    const text = await card.textContent();
    if (/@|حي |0551/.test(text)) throw new Error('personal data leaked');
    if (!text.includes('290123456789') || !text.includes('SMSA')) throw new Error('tracking missing');
    await p.goto(B + '/kit/KIT-DEMO01', { waitUntil: 'networkidle' });
    const demo = p.getByTestId('kit-track');
    if ((await demo.locator('[data-status]').getAttribute('data-status')) !== 'shipped') throw new Error('demo status');
    const ext = await demo.getByRole('link', { name: /SMSA|تتبّع/ }).first().getAttribute('href');
    if (!/smsaexpress/.test(ext || '')) throw new Error(`ext ${ext}`);
    await p.screenshot({ path: `${OUT}/kit-public.png`, fullPage: true });
    await p.goto(B + '/kit/KIT-NOPE00', { waitUntil: 'networkidle' });
    await p.getByTestId('kit-missing').waitFor();
    await p.getByRole('textbox', { name: 'رقم الطلب' }).fill('demo01');
    await p.getByRole('button', { name: 'عرض' }).click();
    await p.waitForURL(/\/kit\/KIT-DEMO01$/);
    await p.getByTestId('kit-track').waitFor();
    await p.setViewportSize({ width: 375, height: 812 });
    await p.goto(B + '/kit/KIT-DEMO01', { waitUntil: 'networkidle' });
    const ov = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (ov) throw new Error(`mobile overflow ${ov}`);
    await p.screenshot({ path: `${OUT}/kit-public-mobile.png`, fullPage: true });
  });

  await run('client account: «my kits» card with progress and tracking link; staff pages fit on mobile', async (p) => {
    await client(p);
    await p.goto(B + '/account', { waitUntil: 'networkidle' });
    const section = p.getByTestId('my-kits');
    await section.waitFor();
    const card = section.getByTestId('kit-card').filter({ hasText: 'KIT-DEMO01' });
    await card.waitFor();
    if ((await card.locator('[data-status]').first().getAttribute('data-status')) !== 'shipped') throw new Error('status');
    if ((await card.getByRole('progressbar').first().getAttribute('aria-valuenow')) !== '3') throw new Error('progress');
    const href = await card.getByRole('link', { name: /SMSA/ }).getAttribute('href');
    if (!/smsaexpress/.test(href || '')) throw new Error(`href ${href}`);
    await p.screenshot({ path: `${OUT}/kits-account.png`, fullPage: true });
    // الشحنة المشحونة بعيّناتها المسمّاة تدعو العميل للتقييم برابطها ذي الرمز
    await card.getByTestId('kit-card-cta').click();
    await p.waitForURL(/\/kit\/KIT-DEMO01\?k=/);
    await p.getByTestId('kit-track').waitFor();
    await p.getByTestId('sample-decisions').getByTestId('sample-card').nth(2).waitFor();
    await as(p, 'owner');
    await p.setViewportSize({ width: 375, height: 812 });
    await p.goto(B + '/admin/kits', { waitUntil: 'networkidle' });
    const ov = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (ov) throw new Error(`admin overflow ${ov}`);
    await p.evaluate(() => localStorage.setItem('pp_lang', 'en'));
    await p.goto(B + '/admin/kits', { waitUntil: 'networkidle' });
    await p.getByRole('heading', { name: 'Sample shipments' }).waitFor();
    await p.screenshot({ path: `${OUT}/kits-admin-mobile-en.png`, fullPage: true });
  });

  console.log(results.join('\n'));
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})();
