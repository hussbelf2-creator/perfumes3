// مشترك لاختبارات المتصفح: Playwright، مجلد اللقطات لكل ملف، روابط النسخ الثلاث، ومجلد الملفات الثابتة
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const name = path.basename(require.main.filename, '.cjs');
const OUT = path.join(__dirname, '.out', name);
fs.mkdirSync(OUT, { recursive: true });

// site: الموقع العادي · pay: بمفتاح مويسر تجريبي · admin: بدخول المدير التجريبي
const URLS = {
  site: process.env.E2E_SITE || 'http://localhost:4173',
  pay: process.env.E2E_PAY || 'http://localhost:4174',
  admin: process.env.E2E_ADMIN || 'http://localhost:4177',
};
const url = (k) => URLS[k];

// الاستوديو له وضعان: الاختبارات المكتوبة قبل الوضع المبسّط تفحص «المتقدم» (كل الخيارات)،
// فنثبّته في كل سياق جديد. الاختبارات التي تفحص المبسّط تمرّر E2E_STUDIO=easy أو تُسمّى guided.
if (name !== 'guided' && process.env.E2E_STUDIO !== 'easy') {
  const pin = async (ctx) => {
    await ctx.addInitScript(() => { try { if (!localStorage.getItem('pp_studio_mode')) localStorage.setItem('pp_studio_mode', 'pro'); } catch {} });
    return ctx;
  };
  const launch = chromium.launch.bind(chromium);
  chromium.launch = async (...a) => {
    const b = await launch(...a);
    const newContext = b.newContext.bind(b);
    b.newContext = async (...x) => pin(await newContext(...x));
    const newPage = b.newPage.bind(b);
    b.newPage = async (...x) => { const c = await pin(await newContext(...x)); return c.newPage(); };
    void newPage;
    return b;
  };
}
const FIX = path.join(__dirname, '..', 'fixtures', 'e2e');

module.exports = { chromium, OUT, url, FIX };
