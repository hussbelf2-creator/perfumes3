// مواصفات التصنيع في الاستوديو: خيارات العبوة، الملاءمة الذكية للعلبة، الملحقات، جاهزية الملصق — ومتطلبات التصنيع والتصدير في الصفحات
const { chromium, OUT, url, FIX } = require('./lib.cjs');
const B = url('site');
const A = url('admin');
(async () => {
  const browser = await chromium.launch();
  const results = [], errors = [];
  const run = async (name, fn, opts = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    try { await fn(p); results.push('PASS ' + name); } catch (e) { results.push(`FAIL ${name}: ${e.message.split('\n')[0]}`); await p.screenshot({ path: `${OUT}/fail-${name.replace(/\W+/g, '-')}.png`, fullPage: true }).catch(() => {}); }
    await ctx.close();
  };

  await run('bottle options live in the URL, price the bottle and reach the summary', async (p) => {
    await p.goto(B + '/studio-3d', { waitUntil: 'networkidle' });
    await p.getByTestId('bottle-spec').waitFor();
    await p.getByRole('radio', { name: /غطاء مغناطيسي/ }).click();
    await p.getByRole('radio', { name: /نقش ليزر/ }).click();
    await p.waitForURL(/cm=magnetic/);
    if (!/dc=laser/.test(p.url())) throw new Error('decoration not in url');
    await p.getByText('إضافة الخيارات: 4.60 ر.س لكل عبوة').waitFor();
    const sum = await p.locator('section[aria-label="خيارات التصميم"] p').filter({ hasText: /^أطلس/ }).first().innerText();
    if (!sum.includes('غطاء مغناطيسي') || !sum.includes('نقش ليزر')) throw new Error('summary ' + sum);
    // يعود كما هو من الرابط
    await p.reload({ waitUntil: 'networkidle' });
    if ((await p.getByRole('radio', { name: /غطاء مغناطيسي/ }).getAttribute('aria-checked')) !== 'true') throw new Error('spec lost on reload');
  });

  // أقسام اللوحة أكورديون: نفتح القسم المطلوب قبل التعامل مع عناصره
  const acc = async (p, id) => { const h = p.getByTestId(id).getByRole('button').first(); if ((await h.getAttribute('aria-expanded')) !== 'true') { await h.click(); await p.waitForTimeout(250); } };
  await run('smart fit: ok when auto-fitted, tight when the inner height shrinks, suggests the style for the size', async (p) => {
    await p.goto(B + '/studio-3d?tab=box', { waitUntil: 'networkidle' });
    const fit = p.getByTestId('smart-fit');
    await fit.waitFor();
    if ((await fit.getAttribute('data-level')) !== 'ok') throw new Error('default box should fit');
    // 50 مل: الاقتراح علبة صلبة بدل البلسان
    await fit.getByText(/ننصح بـ«علبة صلبة بغطاء»/).waitFor();
    await acc(p, 'acc-size');
    await p.getByLabel('الارتفاع', { exact: true }).fill('90');
    await p.getByLabel('الارتفاع', { exact: true }).press('Enter');
    await acc(p, 'acc-style');
    await p.waitForFunction(() => document.querySelector('[data-testid=smart-fit]')?.dataset.level === 'tight');
    await fit.getByRole('button', { name: 'طابق المقاس تلقائياً' }).click();
    await p.waitForFunction(() => document.querySelector('[data-testid=smart-fit]')?.dataset.level === 'ok');
    await acc(p, 'acc-size');
    await p.getByLabel('العرض').fill('120');
    await p.getByLabel('العرض').press('Enter');
    await acc(p, 'acc-style');
    await p.waitForFunction(() => document.querySelector('[data-testid=smart-fit]')?.dataset.level === 'loose');
    await fit.getByRole('button', { name: 'اعتمد المقترح' }).click();
    await p.waitForFunction(() => document.querySelector('[data-testid=smart-fit]')?.dataset.level === 'ok');
    if ((await p.getByRole('radio', { name: /علبة صلبة بغطاء/ }).getAttribute('aria-checked')) !== 'true') throw new Error('suggested style not applied');
  });

  await run('extras: recommendations follow the box, one insert at a time, priced into the box and kept in the summary', async (p) => {
    await p.goto(B + '/studio-3d?tab=box', { waitUntil: 'networkidle' });
    await p.getByRole('radio', { name: /علبة مغناطيسية/ }).click();
    await acc(p, 'acc-extras');
    const extras = p.getByTestId('extras');
    await extras.getByText('موصى به لهذه العلبة').waitFor();
    const before = await p.getByTestId('box-unit-price').innerText();
    await extras.getByRole('button', { name: 'أضف كل المقترحات' }).click();
    for (const n of ['حشوة إسفنج EVA', 'بطاقة المكوّنات (INCI)', 'بطاقة شكر']) if (!(await extras.getByRole('checkbox', { name: n }).isChecked())) throw new Error('not added: ' + n);
    await extras.getByRole('checkbox', { name: 'حشوة ورق مقولب' }).check();
    if (await extras.getByRole('checkbox', { name: 'حشوة إسفنج EVA' }).isChecked()) throw new Error('two inserts at once');
    const after = await p.getByTestId('box-unit-price').innerText();
    if (before === after) throw new Error('extras not priced');
    await p.locator('details').filter({ hasText: 'كيف حُسب السعر؟' }).locator('summary').click();
    await p.getByTestId('box-breakdown').getByText(/الملحقات \(/).waitFor();
    const sum = await p.locator('.bg-ink-900 p').filter({ hasText: /ملحقات:/ }).first().innerText();
    if (!sum.includes('حشوة ورق مقولب') || !sum.includes('بطاقة شكر')) throw new Error('summary ' + sum);
    // يبقى بعد التحديث (محفوظ مع العلبة)
    await p.reload({ waitUntil: 'networkidle' });
    await acc(p, 'acc-extras');
    if (!(await p.getByTestId('extras').getByRole('checkbox', { name: 'بطاقة شكر' }).isChecked())) throw new Error('extras lost on reload');
  });

  await run('label readiness flags the missing volume and clears when it matches the bottle', async (p) => {
    await p.goto(B + '/studio-3d?tab=label', { waitUntil: 'networkidle' });
    await p.getByRole('switch', { name: 'أضف ملصقاً على العبوة' }).check();
    const list = p.getByTestId('label-checklist');
    await list.waitFor();
    const details = p.getByLabel(/التفاصيل/).first();
    await details.fill('Eau de Parfum');
    await list.locator('[data-ok=false]').filter({ hasText: 'الحجم بالمل' }).waitFor();
    await details.fill('Eau de Parfum · 100 ml');
    await list.locator('[data-ok=false]').filter({ hasText: 'لا يطابق العبوة' }).waitFor();
    await details.fill('Eau de Parfum · 50 ml');
    await p.waitForFunction(() => !document.querySelector('[data-testid=label-checklist] [data-ok=false]'));
  });

  await run('label production: stock, effects, set and engraving price the label and reach the summary and the request', async (p) => {
    await p.goto(B + '/studio-3d?tab=label', { waitUntil: 'networkidle' });
    await p.getByRole('switch', { name: 'أضف ملصقاً على العبوة' }).check();
    const price = p.getByTestId('label-unit-price');
    await price.waitFor();
    const before = await price.innerText();
    await acc(p, 'acc-material');
    await p.getByTestId('label-material').getByRole('radio', { name: /ورق معدني/ }).click();
    await p.getByTestId('label-effects').getByText('بروز (Embossing)').click();
    await acc(p, 'acc-set');
    await p.getByTestId('label-set').getByRole('checkbox', { name: /ملصق خلفي/ }).check();
    await acc(p, 'acc-engrave');
    await p.getByTestId('engrave-switch').check();
    await p.getByTestId('engrave-text').fill('لسارة');
    await p.getByRole('radio', { name: /القاعدة/ }).click();
    await p.waitForFunction((b) => document.querySelector('[data-testid=label-unit-price]')?.textContent !== b, before);
    const sum = await p.locator('section[aria-label="خيارات التصميم"] p').filter({ hasText: /^أطلس/ }).first().innerText();
    for (const s of ['ورق معدني', 'بروز', 'ملصق خلفي', 'نقش على الزجاج', 'لسارة']) if (!sum.includes(s)) throw new Error('summary missing ' + s + ': ' + sum);
    // يبقى بعد التحديث ويصل الطلب
    await p.reload({ waitUntil: 'networkidle' });
    await acc(p, 'acc-engrave');
    if (!(await p.getByTestId('engrave-text').inputValue()).includes('لسارة')) throw new Error('engraving lost on reload');
    await p.goto(B + '/studio-3d?track=F&tab=label', { waitUntil: 'networkidle' });
    await p.getByRole('region', { name: 'لوحة العمل' }).getByRole('button', { name: 'أكمل الطلب' }).click();
    await p.waitForURL(/\/start\/F\?from=work$/);
    await p.getByTestId('work-card').getByText(/نقش على الزجاج/).waitFor();
  });

  await run('label templates: 15 grouped templates, 40 shapes, saved custom template re-applies, artwork upload shows on the bottle', async (p) => {
    await p.goto(B + '/studio-3d?tab=label', { waitUntil: 'networkidle' });
    await p.getByRole('switch', { name: 'أضف ملصقاً على العبوة' }).check();
    await acc(p, 'acc-template');
    if ((await p.locator('[data-testid^=tpl-]').count()) !== 15) throw new Error('expected 15 templates');
    await p.getByTestId('tpl-andalus').click();
    await acc(p, 'acc-shape');
    if ((await p.locator('[data-testid^=shape-][role=radio]').count()) !== 40) throw new Error('expected 40 shapes');
    if ((await p.getByTestId('shape-star8').getAttribute('aria-checked')) !== 'true') throw new Error('andalus template should pick the 8-point star');
    await p.getByTestId('shape-shield').click();
    await acc(p, 'acc-template');
    p.once('dialog', (d) => d.accept('درعي'));
    await p.getByTestId('save-template').click();
    await p.getByText(/حُفظ «درعي»/).waitFor();
    await p.getByTestId('tpl-minimal').click();
    await p.locator('[data-testid^=my-tpl-]').first().click();
    await acc(p, 'acc-shape');
    if ((await p.getByTestId('shape-shield').getAttribute('aria-checked')) !== 'true') throw new Error('custom template did not restore the shield shape');
    await p.reload({ waitUntil: 'networkidle' });
    await acc(p, 'acc-template');
    if (!(await p.locator('[data-testid^=my-tpl-]').count())) throw new Error('custom template lost on reload');
    await p.getByTestId('artwork-input').setInputFiles(`${FIX}/work.png`);
    await p.getByTestId('artwork-upload').getByRole('button', { name: 'إزالة' }).waitFor();
    await p.waitForSelector('main > section:first-child [role=img][aria-busy=false] canvas', { timeout: 30000 });
    const sum = await p.locator('section[aria-label="خيارات التصميم"] p').filter({ hasText: /^أطلس/ }).first().innerText();
    if (!sum.includes('ملف العميل الجاهز')) throw new Error('summary lacks the artwork line: ' + sum);
  });

  await run('admin: image-to-3D offers extra angles, quality and symmetry, and the demo conversion still completes', async (p) => {
    await p.goto(A + '/auth', { waitUntil: 'networkidle' });
    await p.getByRole('button', { name: /دخول كمالك المنصة/ }).click();
    await p.waitForURL(/\/admin/);
    await p.goto(A + '/admin/studio/ai', { waitUntil: 'networkidle' });
    const opt = p.getByTestId('ai-options');
    await opt.getByRole('radio', { name: 'عالية' }).click();
    await opt.getByRole('radio', { name: 'متناظر' }).click();
    await opt.getByText(/300k مضلّع/).waitFor();
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    await opt.getByLabel('صورة الخلف').setInputFiles({ name: 'back.png', mimeType: 'image/png', buffer: png });
    await opt.getByRole('button', { name: 'إزالة صورة الخلف' }).waitFor();
  });

  await run('service page lists manufacturing requirements; services page has the export explorer', async (p) => {
    await p.goto(B + '/services/E#requirements', { waitUntil: 'networkidle' });
    await p.getByRole('heading', { name: 'ما نحتاجه منك، وما تستلمه منا' }).waitFor();
    await p.getByText('إشعار هيئة الغذاء والدواء (SFDA)').waitFor();
    await p.getByText('تشغيلة تجريبية').waitFor();
    await p.goto(B + '/services', { waitUntil: 'networkidle' });
    const tabs = p.getByRole('tablist', { name: 'التصدير' });
    await tabs.getByRole('tab', { name: /المستندات/ }).click();
    await p.getByText('شهادة منشأ').waitFor();
    await tabs.getByRole('tab', { name: /شروط التسليم/ }).click();
    await p.getByText(/DDP/).waitFor();
  });

  await run('mobile: studio options and extras do not overflow', async (p) => {
    await p.goto(B + '/studio-3d?tab=box', { waitUntil: 'networkidle' });
    const ov = () => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (await ov()) throw new Error('overflow box tab: ' + (await ov()));
    await p.goto(B + '/studio-3d', { waitUntil: 'networkidle' });
    await p.getByTestId('bottle-spec').waitFor();
    if (await ov()) throw new Error('overflow bottle tab: ' + (await ov()));
  }, { viewport: { width: 375, height: 812 } });

  console.log(results.join('\n'));
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})();
