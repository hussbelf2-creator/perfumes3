// أوامر الإنتاج ومركز التحكم وخطة العميل: من إنشاء التشغيلة إلى الإفراج، وما يراه العميل منها
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
    try { await fn(p); results.push('PASS ' + name); } catch (e) { results.push(`FAIL ${name}: ${e.message.split('\n')[0]}`); await p.screenshot({ path: `${OUT}/fail-${name.replace(/\W+/g, '-').slice(0, 60)}.png`, fullPage: true }).catch(() => {}); }
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
  const done = (p, step) => p.locator(`[data-step="${step}"]`).getByRole('button', { name: /^(أنجزت|أفرج)$/ });
  let batch = '';

  await run('permissions: who sees production orders and the control centre', async (p) => {
    const want = { owner: [true, true], admin: [true, true], sales: [true, false], production: [true, false], designer: [false, false], editor: [false, false] };
    for (const [role, [prod, ctl]] of Object.entries(want)) {
      await as(p, role);
      if ((await nav(p).getByRole('link', { name: 'أوامر الإنتاج' }).count() > 0) !== prod) throw new Error(`${role} production nav`);
      if ((await nav(p).getByRole('link', { name: 'مركز التحكم' }).count() > 0) !== ctl) throw new Error(`${role} control nav`);
    }
    await p.goto(B + '/admin/settings', { waitUntil: 'networkidle' });
    await p.getByRole('heading', { name: 'هذه الصفحة خارج صلاحياتك' }).waitFor();
  });

  await run('a batch from creation to release: ordered steps, golden sample, maceration clock, stock issue, AQL, locked record', async (p) => {
    await as(p, 'owner');
    await p.goto(B + '/admin/projects?new=1', { waitUntil: 'networkidle' });
    const dlg = p.getByRole('dialog');
    await dlg.getByLabel('اسم المشروع').fill('مسك الليل EDP');
    await dlg.getByLabel('المسار').selectOption('E');
    await dlg.getByLabel('بريد العميل').fill('client@demo.local');
    await dlg.getByRole('button', { name: 'إنشاء المشروع' }).click();
    await toast(p, /أُنشئ المشروع/);
    await as(p, 'production');
    await p.evaluate(() => {
      const now = new Date().toISOString();
      localStorage.setItem('pp_inventory_v1', JSON.stringify({ items: [{ id: 'btl-50', sku: 'BTL-50', name: 'زجاجة 50 مل', category: 'bottle', unit: 'pcs', onHand: 5000, reserved: 0, avgCost: 6, reorderLevel: 500, supplier: '', notes: '', active: true, createdAt: now, updatedAt: now }], moves: [] }));
      localStorage.removeItem('pp_production_v1');
    });
    await p.goto(B + '/admin/production', { waitUntil: 'networkidle' });
    await p.getByRole('button', { name: 'أمر إنتاج جديد' }).click();
    const nf = p.getByTestId('po-new');
    await nf.getByRole('combobox').first().selectOption({ label: 'مسك الليل EDP' });
    if ((await nf.getByLabel('المنتج').inputValue()) !== 'مسك الليل EDP') throw new Error('product not prefilled from the project');
    await nf.getByLabel('الكمية (وحدة)').fill('2000');
    await nf.getByRole('button', { name: 'أنشئ أمر الإنتاج' }).click();
    await toast(p, /أُنشئ أمر الإنتاج/);
    const d = p.getByTestId('po-detail');
    await d.waitFor();
    batch = (await d.getByTestId('po-batch').textContent()).trim();
    if (!/^B\d{6}-\d{2}$/.test(batch)) throw new Error(`batch ${batch}`);
    if (await d.locator('[data-step]').count() !== 9) throw new Error('perfume order should have nine steps');
    if (await d.locator('[data-qc]').count() !== 11) throw new Error('QC list from settings');
    // المواد: المطلوب بالهدر، ثم الصرف من المخزون
    const bom = d.getByTestId('po-bom');
    await bom.getByRole('combobox', { name: 'مادة من المخزون' }).selectOption('btl-50');
    await bom.getByRole('button', { name: 'أضف' }).click();
    await toast(p, /أُضيفت المادة/);
    await bom.getByText('2,060.00').first().waitFor();
    await bom.getByTestId('po-issue').click();
    await toast(p, /صُرفت المواد من المخزون/);
    const inv = await p.evaluate(() => JSON.parse(localStorage.getItem('pp_inventory_v1')));
    if (inv.items[0].onHand !== 2940) throw new Error(`stock ${inv.items[0].onHand}`);
    if (!inv.moves[0].note.includes(batch)) throw new Error('issue note lacks the batch number');
    // الخطوات بالترتيب
    await done(p, 'materials').click();
    await toast(p, /سُجّلت الخطوة/);
    await d.locator('[data-step="golden"] [data-block="golden_required"]').waitFor();
    if (!(await done(p, 'golden').isDisabled())) throw new Error('golden step not blocked');
    await d.getByLabel('وقّع العميل على العينة الذهبية').check();
    await done(p, 'golden').click();
    await d.locator('[data-step="golden"][data-done="true"]').waitFor();
    await done(p, 'compound').click();
    await d.locator('[data-step="compound"][data-done="true"]').waitFor();
    // ساعة التعتيق
    await d.getByTestId('po-maceration').getByText(/باقٍ 21 يوماً/).waitFor();
    await d.locator('[data-step="maceration"] [data-block="maceration_running"]').waitFor();
    if (!(await done(p, 'maceration').isDisabled())) throw new Error('maceration not blocked');
    await p.screenshot({ path: `${OUT}/production-maceration.png`, fullPage: true });
    await d.getByPlaceholder(/انحراف موثّق/).fill('طلب العميل التسليم المبكر ووافق مدير الجودة');
    await d.locator('[data-step="maceration"]').getByRole('button', { name: 'سجّل' }).click();
    await toast(p, /سُجّل الانحراف/);
    for (const s of ['maceration', 'filter', 'fill', 'pack', 'qc']) {
      await done(p, s).click();
      await d.locator(`[data-step="${s}"][data-done="true"]`).waitFor();
    }
    // الإفراج: فحص كامل ثم عائد
    await d.locator('[data-step="release"] [data-block="qc_incomplete"]').waitFor();
    const qc = d.locator('[data-qc] input');
    for (let i = 0; i < 11; i++) { await qc.nth(i).fill(i === 0 ? '1' : '0'); await p.waitForTimeout(120); }
    await d.getByTestId('po-verdict').and(d.locator('[data-pass="false"]')).waitFor();
    await d.locator('[data-step="release"] [data-block="qc_failed"]').waitFor();
    await qc.nth(0).fill('0');
    await d.getByTestId('po-verdict').and(d.locator('[data-pass="true"]')).waitFor();
    await d.locator('[data-step="release"] [data-block="yield_required"]').waitFor();
    await d.getByLabel('وحدات صالحة').fill('1980');
    await d.getByText('العائد 99.0%').waitFor();
    await done(p, 'release').click();
    await toast(p, /أُفرج عن التشغيلة/);
    await d.locator('[data-status="released"]').waitFor();
    if (await d.getByRole('button', { name: 'أوقف مؤقتاً' }).count()) throw new Error('released order still editable');
    if (!(await d.getByLabel('وحدات صالحة').isDisabled())) throw new Error('record not locked');
    await p.screenshot({ path: `${OUT}/production-released.png`, fullPage: true });
    await p.goto(B + '/admin/production', { waitUntil: 'networkidle' });
    await p.getByText('لا أوامر إنتاج هنا').waitFor(); // «الجارية» لا تعرض المُفرج عنه
    await p.getByRole('combobox', { name: 'الحالة' }).selectOption('all');
    await p.getByTestId('po-table').getByText(batch).waitFor();
    await p.screenshot({ path: `${OUT}/production-list.png`, fullPage: true });
  });

  await run('the client follows it: a plan with dates on the project, four production phases, no factory internals', async (p) => {
    await client(p);
    await p.goto(B + '/account/projects', { waitUntil: 'networkidle' });
    await p.getByRole('link', { name: /مسك الليل EDP/ }).first().click();
    const card = p.getByTestId('production-progress');
    await card.waitFor();
    await card.getByText(batch).waitFor();
    await card.getByText('جاهزة للتسليم').waitFor();
    if (await card.locator('[data-phase]').count() !== 4) throw new Error('phases');
    if (await card.locator('[data-phase][data-done="true"]').count() !== 4) throw new Error('all phases should be done');
    const txt = await card.textContent();
    if (/AQL|عيوب|هدر|انحراف|BTL-50/.test(txt)) throw new Error('internals leaked to the client');
    const plan = p.getByTestId('project-plan');
    await plan.waitFor();
    if (!/\d+ – \d+ أسبوعاً/.test(await plan.getByTestId('plan-eta').textContent())) throw new Error('plan eta');
    await p.getByTestId('project-sections').getByRole('link', { name: /الخطة/ }).click();
    await plan.getByText('ما يحكم موعد التسليم').waitFor();
    if (await plan.locator('[data-lane="client"]').count() < 2) throw new Error('client checkpoints not marked');
    await p.screenshot({ path: `${OUT}/client-project-plan.png`, fullPage: true });
  });

  await run('start flow shows a live plan: answers change the weeks', async (p) => {
    await p.goto(B + '/start/E', { waitUntil: 'networkidle' });
    if (await p.getByTestId('plan-preview').count()) throw new Error('plan shown before any answer');
    const q = (name) => p.locator('fieldset').filter({ hasText: name });
    await q('هل التركيبة جاهزة؟').getByText('نعم، جاهزة').click();
    await q('هل العبوات جاهزة؟').getByText('نعم', { exact: true }).click();
    const plan = p.getByTestId('plan-preview');
    await plan.waitFor();
    const weeks = async () => (await plan.getByTestId('plan-weeks').textContent()).match(/\d+/g).map(Number);
    const fast = await weeks();
    await q('هل التركيبة جاهزة؟').getByText('نحتاج تطويرها').click();
    await p.waitForFunction((old) => document.querySelector('[data-testid="plan-weeks"]').textContent.match(/\d+/g).join() !== old, fast.join());
    const slow = await weeks();
    if (!(slow[1] > fast[1])) throw new Error(`weeks ${fast} → ${slow}`);
    await plan.getByText(/ما يحكم الموعد: تطوير التركيبة/).waitFor();
    await p.screenshot({ path: `${OUT}/start-plan.png`, fullPage: true });
  });

  await run('control centre: hiding kits and styles and changing durations reaches the studio and the plans', async (p) => {
    await as(p, 'owner');
    await p.goto(B + '/admin/settings', { waitUntil: 'networkidle' });
    const cat = p.getByTestId('settings-catalog');
    await cat.getByText(/الأطقم الجاهزة \(72 ظاهرة من 72\)/).waitFor();
    await cat.locator('[data-kit-row="start-30"]').getByRole('switch').click();
    await cat.locator('[data-kit-row="oud-royal"]').getByRole('button', { name: /مميز/ }).click();
    await cat.locator('[data-style-toggle="magnetic"]').click();
    await cat.getByText(/الأطقم الجاهزة \(71 ظاهرة من 72\)/).waitFor();
    await p.screenshot({ path: `${OUT}/settings-catalog.png` });
    await p.getByRole('tab', { name: 'خطة التصنيع' }).click();
    const before = await p.getByTestId('plan-sample').textContent();
    await p.getByLabel('أو دو بارفان (EDP): الأدنى').fill('60');
    await p.getByLabel('أو دو بارفان (EDP): الأقصى').fill('90');
    await p.waitForFunction((old) => document.querySelector('[data-testid="plan-sample"]').textContent !== old, before);
    await p.screenshot({ path: `${OUT}/settings-plan.png`, fullPage: true });
    await p.getByRole('tab', { name: 'فحص الجودة' }).click();
    await p.getByTestId('settings-qc').getByRole('button', { name: 'أضف بنداً' }).click();
    if (await p.locator('[data-qc-row]').count() !== 12) throw new Error('qc item not added');
    await p.getByTestId('settings-save').click();
    await toast(p, /حُفظت الإعدادات ونُشرت/);
    await p.getByRole('tab', { name: 'كل الإعدادات' }).click();
    await p.getByTestId('settings-hub').getByRole('link').nth(7).waitFor();
    // الاستوديو المبسّط يتبع الإعدادات
    await p.evaluate(() => localStorage.setItem('pp_studio_mode', 'easy'));
    await p.goto(B + '/studio-3d', { waitUntil: 'networkidle' });
    await p.getByText(/71 طقماً منسجماً/).waitFor();
    if (await p.locator('[data-kit]').count() !== 1 || !(await p.locator('[data-kit="oud-royal"]').count())) throw new Error('featured kits not from settings');
    await p.getByTestId('kit-step').getByRole('tab', { name: 'بداية اقتصادية' }).click();
    if (await p.locator('[data-kit]').count() !== 5) throw new Error('hidden kit still listed');
    await p.goto(B + '/studio-3d?b=B-TOWER&step=box', { waitUntil: 'networkidle' });
    await p.getByTestId('box-step').waitFor();
    if (await p.locator('[data-style="magnetic"]').count()) throw new Error('hidden style still recommended');
    // أمر إنتاج جديد يأخذ قائمة الفحص وأيام التعتيق الجديدة
    await p.evaluate(() => localStorage.setItem('pp_studio_mode', 'pro'));
    await p.goto(B + '/admin/production?new=1', { waitUntil: 'networkidle' });
    const nf = p.getByTestId('po-new');
    await nf.getByLabel('المنتج').fill('تشغيلة داخلية');
    await nf.getByRole('button', { name: 'أنشئ أمر الإنتاج' }).click();
    const d = p.getByTestId('po-detail');
    await d.waitFor();
    if (await d.locator('[data-qc]').count() !== 12) throw new Error('new order ignores the QC settings');
    for (const s of ['materials']) await done(p, s).click();
    await d.getByLabel('وقّع العميل على العينة الذهبية').check();
    await done(p, 'golden').click();
    await done(p, 'compound').click();
    await d.getByTestId('po-maceration').getByText(/باقٍ 60 يوماً/).waitFor();
  });

  await run('new admin pages fit a phone and read in English', async (p) => {
    await as(p, 'owner');
    await p.setViewportSize({ width: 375, height: 812 });
    for (const u of ['/admin/production', '/admin/settings', '/admin/settings?tab=plan', '/admin/settings?tab=qc']) {
      await p.goto(B + u, { waitUntil: 'networkidle' });
      const ov = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (ov) throw new Error(`${u} overflow ${ov}`);
    }
    await p.evaluate(() => localStorage.setItem('pp_lang', 'en'));
    await p.goto(B + '/admin/production', { waitUntil: 'networkidle' });
    await p.getByRole('heading', { name: 'Production orders' }).waitFor();
    await p.goto(B + '/admin/settings', { waitUntil: 'networkidle' });
    await p.getByRole('heading', { name: 'Control centre' }).waitFor();
  });

  console.log(results.join('\n'));
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})();
