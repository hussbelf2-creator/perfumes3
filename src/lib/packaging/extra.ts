import type { Model3D, Panel3D } from "./index";

// هياكل إضافية خاصة بالمشروع تكمّل المكتبة المنقولة (dielines/models3d) بالصيغة نفسها:
// قالب SVG بالمليمتر بطبقات cut/fold/glue وبياناته في data-dieline، وشجرة ألواح للمعاينة المجسّمة.
// الهندسة قياسية عامة (ECMA/FEFCO) ولا تلمس ملفي المكتبة الأصليين.

type P = Record<string, number>;
const r = (n: number) => Math.round(n * 100) / 100;
const pts = (list: [number, number][]) => list.map(([x, y]) => `${r(x)},${r(y)}`).join(" L");

class Canvas {
  cut: string[] = [];
  fold: string[] = [];
  glue: string[] = [];
  text: string[] = [];
  poly(list: [number, number][], close = true) {
    this.cut.push(`<path d="M${pts(list)}${close ? " Z" : ""}"/>`);
  }
  path(d: string) {
    this.cut.push(`<path d="${d}"/>`);
  }
  circle(cx: number, cy: number, d: number) {
    this.cut.push(`<circle cx="${r(cx)}" cy="${r(cy)}" r="${r(d / 2)}"/>`);
  }
  rect(x: number, y: number, w: number, h: number, rr = 0) {
    this.cut.push(`<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" rx="${r(rr)}"/>`);
  }
  line(x1: number, y1: number, x2: number, y2: number) {
    this.fold.push(`<line x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}"/>`);
  }
  glueArea(x: number, y: number, w: number, h: number) {
    this.glue.push(`<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}"/>`);
  }
  label(x: number, y: number, s: string, size = 4) {
    this.text.push(`<text x="${r(x)}" y="${r(y)}" font-size="${size}" text-anchor="middle">${s}</text>`);
  }
  render(w: number, h: number, meta: Record<string, unknown>) {
    const m = 5;
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${r(w + 2 * m)}mm" height="${r(h + 2 * m)}mm" viewBox="${-m} ${-m} ${r(w + 2 * m)} ${r(h + 2 * m)}" data-dieline='${JSON.stringify(meta)}'>
  <title>${meta.type} ${meta.L || meta.D || meta.W || ""}x${meta.W || ""}x${meta.H || ""} mm</title>
  <g id="glue" fill="#999" fill-opacity="0.18" stroke="none">\n    ${this.glue.join("\n    ")}\n  </g>
  <g id="fold" fill="none" stroke="#1a4fd6" stroke-width="0.25" stroke-dasharray="3 2">\n    ${this.fold.join("\n    ")}\n  </g>
  <g id="cut" fill="none" stroke="#d61a1a" stroke-width="0.3">\n    ${this.cut.join("\n    ")}\n  </g>
  <g id="labels" fill="#555" font-family="sans-serif">\n    ${this.text.join("\n    ")}\n  </g>
</svg>`;
  }
}

// ── أدوات مشتركة (مرآة لما في المكتبة)
function lidTuck(c: Canvas, x: number, y: number, L: number, lidH: number, tk: number, s: 1 | -1): [number, number][] {
  const out: [number, number][] = [[x, y], [x, y + s * lidH], [x + 3, y + s * lidH], [x + 3, y + s * (lidH + tk - 4)], [x + 7, y + s * (lidH + tk)], [x + L - 7, y + s * (lidH + tk)], [x + L - 3, y + s * (lidH + tk - 4)], [x + L - 3, y + s * lidH], [x + L, y + s * lidH], [x + L, y]];
  c.line(x, y + s * lidH, x + L, y + s * lidH);
  c.line(x, y, x + L, y);
  return out;
}
function dustFlap(c: Canvas, x: number, y: number, W: number, df: number, s: 1 | -1): [number, number][] {
  const i = 1, ch = Math.min(6, W * 0.2);
  c.line(x, y, x + W, y);
  return [[x, y], [x + i, y], [x + i, y + s * (df - ch)], [x + i + ch, y + s * df], [x + W - i - ch, y + s * df], [x + W - i, y + s * (df - ch)], [x + W - i, y], [x + W, y]];
}
const euroSlot = (c: Canvas, cx: number, cy: number) => {
  // فتحة تعليق أوروبية: شق أفقي 28 مم بدائرة 6 مم في الوسط
  c.path(`M${r(cx - 14)},${r(cy - 1.5)} h${r(11)} a3,3 0 0 1 ${r(3)},-${r(1.5)} a3,3 0 0 1 3,1.5 h11 v3 h-11 a3,3 0 0 1 -3,1.5 a3,3 0 0 1 -3,-1.5 h-11 Z`);
};

// ── أدوات شجرة الألواح
const Pn = (id: string, w: number, h: number, o: Partial<Panel3D> = {}): Panel3D => ({ id, w, h, holes: o.holes ?? [], children: [], role: o.role ?? "body", ...(o.hex ? { hex: true } : {}), ...(o.poly ? { poly: o.poly } : {}) });
const add = (parent: Panel3D, edge: "left" | "right" | "top" | "bottom", angle: number, panel: Panel3D) => {
  parent.children.push({ edge, angle, panel });
  return panel;
};
function bodyChain(L: number, W: number, H: number, t: number, glue: number) {
  const front = Pn("front", L, H, { role: "front" });
  const s1 = add(front, "left", 90, Pn("side", W + t, H));
  const back = add(s1, "left", 90, Pn("back", L + t, H, { role: "back" }));
  const s2 = add(back, "left", 90, Pn("side", W, H));
  add(s2, "left", 90, Pn("glue", glue, H, { role: "glue" }));
  return { front, s1, back, s2 };
}
function tray(L: number, W: number, H: number, role = "base") {
  const base = Pn("base", L, W, { role });
  const top = add(base, "top", 90, Pn("wall", L, H));
  const bot = add(base, "bottom", 90, Pn("wall", L, H));
  const lft = add(base, "left", 90, Pn("wall", H, W));
  const rgt = add(base, "right", 90, Pn("wall", H, W));
  for (const w of [lft, rgt]) {
    add(w, "top", 90, Pn("tab", H - 1, H - 1, { role: "glue" }));
    add(w, "bottom", 90, Pn("tab", H - 1, H - 1, { role: "glue" }));
  }
  return { base, top, bot, lft, rgt };
}
/** قالب صينية صلبة بزوايا غراء (مرآة rigidTray في المكتبة) */
function trayDieline(c: Canvas, ox: number, oy: number, Li: number, Wi: number, H: number, name: string) {
  const X0 = ox + H, Y0 = oy + H, X1 = X0 + Li, Y1 = Y0 + Wi, X2 = X1 + H, Y2 = Y1 + H;
  const g = 1, k = Math.min(3, H * 0.3);
  c.poly([[X0, oy], [X1, oy], [X1, Y0], [X1 + g, Y0], [X1 + g + k, oy + g], [X2 - g, oy + g], [X2, Y0], [X2, Y1], [X2 - g, Y2 - g], [X1 + g + k, Y2 - g], [X1 + g, Y1], [X1, Y1], [X1, Y2], [X0, Y2], [X0, Y1], [X0 - g, Y1], [X0 - g - k, Y2 - g], [ox + g, Y2 - g], [ox, Y1], [ox, Y0], [ox + g, oy + g], [X0 - g - k, oy + g], [X0 - g, Y0], [X0, Y0]]);
  c.line(X0, Y0, X1, Y0);
  c.line(X1, Y0, X1, Y1);
  c.line(X1, Y1, X0, Y1);
  c.line(X0, Y1, X0, Y0);
  c.line(X1 + g, Y0, X2, Y0);
  c.line(X1 + g, Y1, X2, Y1);
  c.line(ox, Y0, X0 - g, Y0);
  c.line(ox, Y1, X0 - g, Y1);
  for (const [x, y] of [[X1 + g, oy + g], [X1 + g, Y1], [ox, oy + g], [ox, Y1]]) c.glueArea(x, y, H - g, H - g);
  c.label(X0 + Li / 2, Y0 + Wi / 2, name);
  return { w: X2 - ox, h: Y2 - oy };
}

// ───────────────────────── 1) Seal End (ECMA A20.21): ألسنة غراء علوية وسفلية ─────────────────────────
function sealEndSvg(p: P) {
  const { L = 50, W = 50, H = 120, t = 0.5, glue = 15 } = p;
  const c = new Canvas();
  const fl = W / 2 + 2, df = W / 2 - 1;
  const xs = [0, glue, glue + W, glue + W + L + t, glue + 2 * W + L + 2 * t, glue + 2 * W + 2 * L + 3 * t];
  const pw = [W, L + t, W + t, L + t];
  const yT = fl, yB = yT + H;
  const top: [number, number][] = [[0, yT + 3], [2, yT]];
  for (let i = 1; i <= 4; i++) {
    const x = xs[i], w = pw[i - 1], h = i % 2 ? df : fl;
    top.push([x + 1, yT], [x + 1, yT - h + 2], [x + 3, yT - h], [x + w - 3, yT - h], [x + w - 1, yT - h + 2], [x + w - 1, yT]);
    c.line(x, yT, x + w, yT);
    if (i % 2 === 0) c.glueArea(x + 1, yT - h, w - 2, 6);
  }
  const bot: [number, number][] = [];
  for (let i = 4; i >= 1; i--) {
    const x = xs[i], w = pw[i - 1], h = i % 2 ? df : fl;
    bot.push([x + w - 1, yB], [x + w - 1, yB + h - 2], [x + w - 3, yB + h], [x + 3, yB + h], [x + 1, yB + h - 2], [x + 1, yB]);
    c.line(x, yB, x + w, yB);
    if (i % 2 === 0) c.glueArea(x + 1, yB + h - 6, w - 2, 6);
  }
  c.poly([...top, [xs[5], yT], [xs[5], yB], ...bot, [2, yB], [0, yB - 3]]);
  for (let i = 1; i <= 4; i++) c.line(xs[i], yT, xs[i], yB);
  c.glueArea(0, yT, glue, H);
  ["جانب", "خلف", "جانب", "واجهة"].forEach((n, i) => c.label(xs[i + 1] + pw[i] / 2, yT + H / 2, n));
  return c.render(xs[5], H + 2 * fl, { type: "SEAL_END", L, W, H, t });
}
function sealEnd3d(p: P): Model3D {
  const { L = 50, W = 50, H = 120, t = 0.5, glue = 15 } = p;
  const b = bodyChain(L, W, H, t, glue);
  const fl = W / 2 + 2, df = W / 2 - 1;
  for (const [pnl, w, h] of [[b.front, L, fl], [b.back, L + t, fl], [b.s1, W + t, df], [b.s2, W, df]] as [Panel3D, number, number][]) {
    add(pnl, "top", 90, Pn("flap", w, h, { role: "dust" }));
    add(pnl, "bottom", 90, Pn("flap", w, h, { role: "dust" }));
  }
  return { parts: [{ root: b.front, position: [0, 0, 0] }] };
}

// ───────────────────────── 2) Hang tab: علبة STE بلسان تعليق أوروبي ─────────────────────────
function hangTabSvg(p: P) {
  const { L = 28, W = 28, H = 95, t = 0.5, glue = 15 } = p;
  const lidH = W + t, tk = Math.max(12, Math.min(20, W * 0.4)), df = W * 0.85, tab = 28;
  const c = new Canvas();
  const yT = lidH + tk + tab, yB = yT + H;
  const xs = [0, glue, glue + W, glue + W + L + t, glue + 2 * W + L + 2 * t, glue + 2 * W + 2 * L + 3 * t];
  const pw = [W, L + t, W + t, L + t];
  let top: [number, number][] = [[0, yT + 3], [2, yT]];
  for (let i = 1; i <= 4; i++) {
    const x = xs[i], w = pw[i - 1];
    if (i % 2 === 1) top = top.concat(dustFlap(c, x, yT, w, df, -1));
    else if (i === 4) top = top.concat(lidTuck(c, x, yT, w, lidH, tk, -1));
    else {
      // الخلف: لسان التعليق فوق اللسان الداخلي
      const yL = yT - lidH;
      top.push([x, yT], [x, yL], [x + 4, yL - tab + 4], [x + 8, yL - tab], [x + w - 8, yL - tab], [x + w - 4, yL - tab + 4], [x + w, yL], [x + w, yT]);
      c.line(x, yT, x + w, yT);
      c.line(x, yL, x + w, yL);
      euroSlot(c, x + w / 2, yL - tab / 2);
    }
  }
  const bot: [number, number][] = [];
  for (let i = 4; i >= 1; i--) {
    const x = xs[i], w = pw[i - 1];
    const seg = i % 2 === 1 ? dustFlap(c, x, yB, w, df, +1) : i === 4 ? lidTuck(c, x, yB, w, lidH, tk, +1) : ([[x, yB], [x + w, yB]] as [number, number][]);
    if (i === 2) c.line(x, yB, x + w, yB);
    bot.push(...seg.reverse());
  }
  c.poly([...top, [xs[5], yT], ...bot, [2, yB], [0, yB - 3]]);
  for (let i = 1; i <= 4; i++) c.line(xs[i], yT, xs[i], yB);
  c.glueArea(0, yT, glue, H);
  ["جانب", "خلف", "جانب", "واجهة"].forEach((n, i) => c.label(xs[i + 1] + pw[i] / 2, yT + H / 2, n));
  return c.render(xs[5], yB + lidH + tk, { type: "HANG_TAB", L, W, H, t });
}
function hangTab3d(p: P): Model3D {
  const { L = 28, W = 28, H = 95, t = 0.5, glue = 15 } = p;
  const b = bodyChain(L, W, H, t, glue);
  const tk = Math.max(12, Math.min(20, W * 0.4)), tab = 28;
  for (const e of ["top", "bottom"] as const) {
    const lid = add(b.front, e, 90, Pn("lid", L, W + t, { role: "lid" }));
    add(lid, e, 90, Pn("tuck", L, tk, { role: "tuck" }));
  }
  for (const [s, w] of [[b.s1, W + t], [b.s2, W]] as [Panel3D, number][]) {
    add(s, "top", 90, Pn("dust", w, W * 0.85, { role: "dust" }));
    add(s, "bottom", 90, Pn("dust", w, W * 0.85, { role: "dust" }));
  }
  const inner = add(b.back, "top", 90, Pn("innerLid", L + t, W + t, { role: "dust" }));
  // لسان التعليق يُثنى عائداً لأعلى ليقف فوق العلبة
  add(inner, "top", 90, Pn("hang", L + t, tab, { role: "back", holes: [{ type: "circle", x: (L + t) / 2, y: tab / 2, d: 6 }] }));
  return { parts: [{ root: b.front, position: [0, 0, 0] }] };
}

// ───────────────────────── 3) RSC FEFCO 0201: كرتون الشحن الرئيسي ─────────────────────────
function rscSvg(p: P) {
  const { L = 160, W = 110, H = 130, t = 3, glue = 35 } = p;
  const c = new Canvas();
  const f = W / 2, slot = t + 1;
  const xs = [0, glue, glue + L, glue + L + W, glue + 2 * L + W, glue + 2 * L + 2 * W];
  const yT = f, yB = f + H;
  const top: [number, number][] = [[0, yT + 6], [6, yT]];
  const bot: [number, number][] = [];
  for (let i = 1; i <= 4; i++) {
    const x = xs[i] + (i > 1 ? slot / 2 : 0), x2 = xs[i + 1] - (i < 4 ? slot / 2 : 0);
    top.push([x, yT], [x, 0], [x2, 0], [x2, yT]);
    c.line(xs[i], yT, xs[i + 1], yT);
    c.line(xs[i], yB, xs[i + 1], yB);
  }
  for (let i = 4; i >= 1; i--) {
    const x = xs[i] + (i > 1 ? slot / 2 : 0), x2 = xs[i + 1] - (i < 4 ? slot / 2 : 0);
    bot.push([x2, yB], [x2, yB + f], [x, yB + f], [x, yB]);
  }
  c.poly([...top, [xs[5], yT], ...bot, [6, yB], [0, yB - 6]]);
  for (let i = 1; i <= 4; i++) c.line(xs[i], yT, xs[i], yB);
  c.glueArea(0, yT, glue, H);
  ["طول", "عرض", "طول", "عرض"].forEach((n, i) => c.label((xs[i + 1] + xs[i + 2]) / 2, yT + H / 2, n));
  return c.render(xs[5], H + W, { type: "RSC_0201", L, W, H, t });
}
function rsc3d(p: P): Model3D {
  const { L = 160, W = 110, H = 130, t = 3, glue = 35 } = p;
  const a = Pn("front", L, H, { role: "front" });
  const b1 = add(a, "left", 90, Pn("side", W + t, H));
  const bk = add(b1, "left", 90, Pn("back", L + t, H, { role: "back" }));
  const b2 = add(bk, "left", 90, Pn("side", W, H));
  add(b2, "left", 90, Pn("glue", glue, H, { role: "glue" }));
  for (const [pnl, w] of [[a, L], [bk, L + t], [b1, W + t], [b2, W]] as [Panel3D, number][]) {
    add(pnl, "top", 90, Pn("flap", w, W / 2, { role: "dust" }));
    add(pnl, "bottom", 90, Pn("flap", w, W / 2, { role: "dust" }));
  }
  return { parts: [{ root: a, position: [0, 0, 0] }] };
}

// ───────────────────────── 4) Hinged lid: علبة صلبة بغطاء متصل (مغناطيسية / كتاب) ─────────────────────────
function hingedLidSvg(p: P) {
  const { L = 60, W = 60, H = 35, t = 2, lip = 0.6 } = p;
  const c = new Canvas();
  const lipH = Math.max(12, H * lip);
  const X0 = H, Y0 = H, X1 = X0 + L, Y1 = Y0 + W;
  // القاعدة بجدرانها الأربعة (زوايا غراء)، والجدار الخلفي يمتد إلى العمود ثم الغطاء ثم الشفة
  const spineY = Y0 - H, lidY = spineY - t * 2, topY = lidY - (W + t), lipY = topY - lipH;
  const g = 1, k = Math.min(3, H * 0.3);
  c.poly([
    [X0, lipY + 3], [X0 + 3, lipY], [X1 - 3, lipY], [X1, lipY + 3], [X1, topY],
    [X1 + H * 0.5, topY], [X1 + H * 0.5, lidY - 2], [X1, lidY], [X1, spineY], [X1, Y0],
    [X1 + g, Y0], [X1 + g + k, g], [X1 + H - g, g], [X1 + H, Y0], [X1 + H, Y1], [X1 + H - g, Y1 + H - g], [X1 + g + k, Y1 + H - g], [X1 + g, Y1], [X1, Y1], [X1, Y1 + H], [X0, Y1 + H], [X0, Y1],
    [X0 - g, Y1], [X0 - g - k, Y1 + H - g], [g, Y1 + H - g], [0, Y1], [0, Y0], [g, g], [X0 - g - k, g], [X0 - g, Y0], [X0, Y0], [X0, spineY], [X0, lidY], [X0 - H * 0.5, lidY - 2], [X0 - H * 0.5, topY], [X0, topY],
  ]);
  for (const y of [Y0, Y1, spineY, lidY, topY]) c.line(X0, y, X1, y);
  c.line(X0, Y0, X0, Y1);
  c.line(X1, Y0, X1, Y1);
  c.line(X0, lidY, X0, topY);
  c.line(X1, lidY, X1, topY);
  c.line(X1 + g, Y0, X1 + H, Y0);
  c.line(X1 + g, Y1, X1 + H, Y1);
  c.line(0, Y0, X0 - g, Y0);
  c.line(0, Y1, X0 - g, Y1);
  for (const [x, y] of [[X1 + g, g], [X1 + g, Y1], [0, g], [0, Y1]]) c.glueArea(x, y, H - g, H - g);
  c.label(X0 + L / 2, Y0 + W / 2, "قاعدة");
  c.label(X0 + L / 2, topY + (W + t) / 2, "غطاء");
  c.label(X0 + L / 2, lipY + lipH / 2, "شفة مغناطيس", 3.5);
  return c.render(X1 + H, Y1 + H - lipY, { type: "HINGED_LID", L, W, H, t, note: "تُغلَّف القاعدة والغطاء بورقة مطبوعة واحدة؛ المغناطيس داخل الشفة والجدار الأمامي" });
}
function hingedLid3d(p: P): Model3D {
  const { L = 60, W = 60, H = 35, t = 2, lip = 0.6 } = p;
  const tr = tray(L, W, H);
  const lipH = Math.max(12, H * lip);
  // الجدار الخلفي (الحافة العليا للقاعدة) يحمل العمود ثم الغطاء ثم الشفة
  // الجدار الخلفي يُطوى للداخل، فالعمود يستقر أفقياً فوق الفتحة والغطاء يكمله على استوائه
  const spine = add(tr.top, "top", 90, Pn("spine", L, t * 2, { role: "lid" }));
  const lid = add(spine, "top", 0, Pn("lid", L, W + t, { role: "lid" }));
  add(lid, "top", 90, Pn("lip", L, lipH, { role: "front" }));
  add(lid, "left", 90, Pn("lidWall", H * 0.5, W + t, { role: "lid" }));
  add(lid, "right", 90, Pn("lidWall", H * 0.5, W + t, { role: "lid" }));
  return { parts: [{ root: tr.base, position: [0, 0, 0] }] };
}

// ───────────────────────── 5) Shoulder box: علبة صلبة بعنق (كتف) ─────────────────────────
function shoulderSvg(p: P) {
  const { L = 60, W = 60, H = 35, t = 2, neck = 12 } = p;
  const c = new Canvas();
  const a = trayDieline(c, 0, 0, L, W, H, "قاعدة");
  const b = trayDieline(c, a.w + 10, 0, L - 2 * t - 1, W - 2 * t - 1, H + neck, "عنق");
  const d = trayDieline(c, a.w + b.w + 20, 0, L + 2.5, W + 2.5, H - neck + 4, "غطاء");
  return c.render(a.w + b.w + d.w + 20, Math.max(a.h, b.h, d.h), { type: "SHOULDER", L, W, H, t, neck });
}
function shoulder3d(p: P): Model3D {
  const { L = 60, W = 60, H = 35, t = 2, neck = 12 } = p;
  const base = tray(L, W, H).base;
  const nk = tray(L - 2 * t - 1, W - 2 * t - 1, H + neck, "base").base;
  nk.role = "base";
  const lid = tray(L + 2.5, W + 2.5, H - neck + 4).base;
  return { parts: [{ root: base, position: [0, 0, 0] }, { root: nk, position: [t + 0.5, t, t + 0.5] }, { root: lid, position: [L + 30, 0, 0] }] };
}

// ───────────────────────── 6) Tube: أسطوانة ورقية بغطاء (24 وجهاً في المعاينة) ─────────────────────────
const FACETS = 24;
function tubeSvg(p: P) {
  const { D = 45, H = 120, t = 1.5, lidH = 25, glue = 10 } = p;
  const c = new Canvas();
  const C = Math.PI * D, Cl = Math.PI * (D + 2 * t + 1);
  c.rect(0, 0, C + glue, H);
  c.line(glue, 0, glue, H);
  c.glueArea(0, 0, glue, H);
  c.label((C + glue) / 2, H / 2, "جسم الأسطوانة");
  const y2 = H + 10;
  c.rect(0, y2, Cl + glue, lidH);
  c.line(glue, y2, glue, y2 + lidH);
  c.glueArea(0, y2, glue, lidH);
  c.label((Cl + glue) / 2, y2 + lidH / 2, "غلاف الغطاء", 3.5);
  const y3 = y2 + lidH + 10 + (D + 2 * t + 1) / 2;
  c.circle((D + 2 * t + 1) / 2, y3, D);
  c.label((D + 2 * t + 1) / 2, y3, "قاعدة", 3.5);
  c.circle(D + 2 * t + 1 + 10 + (D + 2 * t + 1) / 2, y3, D + 2 * t + 1);
  c.label(D + 2 * t + 1 + 10 + (D + 2 * t + 1) / 2, y3, "غطاء", 3.5);
  return c.render(Cl + glue, y3 + (D + 2 * t + 1) / 2, { type: "TUBE", D, H, t, lidH });
}
function ring(id: string, D: number, H: number, role: string) {
  const s = (Math.PI * D) / FACETS;
  const first = Pn(id, s, H, { role });
  let cur = first;
  for (let i = 1; i < FACETS; i++) cur = add(cur, "left", 360 / FACETS, Pn(id, s, H, { role }));
  return { first, s };
}
function tube3d(p: P): Model3D {
  const { D = 45, H = 120, t = 1.5, lidH = 25 } = p;
  const body = ring("body", D, H, "body");
  const a = body.s / (2 * Math.tan(Math.PI / FACETS));
  add(body.first, "bottom", 90, Pn("disc", body.s, 2 * a, { role: "glue", poly: FACETS }));
  const Dl = D + 2 * t + 1;
  const lid = ring("lid", Dl, lidH, "lid");
  const al = lid.s / (2 * Math.tan(Math.PI / FACETS));
  add(lid.first, "top", 90, Pn("disc", lid.s, 2 * al, { role: "lid", poly: FACETS }));
  return { parts: [{ root: body.first, position: [0, 0, 0] }, { root: lid.first, position: [D + 30, 0, 0] }], note: "الأسطوانة تُعرض بأربعة وعشرين وجهاً؛ القالب الثنائي يحمل الأبعاد الدقيقة للف والأقراص." };
}

// ───────────────────────── 7) Vial card: بطاقة عينات بشقوق للقوارير ─────────────────────────
function vialCardSvg(p: P) {
  const { N = 5, vialD = 12, H = 90, t = 0.5 } = p;
  const gap = 10, W = N * (vialD + gap) + gap;
  const c = new Canvas();
  c.rect(0, 0, W, H * 1.6, 3);
  c.line(0, H * 0.6, W, H * 0.6);
  for (let i = 0; i < N; i++) {
    const cx = gap + i * (vialD + gap) + vialD / 2;
    // شقّان لكل قارورة
    c.path(`M${r(cx - vialD / 2 - t)},${r(H * 0.6 + 20)} h${r(vialD + 2 * t)}`);
    c.path(`M${r(cx - vialD / 2 - t)},${r(H * 0.6 + 20 + vialD * 2.5)} h${r(vialD + 2 * t)}`);
    c.label(cx, H * 0.6 + 12, `${i + 1}`, 3);
  }
  c.label(W / 2, H * 0.3, "واجهة قائمة");
  return c.render(W, H * 1.6, { type: "VIAL_CARD", N, vialD, W, H, t });
}
function vialCard3d(p: P): Model3D {
  const { N = 5, vialD = 12, H = 90, t = 0.5 } = p;
  const gap = 10, W = N * (vialD + gap) + gap;
  const holes: Panel3D["holes"] = [];
  for (let i = 0; i < N; i++) {
    const cx = gap + i * (vialD + gap) + vialD / 2;
    holes.push({ type: "rect", x: cx - vialD / 2 - t, y: H - 20 - vialD * 2.5, w: vialD + 2 * t, h: 1.2 }, { type: "rect", x: cx - vialD / 2 - t, y: H - 20, w: vialD + 2 * t, h: 1.2 });
  }
  // البطاقة تقف كخيمة: الواجهة الحاملة للقوارير قائمة، ولوح الدعم يميل خلفها من الحافة العليا
  const face = Pn("front", W, H, { role: "front", holes });
  add(face, "top", 150, Pn("support", W, H * 0.6, { role: "back" }));
  return { parts: [{ root: face, position: [0, 0, 0] }] };
}

// ───────────────────────── 8) Gift bag: حقيبة ورقية بجوانب مطوية ─────────────────────────
function giftBagSvg(p: P) {
  const { W = 120, G = 70, H = 180, glue = 15 } = p;
  const c = new Canvas();
  const top = 30, bot = G / 2 + 10;
  const xs = [0, glue, glue + W, glue + W + G, glue + 2 * W + G, glue + 2 * W + 2 * G];
  const yT = top, yB = top + H;
  c.poly([[0, yT], [xs[5], yT - top], [xs[5], yB + bot], [0, yB + bot]].map(([x, y], i) => (i === 0 ? [0, 0] : [x, y])) as [number, number][]);
  c.line(0, yT, xs[5], yT);
  c.line(0, yB, xs[5], yB);
  for (let i = 1; i <= 4; i++) c.line(xs[i], 0, xs[i], yB + bot);
  // طيّة منتصف الجانبين، وطيّات القاعدة المائلة
  for (const i of [2, 4]) {
    const mid = (xs[i] + xs[i + 1]) / 2;
    c.line(mid, yT, mid, yB + bot);
    c.line(xs[i], yB, mid, yB + G / 2);
    c.line(xs[i + 1], yB, mid, yB + G / 2);
  }
  c.glueArea(0, 0, glue, yB + bot);
  for (const i of [1, 3]) {
    const cx = (xs[i] + xs[i + 1]) / 2;
    c.circle(cx - 30, yT + 15, 6);
    c.circle(cx + 30, yT + 15, 6);
  }
  c.label((xs[1] + xs[2]) / 2, yT + H / 2, "واجهة");
  c.label((xs[3] + xs[4]) / 2, yT + H / 2, "خلف");
  return c.render(xs[5], yB + bot, { type: "GIFT_BAG", W, G, H, note: "المقابض: حبل أو شريط عبر فتحتين 6 مم؛ القاعدة تُدعَّم بلوح كرتوني" });
}
function giftBag3d(p: P): Model3D {
  const { W = 120, G = 70, H = 180, glue = 15 } = p;
  const holes = (w: number): Panel3D["holes"] => [{ type: "circle", x: w / 2 - 30, y: H - 15, d: 6 }, { type: "circle", x: w / 2 + 30, y: H - 15, d: 6 }];
  const front = Pn("front", W, H, { role: "front", holes: holes(W) });
  const g1 = add(front, "left", 90, Pn("gusset", G, H));
  const back = add(g1, "left", 90, Pn("back", W, H, { role: "back", holes: holes(W) }));
  const g2 = add(back, "left", 90, Pn("gusset", G, H));
  add(g2, "left", 90, Pn("glue", glue, H, { role: "glue" }));
  add(front, "bottom", 90, Pn("bottom", W, G / 2 + 10, { role: "glue" }));
  add(back, "bottom", 90, Pn("bottom", W, G / 2 + 10, { role: "glue" }));
  add(g1, "bottom", 90, Pn("bottom", G, G / 2, { role: "glue" }));
  add(g2, "bottom", 90, Pn("bottom", G, G / 2, { role: "glue" }));
  return { parts: [{ root: front, position: [0, 0, 0] }], note: "الجوانب تُعرض مستوية؛ طيّة المنتصف والقاعدة المائلة في القالب الثنائي." };
}

// ───────────────────────── 9) Counter display: صينية عرض بلوح خلفي ─────────────────────────
function displaySvg(p: P) {
  const { L = 160, W = 60, H = 40, header = 70, t = 1.5 } = p;
  const c = new Canvas();
  const X0 = H, Y0 = header + H, X1 = X0 + L, Y1 = Y0 + W, X2 = X1 + H, Y2 = Y1 + H;
  const g = 1, k = Math.min(3, H * 0.3);
  c.poly([
    [X0 + 3, 0], [X1 - 3, 0], [X1, 3], [X1, Y0 - H], [X1, Y0], [X1 + g, Y0], [X1 + g + k, Y0 - H + g], [X2 - g, Y0 - H + g], [X2, Y0], [X2, Y1], [X2 - g, Y2 - g], [X1 + g + k, Y2 - g], [X1 + g, Y1], [X1, Y1], [X1, Y2], [X0, Y2], [X0, Y1],
    [X0 - g, Y1], [X0 - g - k, Y2 - g], [g, Y2 - g], [0, Y1], [0, Y0], [g, Y0 - H + g], [X0 - g - k, Y0 - H + g], [X0 - g, Y0], [X0, Y0], [X0, Y0 - H], [X0, 3],
  ]);
  for (const y of [Y0 - H, Y0, Y1]) c.line(X0, y, X1, y);
  c.line(X0, Y0, X0, Y1);
  c.line(X1, Y0, X1, Y1);
  c.line(X1 + g, Y0, X2, Y0);
  c.line(X1 + g, Y1, X2, Y1);
  c.line(0, Y0, X0 - g, Y0);
  c.line(0, Y1, X0 - g, Y1);
  for (const [x, y] of [[X1 + g, Y0 - H + g], [X1 + g, Y1], [0, Y0 - H + g], [0, Y1]]) c.glueArea(x, y, H - g, H - g);
  c.label(X0 + L / 2, header / 2, "لوح العرض");
  c.label(X0 + L / 2, Y0 + W / 2, "صينية");
  return c.render(X2, Y2, { type: "DISPLAY", L, W, H, header, t });
}
function display3d(p: P): Model3D {
  const { L = 160, W = 60, H = 40, header = 70 } = p;
  const tr = tray(L, W, H);
  add(tr.top, "top", 0, Pn("header", L, header, { role: "front" }));
  tr.bot.role = "body";
  return { parts: [{ root: tr.base, position: [0, 0, 0] }] };
}

export const EXTRA_GENERATORS: Record<string, (p: P) => string> = { sealEnd: sealEndSvg, hangTab: hangTabSvg, rsc: rscSvg, hingedLid: hingedLidSvg, shoulder: shoulderSvg, tube: tubeSvg, vialCard: vialCardSvg, giftBag: giftBagSvg, display: displaySvg };
export const EXTRA_MODELS: Record<string, (p: P) => Model3D> = { sealEnd: sealEnd3d, hangTab: hangTab3d, rsc: rsc3d, hingedLid: hingedLid3d, shoulder: shoulder3d, tube: tube3d, vialCard: vialCard3d, giftBag: giftBag3d, display: display3d };
export const EXTRA_TYPES: Record<string, string> = {
  sealEnd: "Seal End — علبة مطوية بألسنة غراء للتعبئة الآلية",
  hangTab: "Hang Tab — علبة بلسان تعليق أوروبي للرفوف",
  rsc: "RSC FEFCO 0201 — كرتون الشحن الرئيسي",
  hingedLid: "Hinged Lid — علبة صلبة بغطاء متصل (مغناطيسية)",
  shoulder: "Shoulder Box — علبة صلبة بعنق",
  tube: "Tube — أسطوانة ورقية بغطاء",
  vialCard: "Vial Card — بطاقة عينات بشقوق",
  giftBag: "Gift Bag — حقيبة ورقية بجوانب",
  display: "Counter Display — صينية عرض بلوح خلفي",
};
