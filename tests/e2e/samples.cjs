// العينات المسمّاة: العطّار يسمّي كل عينة بمكوّناتها، يطبع ورقة برمز QR، والعميل يؤكد عنوانه وموقعه ثم يقبل أو يرفض كل عينة باسمها.
const { chromium, OUT, url } = require('./lib.cjs');
const B = url('admin');
(async () => {
  const browser = await chromium.launch();
  const results = [], errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, geolocation: { latitude: 24.7136, longitude: 46.6753 }, permissions: ['geolocation'] });
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
  };
  const client = async (p) => {
    await p.goto(B + '/auth', { waitUntil: 'networkidle' });
    await p.evaluate(() => localStorage.removeItem('pp_session_email'));
    await p.goto(B + '/auth', { waitUntil: 'networkidle' });
    await p.getByRole('button', { name: /دخول كعميل تجريبي/ }).click();
    await p.waitForURL((u) => !u.pathname.startsWith('/auth'));
  };
  const signOut = async (p) => { await p.goto(B + '/', { waitUntil: 'networkidle' }); await p.evaluate(() => localStorage.removeItem('pp_session_email')); };
  const order = (p, ref) => p.evaluate((r) => JSON.parse(localStorage.getItem('pp_kits_v1')).orders.find((o) => o.ref === r), ref);
  let ref = '', token = '';

  await run('perfumer creates a round: names each sample and lists its ingredients', async (p) => {
    await as(p, 'production');
    await p.evaluate(() => localStorage.removeItem('pp_kits_v1'));
    await p.goto(B + '/admin/kits', { waitUntil: 'networkidle' });
    await p.getByTestId('new-round-open').click();
    const f = p.getByTestId('new-round');
    await f.waitFor();
    if (!(await f.getByTestId('round-create').isDisabled())) throw new Error('create enabled with no email or names');
    await f.getByTestId('round-email').fill('client@demo.local');
    await f.getByLabel('اسم المستلم').fill('عميل تجريبي');
    await f.getByLabel(/ملاحظة العطّار للعميل/).fill('جولة أولى على اتجاه العود');
    const rows = f.getByTestId('sample-row');
    if (await rows.count() !== 2) throw new Error('two blank samples expected');
    await rows.nth(0).getByTestId('sample-name').fill('عود الفجر');
    await rows.nth(0).getByLabel('التركيز والحجم').fill('EDP 20% · 5 مل');
    await rows.nth(0).getByTestId('add-ingredient').click();
    await rows.nth(0).getByLabel('المكوّن', { exact: true }).fill('عود كمبودي');
    await rows.nth(0).getByLabel('الكمية', { exact: true }).fill('4.5');
    await rows.nth(0).getByTestId('add-ingredient').click();
    await rows.nth(0).getByLabel('المكوّن', { exact: true }).nth(1).fill('كحول عطري');
    await rows.nth(0).getByLabel('الكمية', { exact: true }).nth(1).fill('98');
    await rows.nth(0).getByTestId('sample-sum').getByText(/يتجاوز 100/).waitFor();
    await rows.nth(0).getByLabel('الكمية', { exact: true }).nth(1).fill('80');
    if (await rows.nth(0).getByTestId('sample-sum').getByText(/يتجاوز/).count()) throw new Error('over-100 warning stuck');
    await rows.nth(1).getByTestId('sample-name').fill('ورد المساء');
    await f.getByTestId('add-sample').click();
    if ((await rows.nth(2).getByLabel('حرف العبوة').inputValue()) !== 'C') throw new Error('third vial letter');
    await rows.nth(2).getByTestId('sample-name').fill('مسك أبيض');
    // هذه الجولة بلا مشروع: نختار الإفصاح الكامل لتظهر الكميات على الورقة (الافتراضي يحجبها حتى توقيع العقد)
    await f.getByTestId('round-disclosure').locator('select').selectOption('full');
    await f.getByTestId('round-create').click();
    await toast(p, /أُنشئت جولة العينات/);
    const d = p.getByTestId('kit-detail');
    await d.waitFor();
    ref = (await d.locator('p.font-mono').first().textContent()).trim();
    if (!/^SMP-[A-Z0-9]{6}$/.test(ref)) throw new Error(`ref ${ref}`);
    const o = await order(p, ref);
    token = o.token;
    if (!/^[0-9a-f]{32}$/.test(token)) throw new Error('token');
    if (o.kind !== 'round' || o.samples.length !== 3 || o.samples[0].ingredients.length !== 2 || o.samples[0].ingredients[0].amount !== 4.5) throw new Error('samples not saved');
    if (o.samples.some((s) => s.decision)) throw new Error('new round carries decisions');
    await d.getByTestId('kit-address').getByText('لم يؤكده العميل بعد').waitFor();
    const href = await d.getByTestId('kit-print-sheet').getAttribute('href');
    if (!href.includes(`/kit/${ref}/sheet?k=${token}`)) throw new Error(`sheet link ${href}`);
    await p.screenshot({ path: `${OUT}/admin-round.png`, fullPage: true });
  });

  await run('printed sheet: every vial with its ingredients, and a QR that opens the client page', async (p) => {
    await signOut(p);
    await p.goto(B + `/kit/${ref}/sheet?k=${token}`, { waitUntil: 'networkidle' });
    const doc = p.getByTestId('sheet-doc');
    await doc.waitFor();
    if (await doc.getByTestId('sheet-sample').count() !== 3) throw new Error('three samples on the sheet');
    const first = doc.getByTestId('sheet-sample').first();
    const text = await first.textContent();
    for (const s of ['عود الفجر', 'EDP 20%', 'عود كمبودي', '4.5', 'كحول عطري', '80']) if (!text.includes(s)) throw new Error(`sheet missing ${s}`);
    const qr = await doc.locator('svg[data-qr]').getAttribute('data-qr');
    if (!qr.endsWith(`/kit/${ref}?k=${token}`) || !/^https?:\/\//.test(qr)) throw new Error(`qr ${qr}`);
    if ((await doc.locator('svg[data-qr] path').getAttribute('d')).length < 500) throw new Error('qr not drawn');
    if (/@demo\.local|0551234567/.test(await doc.textContent())) throw new Error('sheet leaks email or phone');
    await doc.getByText('جولة أولى على اتجاه العود').waitFor();
    await p.getByTestId('sheet-print').waitFor();
    await p.screenshot({ path: `${OUT}/sheet.png`, fullPage: true });
    await p.emulateMedia({ media: 'print' });
    if (await p.getByTestId('sheet-print').isVisible()) throw new Error('print button visible in print');
    await p.emulateMedia({ media: 'screen' });
    await p.goto(B + `/kit/${ref}/sheet?k=${'0'.repeat(32)}`, { waitUntil: 'networkidle' });
    await p.getByTestId('sheet-missing').waitFor();
  });

  await run('client opens the QR link without signing in and confirms the delivery location', async (p) => {
    await signOut(p);
    await p.goto(B + `/kit/${ref}`, { waitUntil: 'networkidle' });
    await p.getByTestId('kit-track').waitFor();
    if (await p.getByTestId('sample-decisions').count() || await p.getByTestId('address-confirm').count()) throw new Error('samples or address shown without the token');
    await p.goto(B + `/kit/${ref}?k=${token}`, { waitUntil: 'networkidle' });
    const next = p.getByTestId('kit-next');
    await next.waitFor();
    if ((await next.getAttribute('data-next')) !== 'address') throw new Error('first step should be the address');
    await p.getByTestId('decisions-wait').waitFor();
    const f = p.getByTestId('address-confirm');
    if (!(await f.getByTestId('address-save').isDisabled())) throw new Error('save enabled without a city');
    await f.locator('#kit-addr-city').fill('Riyadh');
    await f.locator('#kit-addr-district').fill('الياسمين');
    await f.locator('#kit-addr-street').fill('أنس بن مالك');
    await f.locator('#kit-addr-building').fill('7421');
    await f.locator('#kit-addr-short').fill('rrrd2929');
    // رابط خرائط بلا إحداثيات يُرفض برسالة، ثم رابط صحيح
    await f.getByTestId('maps-link').fill('https://maps.app.goo.gl/abc');
    await f.getByTestId('maps-link-apply').click();
    await f.getByText(/لم نجد إحداثيات/).waitFor();
    await f.getByTestId('maps-link').fill('https://www.google.com/maps/place/X/@24.8301,46.6601,17z');
    await f.getByTestId('maps-link-apply').click();
    await f.getByTestId('address-coords').getByText('24.8301, 46.6601').waitFor();
    // «استخدم موقعي الحالي» يقرأ موقع المتصفح
    await f.getByTestId('use-my-location').click();
    await f.getByTestId('address-coords').getByText('24.7136, 46.6753').waitFor();
    await f.getByTestId('address-save').click();
    await p.getByTestId('kit-notice').getByText(/حفظنا عنوان التسليم/).waitFor();
    await p.getByTestId('address-confirmed').waitFor();
    const sum = await p.getByTestId('address-summary').textContent();
    for (const s of ['7421 أنس بن مالك', 'الياسمين', 'Riyadh', 'RRRD2929']) if (!sum.includes(s)) throw new Error(`summary missing ${s}`);
    const o = await order(p, ref);
    if (o.lat !== 24.7136 || o.lng !== 46.6753 || !o.addressConfirmedAt || o.shortAddress !== 'RRRD2929') throw new Error('address not stored');
    if (await p.getByTestId('kit-next').count()) throw new Error('next-step banner should clear while waiting for shipping');
    await p.screenshot({ path: `${OUT}/client-address.png`, fullPage: true });
  });

  await run('perfumer sees the confirmed location, ships, and the address locks', async (p) => {
    await as(p, 'production');
    await p.goto(B + '/admin/kits', { waitUntil: 'networkidle' });
    await p.getByTestId('kits-table').locator('tbody tr').filter({ hasText: ref }).first().click();
    const d = p.getByTestId('kit-detail');
    await d.getByTestId('kit-address-confirmed').waitFor();
    const map = await d.getByTestId('kit-address').getByRole('link', { name: /الموقع على الخريطة/ }).getAttribute('href');
    if (!map.includes('24.7136,46.6753')) throw new Error(`map link ${map}`);
    await d.getByRole('radio', { name: 'شُحن' }).click();
    await d.getByRole('combobox', { name: /شركة الشحن/ }).selectOption('SMSA');
    await d.getByLabel('رقم التتبع').fill('290555000111');
    await d.getByRole('button', { name: 'حفظ' }).click();
    await toast(p, /سُجِّل الشحن/);
    await signOut(p);
    await p.goto(B + `/kit/${ref}?k=${token}`, { waitUntil: 'networkidle' });
    if ((await p.getByTestId('kit-next').getAttribute('data-next')) !== 'decide') throw new Error('next step should be rating');
    if (await p.getByTestId('address-edit').count()) throw new Error('address still editable after shipping');
    await p.getByText(/خرجت الشحنة، فلا يمكن تغيير العنوان/).waitFor();
  });

  await run('client accepts and rejects each sample by name; the perfumer sees it and gets a task', async (p) => {
    await signOut(p);
    await p.goto(B + `/kit/${ref}?k=${token}`, { waitUntil: 'networkidle' });
    const f = p.getByTestId('sample-decisions');
    const cards = f.getByTestId('sample-card');
    if (await cards.count() !== 3) throw new Error('three sample cards');
    if (!(await f.getByTestId('decisions-submit').isDisabled())) throw new Error('submit enabled with nothing rated');
    await cards.nth(0).getByText('المكوّنات والكميات (2)').click();
    await cards.nth(0).getByTestId('sample-ingredients').getByText('عود كمبودي').waitFor();
    await cards.filter({ hasText: 'عود الفجر' }).getByTestId('accept').click();
    await cards.filter({ hasText: 'عود الفجر' }).getByTestId('sample-comment').fill('هذه الأقرب لما أريد');
    await cards.filter({ hasText: 'ورد المساء' }).getByTestId('reject').click();
    await cards.filter({ hasText: 'ورد المساء' }).getByTestId('sample-comment').fill('حلوة أكثر من اللازم بعد الساعة الأولى');
    await f.getByText('قيّمتَ 2 من 3').waitFor();
    await p.screenshot({ path: `${OUT}/client-rating.png`, fullPage: true });
    await f.getByTestId('decisions-submit').click();
    await p.getByTestId('kit-notice').getByText(/وصل تقييمك للعطّار/).waitFor();
    await p.getByTestId('decisions-done').getByText(/1 مقبولة و1 مرفوضة/).waitFor();
    if ((await p.getByTestId('kit-next').getAttribute('data-next')) !== 'done') throw new Error('banner should say done');
    if ((await p.getByTestId('kit-track').locator('[data-status]').first().getAttribute('data-status')) !== 'delivered') throw new Error('rating should mark it delivered');
    const o = await order(p, ref);
    if (o.samples[0].decision !== 'accepted' || o.samples[1].decision !== 'rejected' || o.samples[2].decision || !o.decidedAt) throw new Error('decisions not stored');
    // العطّار: الجدول يلخّص، والتفاصيل تعرض قرار كل اسم وتعليقه، والتعديل لا يمس القرار
    await as(p, 'production');
    await p.goto(B + '/admin/kits', { waitUntil: 'networkidle' });
    const row = p.getByTestId('kits-table').locator('tbody tr').filter({ hasText: ref }).first();
    const cell = (await row.getByTestId('kit-row-samples').textContent()).replace(/\s+/g, ' ');
    if (!/✓ 1 · ✗ 1/.test(cell)) throw new Error(`row summary ${cell}`);
    await row.click();
    const d = p.getByTestId('kit-detail');
    await d.getByText(/قيّمها العميل: 1 مقبولة، 1 مرفوضة، 1 بلا رأي/).waitFor();
    const verdicts = d.getByTestId('sample-verdict');
    if (await verdicts.count() !== 2) throw new Error('two verdicts');
    await verdicts.nth(1).getByText('حلوة أكثر من اللازم').waitFor();
    if (!(await verdicts.nth(1).locator('[data-decision="rejected"]').count())) throw new Error('rejected badge');
    await d.getByTestId('sample-row').nth(1).getByTestId('sample-name').fill('ورد المساء · أخف');
    await d.getByRole('button', { name: 'حفظ' }).click();
    await toast(p, /حُفظت الشحنة/);
    const o2 = await order(p, ref);
    if (o2.samples[1].name !== 'ورد المساء · أخف' || o2.samples[1].decision !== 'rejected' || o2.token !== token) throw new Error('edit touched the decision or token');
    await p.goto(B + '/admin/tasks', { waitUntil: 'networkidle' });
    await p.getByRole('tab', { name: 'كل الفريق' }).click();
    await p.getByText(new RegExp(`راجع تقييم العميل لعينات ${ref} \\(مقبول 1، مرفوض 1\\)`)).first().waitFor();
    await p.goto(B + '/admin/kits', { waitUntil: 'networkidle' });
    await p.getByTestId('kits-table').locator('tbody tr').filter({ hasText: ref }).first().click();
    await p.getByTestId('kit-detail').waitFor();
    await p.screenshot({ path: `${OUT}/admin-verdicts.png`, fullPage: true });
  });

  await run('client account: «عيناتي» lists rounds with the step waiting on the client', async (p) => {
    await client(p);
    await p.goto(B + '/account/samples', { waitUntil: 'networkidle' });
    await p.getByTestId('samples-list').waitFor();
    const mine = p.getByTestId('kit-card').filter({ hasText: ref });
    if ((await mine.getAttribute('data-next')) !== 'done') throw new Error('rated round should read done');
    await mine.getByText('عود الفجر').waitFor();
    if (!(await mine.locator('[data-decision="accepted"]').count()) || !(await mine.locator('[data-decision="rejected"]').count())) throw new Error('decisions on the card');
    const demo = p.getByTestId('kit-card').filter({ hasText: 'SMP-DEMO01' });
    if ((await demo.getAttribute('data-next')) !== 'address') throw new Error('demo round waits for the address');
    await p.getByTestId('samples-todo').waitFor();
    const badge = await p.getByRole('navigation', { name: 'حسابي' }).first().getByRole('link', { name: /عيناتي/ }).textContent();
    if (!/\d/.test(badge)) throw new Error('nav badge missing');
    const kit = p.getByTestId('kit-card').filter({ hasText: 'KIT-DEMO01' });
    if ((await kit.getAttribute('data-next')) !== 'decide') throw new Error('shipped demo kit waits for rating');
    await p.screenshot({ path: `${OUT}/account-samples.png`, fullPage: true });
    await demo.getByTestId('kit-card-cta').click();
    await p.waitForURL(/\/kit\/SMP-DEMO01\?k=/);
    await p.getByTestId('address-confirm').waitFor();
    await p.goto(B + '/account', { waitUntil: 'networkidle' });
    await p.getByTestId('my-kits').getByRole('link', { name: 'كل العينات' }).waitFor();
  });

  await run('settings: the client edits the profile and saves delivery addresses with one default', async (p) => {
    await client(p);
    await p.goto(B + '/account/settings', { waitUntil: 'networkidle' });
    const pf = p.getByTestId('profile-form');
    if (!(await pf.getByTestId('profile-save').isDisabled())) throw new Error('save enabled with no change');
    await pf.getByTestId('profile-phone').fill('0559998877');
    await pf.getByTestId('profile-save').click();
    await p.getByTestId('settings-notice').getByText(/حُفظت بياناتك/).waitFor();
    await p.reload({ waitUntil: 'networkidle' });
    if ((await p.getByTestId('profile-phone').inputValue()) !== '0559998877') throw new Error('phone not persisted');
    await p.getByTestId('addresses-empty').waitFor();
    const add = async (label, city, makeDefault) => {
      await p.getByTestId('address-add').click();
      const e = p.getByTestId('address-editor');
      await e.getByTestId('address-label').fill(label);
      await e.locator('#saved-addr-city').fill(city);
      await e.getByTestId('use-my-location').click();
      await e.getByTestId('address-coords').waitFor();
      if (makeDefault) await e.getByRole('checkbox').check();
      await e.getByTestId('address-editor-save').click();
      await p.getByTestId('settings-notice').getByText(/حُفظ العنوان/).waitFor();
    };
    await add('المكتب', 'Riyadh', false);
    await add('المستودع', 'Jeddah', true);
    const items = p.getByTestId('address-item');
    if (await items.count() !== 2) throw new Error('two addresses');
    if (await p.getByTestId('address-default').count() !== 1) throw new Error('exactly one default');
    if (!(await items.first().textContent()).includes('المستودع')) throw new Error('default listed first');
    await items.nth(1).getByRole('button', { name: 'اجعله الافتراضي' }).click();
    await p.getByTestId('settings-notice').getByText(/صار عنوانك الافتراضي/).waitFor();
    if (!(await p.getByTestId('address-item').first().textContent()).includes('المكتب')) throw new Error('default did not switch');
    await p.getByTestId('address-item').nth(1).getByTestId('address-item-delete').click();
    await p.getByTestId('settings-notice').getByText(/حُذف العنوان/).waitFor();
    if (await p.getByTestId('address-item').count() !== 1) throw new Error('delete failed');
    await p.screenshot({ path: `${OUT}/account-settings.png`, fullPage: true });
    // العنوان المحفوظ يُختار بنقرة عند تأكيد شحنة
    await p.goto(B + '/kit/SMP-DEMO01?k=demo0000demo0000demo0000demo0002', { waitUntil: 'networkidle' });
    const f = p.getByTestId('address-confirm');
    await f.getByTestId('saved-address').filter({ hasText: 'المكتب' }).click();
    if ((await f.locator('#kit-addr-city').inputValue()) !== 'Riyadh') throw new Error('saved address not applied');
    await f.getByTestId('address-coords').getByText('24.7136, 46.6753').waitFor();
    await f.getByTestId('address-save').click();
    await p.getByTestId('address-confirmed').waitFor();
  });

  await run('mobile: the client page and the sheet fit a phone without sideways scroll', async (p) => {
    await signOut(p);
    await p.setViewportSize({ width: 390, height: 844 });
    for (const path of [`/kit/${ref}?k=${token}`, `/kit/${ref}/sheet?k=${token}`, '/kit/SMP-DEMO01?k=demo0000demo0000demo0000demo0002']) {
      await p.goto(B + path, { waitUntil: 'networkidle' });
      const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (over > 1) throw new Error(`${path} overflows by ${over}px`);
    }
    await p.screenshot({ path: `${OUT}/mobile-client.png`, fullPage: true });
  });

  console.log(results.join('\n'));
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})();
