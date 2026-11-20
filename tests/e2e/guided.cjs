// الاستوديو المبسّط: طقم جاهز ← عبوة ← ملصق ← علبة ← مراجعة، والعلبة تتبع العبوة، وفحص التوافق يصلح بضغطة
const { chromium, OUT, url } = require('./lib.cjs');
const B = url('admin');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
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
  const open = async (p, q = '') => { await p.goto(B + '/studio-3d' + q, { waitUntil: 'networkidle' }); await p.getByTestId('guided').waitFor(); };
  const next = (p) => p.getByTestId('guide-next').click();
  const dims = async (p) => (await p.getByTestId('auto-fit-note').textContent()).match(/(\d+)×(\d+)×(\d+)/).slice(1).map(Number);
  const q = (p) => new URL(p.url()).searchParams;

  await run('guided is the default: five steps, a kit gallery of 72 in 12 groups, advanced mode one click away', async (p) => {
    await open(p);
    const steps = await p.locator('[data-step]').evaluateAll((els) => els.map((e) => e.getAttribute('data-step')));
    if (steps.join() !== 'kit,bottle,label,box,review') throw new Error(`steps ${steps}`);
    await p.getByText(/72 طقماً منسجماً/).waitFor();
    if (await p.locator('[data-kit]').count() !== 12) throw new Error('featured should show one kit per group');
    const tabs = await p.getByTestId('kit-step').getByRole('tab').count();
    if (tabs !== 13) throw new Error(`group tabs ${tabs}`);
    let total = 0;
    for (const name of ['كلاسيكي', 'عود وتراث', 'نيش وصيدلية', 'نسائي', 'رجالي', 'عصري وشبابي', 'طبيعي ومستدام', 'هدايا ومواسم', 'سفر وعينات', 'شركات وفنادق', 'بداية اقتصادية', 'إصدارات محدودة']) {
      await p.getByTestId('kit-step').getByRole('tab', { name }).click();
      const n = await p.locator('[data-kit]').count();
      if (n !== 6) throw new Error(`${name}: ${n} kits`);
      total += n;
    }
    if (total !== 72) throw new Error(`total ${total}`);
    // لا خيارات الوضع المتقدم هنا
    if (await p.getByTestId('bottle-spec').count()) throw new Error('advanced spec visible in guided mode');
    await p.getByTestId('mode-switch').getByRole('radio', { name: /متقدم/ }).click();
    await p.getByTestId('bottle-spec').waitFor();
    if (await p.getByTestId('guided').count()) throw new Error('guided still visible');
    await p.reload({ waitUntil: 'networkidle' });
    await p.getByTestId('bottle-spec').waitFor(); // الاختيار محفوظ
    await p.getByTestId('mode-switch').getByRole('radio', { name: /مبسّط/ }).click();
    await p.getByTestId('guided').waitFor();
  });

  await run('a kit applies a whole coherent product; the review is green with price and lead time', async (p) => {
    await open(p);
    await p.getByTestId('kit-step').getByRole('tab', { name: 'عود وتراث' }).click();
    await p.locator('[data-kit="oud-royal"]').click();
    await p.waitForFunction(() => new URL(location.href).searchParams.get('kit') === 'oud-royal');
    const s = q(p);
    if (s.get('b') !== 'B-NOOR' || s.get('c') !== 'C-PYR' || s.get('g') !== 'black') throw new Error(`params ${s}`);
    await p.locator('[data-kit="oud-royal"][aria-checked="true"]').waitFor();
    await p.screenshot({ path: `${OUT}/guided-1-kit.png` });
    await next(p);
    await p.getByTestId('bottle-step').waitFor();
    if ((await p.getByRole('radiogroup', { name: 'حجم العبوة' }).getByRole('radio', { name: '100 مل' }).getAttribute('aria-checked')) !== 'true') throw new Error('size chip');
    await next(p);
    const ls = p.getByTestId('label-step');
    if ((await ls.getByPlaceholder('اسم الدار').inputValue()) !== 'السلطان') throw new Error('brand');
    await next(p);
    const bs = p.getByTestId('box-step');
    if ((await bs.locator('[data-style="neckMagnetic"]').getAttribute('aria-checked')) !== 'true') throw new Error('box style');
    const [L, W, H] = await dims(p);
    if (L < 60 || H < 135) throw new Error(`box dims ${L}x${W}x${H}`);
    await p.screenshot({ path: `${OUT}/guided-4-box.png` });
    await next(p);
    const rv = p.getByTestId('review-step');
    const ready = rv.getByTestId('readiness');
    if ((await ready.getAttribute('data-errors')) !== '0' || (await ready.getAttribute('data-warns')) !== '0') throw new Error('kit not clean');
    await ready.getByText('كل شيء متوافق وجاهز للتصنيع').waitFor();
    const money = async () => Number((await rv.getByTestId('unit-price').textContent()).match(/\d+(\.\d+)?/)[0]);
    const price = await money();
    if (!(price > 5)) throw new Error(`price ${price}`);
    if (!/أسابيع/.test(await rv.getByTestId('lead-time').textContent())) throw new Error('lead time');
    await rv.getByText('ما يحدد الموعد').waitFor();
    // الكمية تغيّر السعر
    await rv.getByRole('radio', { name: '5,000' }).click();
    await p.waitForFunction((old) => Number(document.querySelector('[data-testid="unit-price"]').textContent.match(/\d+(\.\d+)?/)[0]) !== old, price);
    if (!((await money()) < price)) throw new Error('no volume discount');
    await p.screenshot({ path: `${OUT}/guided-5-review.png`, fullPage: true });
  });

  await run('the box follows the bottle: change size or cap and the box refits; the label stays on the body with the right volume', async (p) => {
    await open(p);
    await p.locator('[data-kit="classic-gold"]').click();
    await p.waitForFunction(() => new URL(location.href).searchParams.get('kit') === 'classic-gold');
    await p.locator('[data-step="box"]').click();
    const before = await dims(p);
    await p.locator('[data-step="bottle"]').click();
    await p.getByRole('radiogroup', { name: 'حجم العبوة' }).getByRole('radio', { name: '100 مل' }).click();
    await p.waitForFunction(() => /B-(NOOR|TOWER|FLASK|PILLAR)/.test(new URL(location.href).searchParams.get('b')));
    await p.locator('[data-step="box"]').click();
    const after = await dims(p);
    if (!(after[2] > before[2])) throw new Error(`box did not grow: ${before} → ${after}`);
    // غطاء أطول → علبة أطول
    await p.locator('[data-step="bottle"]').click();
    await p.getByRole('radiogroup', { name: 'الغطاء' }).getByRole('radio', { name: /أسطوانة طويلة/ }).click();
    await p.waitForFunction(() => new URL(location.href).searchParams.get('c') === 'C-TALL');
    await p.locator('[data-step="box"]').click();
    const taller = await dims(p);
    if (!(taller[2] > after[2])) throw new Error(`cap ignored: ${after} → ${taller}`);
    // الملصق يحمل حجم العبوة الجديدة ويبقى داخل الجسم، والمراجعة بلا أخطاء
    await p.locator('[data-step="review"]').click();
    if ((await p.getByTestId('readiness').getAttribute('data-errors')) !== '0') throw new Error('errors after resize');
    const label = await p.evaluate(() => JSON.parse(localStorage.getItem('pp_label_v1') || 'null'));
    // الحفظ مؤجّل 400ms
    await p.waitForTimeout(600);
    const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('pp_label_v1') || 'null'));
    if (!/100\s*ML/i.test((saved ?? label).texts.find((t) => t.id === 'details').text)) throw new Error('label volume not updated');
    // عبوة صغيرة: تُخفى الأغطية التي لا تركب
    await p.locator('[data-step="bottle"]').click();
    await p.getByRole('radiogroup', { name: 'حجم العبوة' }).getByRole('radio', { name: '10 مل' }).click();
    await p.waitForFunction(() => new URL(location.href).searchParams.get('b') === 'B-TRAVEL');
    await p.getByRole('radiogroup', { name: 'الغطاء' }).getByRole('radio', { name: 'غطاء صغير' }).waitFor();
    await p.getByText(/أخفينا \d+ لا تركب على هذا العنق/).waitFor();
    await p.getByRole('radiogroup', { name: 'الغطاء' }).getByRole('radio', { name: 'قرص عريض' }).waitFor({ state: 'detached' });
  });

  await run('compatibility: a mismatch made in advanced mode is flagged and fixed in one click', async (p) => {
    await open(p);
    await p.locator('[data-kit="start-30"]').click();
    await p.waitForFunction(() => new URL(location.href).searchParams.get('kit') === 'start-30');
    await p.waitForFunction(() => JSON.parse(localStorage.getItem('pp_box_v1') || '{}').style === 'ste');
    // نفسد التصميم (والتطبيق مغلق حتى لا يكتب فوق التخزين): علبة صغيرة مثبّتة يدوياً ثم عبوة كبيرة برول أون
    await p.goto(B + '/robots.txt');
    await p.evaluate(() => { const b = JSON.parse(localStorage.getItem('pp_box_v1')); localStorage.setItem('pp_box_v1', JSON.stringify({ ...b, L: 30, W: 30, H: 60, autoFit: false })); });
    await p.goto(B + '/studio-3d?b=B-TOWER&c=C-PYR&pm=rollon&step=review', { waitUntil: 'networkidle' });
    const r = p.getByTestId('review-step').getByTestId('readiness');
    await r.locator('[data-issue="box.tight"]').waitFor();
    await r.locator('[data-issue="pump.rollon"]').waitFor();
    if (Number(await r.getAttribute('data-errors')) < 2) throw new Error('errors not counted');
    if (!(await p.getByTestId('send-request').isDisabled())) throw new Error('send not blocked');
    await p.locator('[data-step="box"] .ri-error-warning-fill').waitFor();
    await p.screenshot({ path: `${OUT}/guided-issues.png`, fullPage: true });
    await r.getByTestId('fix-all').click();
    await p.waitForFunction(() => document.querySelector('[data-testid="review-step"] [data-testid="readiness"]').getAttribute('data-errors') === '0');
    if (q(p).get('pm')) throw new Error('pump not reset');
    if (await p.getByTestId('send-request').isDisabled()) throw new Error('still blocked');
    await p.locator('[data-step="box"]').click();
    const [L, , H] = await dims(p);
    if (L < 40 || H < 130) throw new Error(`not refit ${L} ${H}`);
  });

  await run('label and box steps: name carries to the box, template swap keeps it, no-box path, request carries the design', async (p) => {
    await open(p);
    await p.getByTestId('kit-step').getByRole('tab', { name: 'كلاسيكي' }).click();
    await p.locator('[data-kit="classic-ivory"]').click();
    await p.waitForFunction(() => new URL(location.href).searchParams.get('kit') === 'classic-ivory');
    await p.locator('[data-step="label"]').click();
    const ls = p.getByTestId('label-step');
    await ls.getByPlaceholder('اسم الدار').fill('دار الكاف');
    await ls.getByPlaceholder('اسم العطر').fill('مسك الرياض');
    await ls.locator('[data-template="mono"]').click();
    if ((await ls.getByPlaceholder('اسم الدار').inputValue()) !== 'دار الكاف') throw new Error('template lost the name');
    await ls.getByRole('button', { name: /عرض كل القوالب \(15\)/ }).click();
    if (await ls.locator('[data-template]').count() !== 15) throw new Error('templates');
    // طقم آخر يُبقي الاسم الذي كتبه العميل
    await p.locator('[data-step="kit"]').click();
    await p.getByTestId('kit-step').getByRole('tab', { name: 'كلاسيكي' }).click();
    await p.locator('[data-kit="classic-gold"]').click();
    await p.waitForFunction(() => new URL(location.href).searchParams.get('kit') === 'classic-gold');
    await p.locator('[data-step="label"]').click();
    if ((await p.getByTestId('label-step').getByPlaceholder('اسم الدار').inputValue()) !== 'دار الكاف') throw new Error('kit switch lost the name');
    await p.locator('[data-step="box"]').click();
    const bs = p.getByTestId('box-step');
    await bs.getByRole('button', { name: /عرض كل الأشكال/ }).click();
    await bs.getByTestId('all-styles').getByRole('button', { name: /علبة سداسية الأوجه/ }).click();
    await bs.locator('[data-style="hexagon"][aria-checked="true"]').waitFor();
    await p.waitForTimeout(300);
    const box = await p.evaluate(() => JSON.parse(localStorage.getItem('pp_box_v1')));
    if (box.brand !== 'دار الكاف' || box.style !== 'hexagon' || box.autoFit !== true) throw new Error(`box ${JSON.stringify({ b: box.brand, s: box.style, a: box.autoFit })}`);
    // بلا علبة
    await bs.getByRole('switch', { name: 'أريد علبة' }).click();
    await bs.getByText(/بلا علبة/).waitFor();
    await p.locator('[data-step="review"]').click();
    if (/العلبة:/.test(await p.getByTestId('review-price').textContent())) throw new Error('box priced without a box');
    await p.locator('[data-step="box"]').click();
    await p.getByTestId('box-step').getByRole('switch', { name: 'أريد علبة' }).click();
    await p.getByTestId('auto-fit-note').waitFor();
    await p.locator('[data-step="review"]').click();
    await p.getByTestId('send-request').click();
    await p.waitForURL(/\/start\/C\?from=work/);
    const card = p.getByTestId('work-card');
    await card.waitFor();
    const txt = await card.textContent();
    if (!/دار الكاف/.test(txt) || !/سداسية/.test(txt)) throw new Error(`work card: ${txt.slice(0, 200)}`);
  });

  await run('guided mode on a phone and in English', async (p) => {
    await p.setViewportSize({ width: 390, height: 844 });
    await open(p);
    for (const s of ['kit', 'bottle', 'label', 'box', 'review']) {
      await p.locator(`[data-step="${s}"]`).click();
      await p.waitForTimeout(250);
      const ov = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (ov > 0) throw new Error(`${s} overflow ${ov}`);
    }
    await p.screenshot({ path: `${OUT}/guided-mobile.png`, fullPage: true });
    await p.evaluate(() => localStorage.setItem('pp_lang', 'en'));
    await open(p);
    await p.getByRole('heading', { name: 'Start from a ready kit' }).waitFor();
    await p.locator('[data-step="review"]').click();
    await p.getByRole('heading', { name: 'Review & order' }).waitFor();
    const ov = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (ov > 0) throw new Error(`en overflow ${ov}`);
  });

  console.log(results.join('\n'));
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})();
