/**
 * perfume-dielines — مكتبة توليد قوالب تغليف (Dielines) بارامترية بصيغة SVG
 * كل الأبعاد بالمليمتر. الطبقات: cut (قص) أحمر، fold (طي) أزرق متقطع، glue (غراء) رمادي شفاف.
 * الهندسة مبنية على المواصفات الصناعية العامة (ECMA / FEFCO) — لا تعتمد على أي مصدر محمي.
 *
 * الاستخدام:  const svg = Dielines.generate('ste', { L:50, W:50, H:120 });
 * الأنواع:    ste | rte | sleeve | rigidTray | insert | pillow
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Dielines = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const r = (n) => Math.round(n * 100) / 100;
  const P = (pts) => pts.map(([x, y]) => `${r(x)},${r(y)}`).join(' ');

  // ---------- مُجمِّع SVG ----------
  function Canvas() {
    this.cut = []; this.fold = []; this.glue = []; this.text = [];
  }
  Canvas.prototype.poly  = function (pts, close = true) { this.cut.push(`<path d="M${P(pts).replace(/ /g, ' L')}${close ? ' Z' : ''}"/>`); };
  Canvas.prototype.path  = function (d) { this.cut.push(`<path d="${d}"/>`); };
  Canvas.prototype.circle= function (cx, cy, d) { this.cut.push(`<circle cx="${r(cx)}" cy="${r(cy)}" r="${r(d / 2)}"/>`); };
  Canvas.prototype.line  = function (x1, y1, x2, y2) { this.fold.push(`<line x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}"/>`); };
  Canvas.prototype.curve = function (d) { this.fold.push(`<path d="${d}"/>`); };
  Canvas.prototype.glueArea = function (x, y, w, h) { this.glue.push(`<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}"/>`); };
  Canvas.prototype.label = function (x, y, s, size = 4) { this.text.push(`<text x="${r(x)}" y="${r(y)}" font-size="${size}" text-anchor="middle">${s}</text>`); };
  Canvas.prototype.render = function (w, h, meta) {
    const m = 5; // هامش حول القالب
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${r(w + 2 * m)}mm" height="${r(h + 2 * m)}mm" viewBox="${-m} ${-m} ${r(w + 2 * m)} ${r(h + 2 * m)}" data-dieline='${JSON.stringify(meta)}'>
  <title>${meta.type} ${meta.L || ''}x${meta.W || ''}x${meta.H || ''} mm</title>
  <g id="glue" fill="#999" fill-opacity="0.18" stroke="none">\n    ${this.glue.join('\n    ')}\n  </g>
  <g id="fold" fill="none" stroke="#1a4fd6" stroke-width="0.25" stroke-dasharray="3 2">\n    ${this.fold.join('\n    ')}\n  </g>
  <g id="cut" fill="none" stroke="#d61a1a" stroke-width="0.3">\n    ${this.cut.join('\n    ')}\n  </g>
  <g id="labels" fill="#555" font-family="sans-serif">\n    ${this.text.join('\n    ')}\n  </g>
</svg>`;
  };

  // ---------- أدوات هندسية مشتركة ----------
  // غطاء + لسان (Lid + Tuck) فوق لوح عرضه L عند x، قاعدته y، يتجه للأعلى (dir=-1) أو للأسفل (dir=+1)
  function lidTuck(c, x, y, L, lidH, tk, dir) {
    const s = dir; // -1 up, +1 down
    const pts = [
      [x, y], [x, y + s * lidH],
      [x + 3, y + s * lidH], [x + 3, y + s * (lidH + tk - 4)],
      [x + 7, y + s * (lidH + tk)], [x + L - 7, y + s * (lidH + tk)],
      [x + L - 3, y + s * (lidH + tk - 4)], [x + L - 3, y + s * lidH],
      [x + L, y + s * lidH], [x + L, y],
    ];
    c.line(x, y + s * lidH, x + L, y + s * lidH);          // طية الغطاء/اللسان
    c.line(x, y, x + L, y);                                 // طية الجسم/الغطاء
    // شقّا قفل اللسان (Lock slits)
    c.path(`M${r(x + 3)},${r(y + s * lidH)} l${r(2.5)},${r(s * -1.2)}`);
    c.path(`M${r(x + L - 3)},${r(y + s * lidH)} l${r(-2.5)},${r(s * -1.2)}`);
    return pts;
  }
  // لسان غبار (Dust flap) فوق لوح عرضه W
  function dustFlap(c, x, y, W, df, dir) {
    const s = dir, i = 1, ch = Math.min(6, W * 0.2);
    c.line(x, y, x + W, y);
    return [[x, y], [x + i, y], [x + i, y + s * (df - ch)], [x + i + ch, y + s * df],
            [x + W - i - ch, y + s * df], [x + W - i, y + s * (df - ch)], [x + W - i, y], [x + W, y]];
  }

  // ---------- 1) Straight / Reverse Tuck End (ECMA A20.20.03) ----------
  function tuckEnd(p, reverse) {
    const { L = 50, W = 50, H = 120, t = 0.5, glue = 15 } = p;
    const lidH = W + t, tk = Math.max(12, Math.min(20, W * 0.4)), df = W * 0.85;
    const c = new Canvas();
    const yT = lidH + tk, yB = yT + H;              // أعلى الجسم / أسفل الجسم
    const xs = [0, glue, glue + W, glue + W + L + t, glue + 2 * W + L + 2 * t, glue + 2 * W + 2 * L + 3 * t];
    const totalW = xs[5], totalH = H + 2 * (lidH + tk);
    // أي لوح L يحمل الغطاء؟ 2=الخلفي 4=الأمامي. STE: الاثنان على الأمامي، RTE: علوي خلفي وسفلي أمامي
    const topLidPanel = reverse ? 2 : 4, botLidPanel = 4;
    // المحيط العلوي من اليسار إلى اليمين
    let top = [[0, yT + 3], [2, yT]];
    const panelsW = [W, L + t, W + t, L + t];
    for (let i = 1; i <= 4; i++) {
      const x = xs[i], w = panelsW[i - 1];
      if (i % 2 === 1) top = top.concat(dustFlap(c, x, yT, w, df, -1));
      else if (i === topLidPanel) top = top.concat(lidTuck(c, x, yT, w, lidH, tk, -1));
      else { top.push([x, yT], [x + w, yT]); c.line(x, yT, x + w, yT); }
    }
    let bot = [[totalW, yB], [0 + 2, yB], [0, yB - 3]];
    const botSeq = [];
    for (let i = 4; i >= 1; i--) {
      const x = xs[i], w = panelsW[i - 1];
      let seg;
      if (i % 2 === 1) seg = dustFlap(c, x, yB, w, df, +1);
      else if (i === botLidPanel) seg = lidTuck(c, x, yB, w, lidH, tk, +1);
      else { seg = [[x, yB], [x + w, yB]]; c.line(x, yB, x + w, yB); }
      botSeq.push(...seg.reverse());
    }
    c.poly([...top, [totalW, yT], ...botSeq, [2, yB], [0, yB - 3]]);
    // طيات عمودية بين الألواح
    for (let i = 1; i <= 4; i++) c.line(xs[i], yT, xs[i], yB);
    c.glueArea(0, yT, glue, H);
    const names = ['جانب', reverse ? 'خلف' : 'خلف', 'جانب', 'واجهة'];
    for (let i = 1; i <= 4; i++) c.label(xs[i] + panelsW[i - 1] / 2, yT + H / 2, names[i - 1]);
    return c.render(totalW, totalH, { type: reverse ? 'RTE' : 'STE', L, W, H, t });
  }

  // ---------- 2) Sleeve (غلاف منزلق) ----------
  function sleeve(p) {
    const { L = 52, W = 52, H = 125, t = 0.5, glue = 15 } = p;
    const c = new Canvas();
    const xs = [0, glue, glue + W, glue + W + L + t, glue + 2 * W + L + 2 * t, glue + 2 * W + 2 * L + 3 * t];
    c.poly([[0, 3], [3, 0], [xs[5], 0], [xs[5], H], [3, H], [0, H - 3]]);
    for (let i = 1; i <= 4; i++) c.line(xs[i], 0, xs[i], H);
    c.glueArea(0, 0, glue, H);
    // فتحة إبهام اختيارية على الواجهة
    if (p.thumb !== false) {
      const cx = xs[4] + (L + t) / 2;
      c.path(`M${r(cx - 8)},0 A8,8 0 0 0 ${r(cx + 8)},0`);
    }
    return c.render(xs[5], H, { type: 'SLEEVE', L, W, H, t });
  }

  // ---------- 3) Rigid box tray (قاعدة أو غطاء علبة صلبة، زوايا بألسنة غراء) ----------
  function rigidTray(p) {
    const { L = 60, W = 60, H = 30, clearance = 0 } = p;   // clearance: زيادة للغطاء (مثلاً 2)
    const Li = L + clearance, Wi = W + clearance;
    const c = new Canvas();
    const X0 = H, Y0 = H, X1 = H + Li, Y1 = H + Wi, X2 = X1 + H, Y2 = Y1 + H;
    const g = 1, k = Math.min(3, H * 0.3);
    const pts = [
      [X0, 0], [X1, 0], [X1, Y0],                                   // الجدار العلوي
      [X1 + g, Y0], [X1 + g + k, g], [X2 - g, g], [X2, Y0],          // لسان أعلى-يمين
      [X2, Y1],                                                      // الجدار الأيمن
      [X2 - g, Y2 - g], [X1 + g + k, Y2 - g], [X1 + g, Y1], [X1, Y1],// لسان أسفل-يمين
      [X1, Y2], [X0, Y2], [X0, Y1],                                  // الجدار السفلي
      [X0 - g, Y1], [X0 - g - k, Y2 - g], [g, Y2 - g], [0, Y1],       // لسان أسفل-يسار
      [0, Y0],                                                       // الجدار الأيسر
      [g, g], [X0 - g - k, g], [X0 - g, Y0], [X0, Y0],                // لسان أعلى-يسار
    ];
    c.poly(pts);
    c.line(X0, Y0, X1, Y0); c.line(X1, Y0, X1, Y1); c.line(X1, Y1, X0, Y1); c.line(X0, Y1, X0, Y0);
    c.line(X1 + g, Y0, X2, Y0); c.line(X1 + g, Y1, X2, Y1); c.line(0, Y0, X0 - g, Y0); c.line(0, Y1, X0 - g, Y1);
    [[X1 + g, g, H - g, H - g], [X1 + g, Y1, H - g, H - g], [0, g, H - g, H - g], [0, Y1, H - g, H - g]]
      .forEach(([x, y, w, h]) => c.glueArea(x, y, w, h));
    c.label(X0 + Li / 2, Y0 + Wi / 2, clearance ? 'غطاء' : 'قاعدة');
    return c.render(X2, Y2, { type: clearance ? 'RIGID_LID' : 'RIGID_BASE', L: Li, W: Wi, H });
  }

  // ---------- 4) Insert (منصة داخلية بفتحة لزجاجة العطر) ----------
  function insert(p) {
    const { L = 49, W = 49, H = 20, bottleW = 30, bottleD = 30, shape = 'rect', t = 0.5 } = p;
    const c = new Canvas();
    const foot = Math.max(8, H * 0.6);
    const totalH = 2 * foot + 2 * H + W;
    c.poly([[0, 0], [L, 0], [L, totalH], [0, totalH]]);
    [foot, foot + H, foot + H + W, foot + 2 * H + W].forEach(y => c.line(0, y, L, y));
    const cy = foot + H + W / 2, cx = L / 2;
    if (shape === 'circle') c.circle(cx, cy, bottleW + t);
    else {
      const rr = 2, w = bottleW + t, d = bottleD + t, x = cx - w / 2, y = cy - d / 2;
      c.path(`M${r(x + rr)},${r(y)} h${r(w - 2 * rr)} a${rr},${rr} 0 0 1 ${rr},${rr} v${r(d - 2 * rr)} a${rr},${rr} 0 0 1 -${rr},${rr} h-${r(w - 2 * rr)} a${rr},${rr} 0 0 1 -${rr},-${rr} v-${r(d - 2 * rr)} a${rr},${rr} 0 0 1 ${rr},-${rr} Z`);
    }
    c.label(cx, foot + H / 2, 'جدار'); c.label(cx, foot + H + W - 4, 'منصة', 3.5);
    return c.render(L, totalH, { type: 'INSERT', L, W, H, bottleW, bottleD });
  }

  // ---------- 5) Pillow box (علبة وسادة لعينات العطر) ----------
  function pillow(p) {
    const { Wp = 60, Hp = 110, glue = 12, curve = 0.22 } = p;
    const c = new Canvas();
    const fh = Wp * 0.42;              // ارتفاع لسان الإغلاق
    const dip = Wp * curve;            // عمق القوس
    const yT = fh, yB = fh + Hp, x1 = glue, x2 = glue + Wp, x3 = glue + 2 * Wp;
    const arcTop = (xa, xb, y, h) => `Q${r((xa + xb) / 2)},${r(y - h)} ${r(xb)},${r(y)}`;
    let d = `M0,${r(yT + 2)} L2,${r(yT)} L${r(x1)},${r(yT)} `;
    d += `L${r(x1)},${r(yT - fh + dip)} ${arcTop(x1, x2, yT - fh + dip, -dip)} `;      // قوس اللسان العلوي للوح 1 (يبرز لأعلى)
    d += `L${r(x2)},${r(yT - fh + dip)} ${arcTop(x2, x3, yT - fh + dip, -dip)} `;
    d += `L${r(x3)},${r(yT)} L${r(x3)},${r(yB)} `;
    d += `L${r(x3)},${r(yB + fh - dip)} ${arcTop(x3, x2, yB + fh - dip, dip)} `;
    d += `L${r(x2)},${r(yB + fh - dip)} ${arcTop(x2, x1, yB + fh - dip, dip)} `;
    d += `L${r(x1)},${r(yB)} L2,${r(yB)} L0,${r(yB - 2)} Z`;
    c.path(d);
    // الطيات المقوسة (المميزة لعلبة الوسادة)
    c.curve(`M${r(x1)},${r(yT)} Q${r((x1 + x2) / 2)},${r(yT + dip)} ${r(x2)},${r(yT)}`);
    c.curve(`M${r(x2)},${r(yT)} Q${r((x2 + x3) / 2)},${r(yT + dip)} ${r(x3)},${r(yT)}`);
    c.curve(`M${r(x1)},${r(yB)} Q${r((x1 + x2) / 2)},${r(yB - dip)} ${r(x2)},${r(yB)}`);
    c.curve(`M${r(x2)},${r(yB)} Q${r((x2 + x3) / 2)},${r(yB - dip)} ${r(x3)},${r(yB)}`);
    c.line(x1, yT, x1, yB); c.line(x2, yT, x2, yB); c.line(glue, yT, glue, yB);
    c.glueArea(0, yT, glue, Hp);
    return c.render(x3, Hp + 2 * fh, { type: 'PILLOW', W: Wp, H: Hp });
  }


  // ---------- 6) Window box: علبة Tuck End بنافذة على الواجهة ----------
  function windowBox(p) {
    const svg = tuckEnd(p, false);
    const { L = 50, W = 50, H = 120, t = 0.5, glue = 15 } = p;
    const lidH = W + t, tk = Math.max(12, Math.min(20, W * 0.4));
    const x = glue + 2 * W + L + 2 * t, yT = lidH + tk;                 // موضع الواجهة
    const ww = L * (p.winW || 0.6), wh = H * (p.winH || 0.5), wx = x + (L - ww) / 2, wy = yT + H * 0.25, rr = 3;
    const hole = `<path d="M${r(wx + rr)},${r(wy)} h${r(ww - 2 * rr)} a${rr},${rr} 0 0 1 ${rr},${rr} v${r(wh - 2 * rr)} a${rr},${rr} 0 0 1 -${rr},${rr} h-${r(ww - 2 * rr)} a${rr},${rr} 0 0 1 -${rr},-${rr} v-${r(wh - 2 * rr)} a${rr},${rr} 0 0 1 ${rr},-${rr} Z"/>`;
    return svg.replace('<g id="cut"', `<g id="window-cut" fill="none" stroke="#d61a1a" stroke-width="0.3">${hole}</g>\n  <g id="cut"`).replace('"type":"STE"', '"type":"WINDOW"');
  }

  // ---------- 7) Crash Lock Bottom (قاعدة قفل ذاتي 1-2-3) ----------
  function crashLock(p) {
    const { L = 50, W = 50, H = 120, t = 0.5, glue = 15 } = p;
    const lidH = W + t, tk = Math.max(12, Math.min(20, W * 0.4)), df = W * 0.85;
    const c = new Canvas();
    const yT = lidH + tk, yB = yT + H;
    const xs = [0, glue, glue + W, glue + W + L + t, glue + 2 * W + L + 2 * t, glue + 2 * W + 2 * L + 3 * t];
    const pw = [W, L + t, W + t, L + t];
    const main = W * 0.85, back = W * 0.6, side = W * 0.5;
    const totalW = xs[5], totalH = yB + main + 8;
    let top = [[0, yT + 3], [2, yT]];
    for (let i = 1; i <= 4; i++) { const x = xs[i], w = pw[i - 1];
      if (i % 2 === 1) top = top.concat(dustFlap(c, x, yT, w, df, -1));
      else if (i === 4) top = top.concat(lidTuck(c, x, yT, w, lidH, tk, -1));
      else { top.push([x, yT], [x + w, yT]); c.line(x, yT, x + w, yT); } }
    // القاعدة من اليمين لليسار: واجهة (لوح رئيسي بخطاف)، جانب مائل، خلف (مثلث غراء)، جانب مائل
    const bot = [];
    const x4 = xs[4], w4 = pw[3];                                   // اللوح الرئيسي
    bot.push([x4 + w4, yB], [x4 + w4, yB + main - 6], [x4 + w4 - 6, yB + main], [x4 + w4 / 2 + 6, yB + main], [x4 + w4 / 2 + 6, yB + main + 8], [x4 + w4 / 2 - 6, yB + main + 8], [x4 + w4 / 2 - 6, yB + main], [x4 + 1, yB + main], [x4 + 1, yB + 3], [x4, yB]);
    c.line(x4, yB, x4 + w4, yB); c.line(x4 + 1, yB + 3, x4 + w4 / 2, yB + main); // طية مائلة للقفل
    const x3 = xs[3], w3 = pw[2];                                   // جانب مائل
    bot.push([x3 + w3, yB], [x3 + w3 - 2, yB + side], [x3 + 2, yB + side * 0.4], [x3, yB]); c.line(x3, yB, x3 + w3, yB);
    const x2 = xs[2], w2 = pw[1];                                   // الخلف مع مثلث الغراء
    bot.push([x2 + w2, yB], [x2 + w2, yB + back], [x2 + w2 / 2, yB + back], [x2 + 1, yB + 3], [x2, yB]);
    c.line(x2, yB, x2 + w2, yB); c.line(x2 + 1, yB + 3, x2 + w2 / 2, yB + back); c.glueArea(x2 + w2 / 2, yB + 1, w2 / 2 - 1, back - 1);
    const x1 = xs[1], w1 = pw[0];
    bot.push([x1 + w1, yB], [x1 + w1 - 2, yB + side * 0.4], [x1 + 2, yB + side], [x1, yB]); c.line(x1, yB, x1 + w1, yB);
    c.poly([...top, [totalW, yT], ...bot, [2, yB], [0, yB - 3]]);
    for (let i = 1; i <= 4; i++) c.line(xs[i], yT, xs[i], yB);
    c.glueArea(0, yT, glue, H);
    ['جانب', 'خلف', 'جانب', 'واجهة'].forEach((n, i) => c.label(xs[i + 1] + pw[i] / 2, yT + H / 2, n));
    return c.render(totalW, totalH, { type: 'CRASH_LOCK', L, W, H, t, note: 'هندسة الألسنة المائلة قياسية تقريبية، تُراجع مع المطبعة قبل صنع القالب' });
  }

  // ---------- 8) Hexagon box (علبة سداسية بغطاء مدسوس) ----------
  function hexagon(p) {
    const { S = 30, H = 110, t = 0.5, glue = 12 } = p;
    const c = new Canvas();
    const a = S * Math.sqrt(3) / 2, lidH = 2 * a, tk = 12;
    const yT = lidH + tk, yB = yT + H;
    const xs = [0]; for (let i = 0; i < 6; i++) xs.push(glue + i * (S + t));
    const totalW = glue + 6 * (S + t) - t, totalH = yB + lidH + tk;
    // غطاء سداسي على اللوح الثالث (أعلى) والرابع (أسفل)
    const hexLid = (x, y, dir) => { const s = dir;
      c.line(x, y, x + S, y); c.line(x - S / 2, y + s * a, x + S * 1.5, y + s * a); c.line(x, y + s * lidH, x + S, y + s * lidH);
      return [[x, y], [x - S / 2, y + s * a], [x, y + s * lidH], [x + 2, y + s * lidH], [x + 2, y + s * (lidH + tk - 3)], [x + 5, y + s * (lidH + tk)],
              [x + S - 5, y + s * (lidH + tk)], [x + S - 2, y + s * (lidH + tk - 3)], [x + S - 2, y + s * lidH], [x + S, y + s * lidH], [x + S * 1.5, y + s * a], [x + S, y]]; };
    let top = [[0, yT + 3], [2, yT], [xs[1], yT]];
    for (let i = 1; i <= 6; i++) { const x = xs[i]; if (i === 3) top = top.concat(hexLid(x, yT, -1)); else { top.push([x, yT], [x + S, yT]); c.line(x, yT, x + S, yT); } }
    let bot = [];
    for (let i = 6; i >= 1; i--) { const x = xs[i]; if (i === 4) bot = bot.concat(hexLid(x, yB, +1).reverse()); else { bot.push([x + S, yB], [x, yB]); c.line(x, yB, x + S, yB); } }
    c.poly([...top, [totalW, yT], [totalW, yB], ...bot, [2, yB], [0, yB - 3]]);
    for (let i = 1; i <= 6; i++) c.line(xs[i], yT, xs[i], yB);
    c.glueArea(0, yT, glue, H);
    return c.render(totalW + S / 2, totalH, { type: 'HEXAGON', S, H, t });
  }

  // ---------- 9) Mailer box FEFCO 0427 (مبسّط) ----------
  function mailer(p) {
    const { L = 120, W = 80, H = 40, t = 1.5 } = p;
    const c = new Canvas();
    const X0 = 2 * H + 2, Y0 = H + W + t + H;                    // أصل القاعدة
    const X1 = X0 + L, Y1 = Y0 + W, totalW = X1 + 2 * H + 2, totalH = Y1 + H + 2;
    const pts = [];
    // الجدار الخلفي + الغطاء + لسان الغطاء + أذنا الغطاء (أعلى القاعدة)
    pts.push([X0, Y0], [X0, Y0 - H], [X0 - (H - t), Y0 - H], [X0 - (H - t), Y0 - H - (W + t) + 4], [X0 - (H - t) + 4, Y0 - H - (W + t)],
             [X0, Y0 - H - (W + t)], [X0, Y0 - H - (W + t) - (H - t) + 3], [X0 + 3, Y0 - H - (W + t) - (H - t)],
             [X1 - 3, Y0 - H - (W + t) - (H - t)], [X1, Y0 - H - (W + t) - (H - t) + 3], [X1, Y0 - H - (W + t)],
             [X1 + (H - t) - 4, Y0 - H - (W + t)], [X1 + (H - t), Y0 - H - (W + t) + 4], [X1 + (H - t), Y0 - H], [X1, Y0 - H], [X1, Y0]);
    c.line(X0, Y0, X1, Y0); c.line(X0, Y0 - H, X1, Y0 - H); c.line(X0, Y0 - H - (W + t), X1, Y0 - H - (W + t));
    c.line(X0, Y0 - H, X0, Y0 - H - (W + t)); c.line(X1, Y0 - H, X1, Y0 - H - (W + t));
    // الجدار الأيمن + ألسنة الغبار + الجدار الداخلي
    pts.push([X1 + 1, Y0], [X1 + 1, Y0 - (H - 2) + 3], [X1 + 4, Y0 - (H - 2)], [X1 + H - 2, Y0 - (H - 2)], [X1 + H, Y0],
             [X1 + 2 * H - 2, Y0 + 2], [X1 + 2 * H - 2, Y0 + W * 0.3], [X1 + 2 * H + 2, Y0 + W * 0.3 + 3], [X1 + 2 * H + 2, Y1 - W * 0.3 - 3], [X1 + 2 * H - 2, Y1 - W * 0.3], [X1 + 2 * H - 2, Y1 - 2],
             [X1 + H, Y1], [X1 + H - 2, Y1 + (H - 2)], [X1 + 4, Y1 + (H - 2)], [X1 + 1, Y1 + (H - 2) - 3], [X1 + 1, Y1]);
    c.line(X1, Y0, X1, Y1); c.line(X1 + H, Y0, X1 + H, Y1); c.line(X1 + 1, Y0, X1 + H, Y0); c.line(X1 + 1, Y1, X1 + H, Y1);
    // الجدار الأمامي (أسفل القاعدة)
    pts.push([X1, Y1], [X1, Y1 + H - 3], [X1 - 3, Y1 + H], [X0 + 3, Y1 + H], [X0, Y1 + H - 3], [X0, Y1]);
    c.line(X0, Y1, X1, Y1);
    // الجدار الأيسر (مرآة الأيمن)
    pts.push([X0 - 1, Y1], [X0 - 1, Y1 + (H - 2) - 3], [X0 - 4, Y1 + (H - 2)], [X0 - H + 2, Y1 + (H - 2)], [X0 - H, Y1],
             [X0 - 2 * H + 2, Y1 - 2], [X0 - 2 * H + 2, Y1 - W * 0.3], [X0 - 2 * H - 2, Y1 - W * 0.3 - 3], [X0 - 2 * H - 2, Y0 + W * 0.3 + 3], [X0 - 2 * H + 2, Y0 + W * 0.3], [X0 - 2 * H + 2, Y0 + 2],
             [X0 - H, Y0], [X0 - H + 2, Y0 - (H - 2)], [X0 - 4, Y0 - (H - 2)], [X0 - 1, Y0 - (H - 2) + 3], [X0 - 1, Y0]);
    c.line(X0, Y0, X0, Y1); c.line(X0 - H, Y0, X0 - H, Y1); c.line(X0 - 1, Y0, X0 - H, Y0); c.line(X0 - 1, Y1, X0 - H, Y1);
    c.poly(pts);
    c.label(X0 + L / 2, Y0 + W / 2, 'قاعدة'); c.label(X0 + L / 2, Y0 - H - (W + t) / 2, 'غطاء');
    return c.render(totalW + 2, totalH + H, { type: 'MAILER_0427', L, W, H, t });
  }

  // ---------- 10) Drawer box: صينية + غلاف في ورقة واحدة ----------
  function drawer(p) {
    const { L = 60, W = 60, H = 30, t = 0.5, glue = 15 } = p;
    const a = rigidTray({ L, W, H }), b = sleeve({ L: W + 2 * t + 1, W: H + 2 * t + 1, H: L + 2, t, glue });
    const dim = (s) => s.match(/viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/).slice(1).map(Number);
    const [aw, ah] = dim(a), [bw, bh] = dim(b);
    const inner = (s) => s.replace(/^[\s\S]*?<title>[^<]*<\/title>/, '').replace(/<\/svg>\s*$/, '');
    const Wt = aw + bw + 10, Ht = Math.max(ah, bh);
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${Wt}mm" height="${Ht}mm" viewBox="0 0 ${Wt} ${Ht}" data-dieline='{"type":"DRAWER","L":${L},"W":${W},"H":${H}}'>\n<g transform="translate(5,5)">${inner(a)}</g>\n<g transform="translate(${aw + 15},5)">${inner(b)}</g>\n</svg>`;
  }

  // ---------- مقاسات جاهزة لمشروع العطور (أبعاد داخلية بالمليمتر) ----------
  const PRESETS = {
    vial_2ml:    { label: 'عينة 2 مل (Vial)',        ste: { L: 20, W: 20, H: 65 },   pillow: { Wp: 45, Hp: 85 } },
    travel_10ml: { label: 'ترافل 10 مل',             ste: { L: 28, W: 28, H: 95 },   sleeve: { L: 30, W: 30, H: 60 } },
    edp_30ml:    { label: 'EDP 30 مل',               ste: { L: 42, W: 42, H: 105 },  insert: { L: 41, W: 41, H: 15, bottleW: 32, bottleD: 32 } },
    edp_50ml:    { label: 'EDP 50 مل',               ste: { L: 52, W: 52, H: 125 },  rigidTray: { L: 60, W: 60, H: 35 }, insert: { L: 59, W: 59, H: 22, bottleW: 42, bottleD: 42 } },
    edp_100ml:   { label: 'EDP 100 مل',              ste: { L: 62, W: 62, H: 150 },  rigidTray: { L: 70, W: 70, H: 40 } },
    discovery_5: { label: 'طقم اكتشاف 5 عينات',      rigidTray: { L: 120, W: 60, H: 25 }, insert: { L: 119, W: 59, H: 15, bottleW: 100, bottleD: 20 } },
    oud_oil_6ml: { label: 'دهن عود 6 مل (رول أون)',   ste: { L: 24, W: 24, H: 90 },   sleeve: { L: 26, W: 26, H: 50 } },
    gift_set:    { label: 'طقم هدايا (عطر + دهن)',     mailer: { L: 160, W: 110, H: 60, t: 1.5 }, drawer: { L: 150, W: 100, H: 45 } },
    oud_hex_50:  { label: 'عود فاخر 50 مل سداسي',      hexagon: { S: 32, H: 130 }, window: { L: 52, W: 52, H: 125 } },
  };

  const GENERATORS = {
    ste:       (p) => tuckEnd(p, false),
    rte:       (p) => tuckEnd(p, true),
    sleeve,
    rigidTray,
    rigidLid:  (p) => rigidTray({ ...p, clearance: p.clearance ?? 2.5 }),
    insert,
    pillow,
    window: windowBox,
    crashLock,
    hexagon,
    mailer,
    drawer,
  };
  const TYPES = {
    ste: 'Straight Tuck End — العلبة القياسية للعطور',
    rte: 'Reverse Tuck End — لسانان متعاكسان (أسرع تعبئة)',
    sleeve: 'Sleeve — غلاف منزلق فوق علبة داخلية',
    rigidTray: 'Rigid Base — قاعدة علبة صلبة فاخرة',
    rigidLid: 'Rigid Lid — غطاء العلبة الصلبة (مع خلوص)',
    insert: 'Insert — منصة داخلية بفتحة الزجاجة',
    pillow: 'Pillow Box — علبة وسادة للعينات والهدايا',
    window: 'Window Box — علبة بنافذة عرض على الواجهة',
    crashLock: 'Crash Lock Bottom — قاعدة قفل ذاتي للتعبئة السريعة',
    hexagon: 'Hexagon — علبة سداسية فاخرة',
    mailer: 'Mailer FEFCO 0427 — علبة شحن/هدايا بغطاء',
    drawer: 'Drawer — علبة درج (صينية + غلاف)',
  };

  function generate(type, params = {}) {
    if (!GENERATORS[type]) throw new Error('نوع غير معروف: ' + type + ' — المتاح: ' + Object.keys(GENERATORS).join(', '));
    return GENERATORS[type](params);
  }
  return { generate, TYPES, PRESETS };
});
