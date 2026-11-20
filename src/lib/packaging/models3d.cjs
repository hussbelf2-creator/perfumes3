/**
 * models3d.js — أشجار الألواح (Panel trees) لطي القوالب في المعاينة ثلاثية الأبعاد.
 * كل لوح: { id, w, h, holes:[], children:[{ edge:'left|right|top|bottom', angle:deg, panel }] }
 * الزاوية الموجبة تطوي اللوح خلف المستوى (نحو -z). الوحدة: مم.
 * يعيد { parts:[{ root, position:[x,y,z], rotation:[rx,ry,rz] }], note }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Models3D = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const P = (id, w, h, o = {}) => ({ id, w, h, holes: o.holes || [], children: [], role: o.role || 'body' });
  const add = (parent, edge, angle, panel) => { parent.children.push({ edge, angle, panel }); return panel; };

  function lidTuck(parent, edge, L, W, t, flipTuck) {
    const lid = add(parent, edge, 90, P('lid', L, W + t, { role: 'lid' }));
    add(lid, edge === 'top' ? 'top' : 'bottom', 90, P('tuck', L, Math.max(12, Math.min(20, W * 0.4)), { role: 'tuck' }));
    return lid;
  }
  function dust(parent, edge, W) { return add(parent, edge, 90, P('dust', W, W * 0.85, { role: 'dust' })); }

  // سلسلة ألواح الجسم: الواجهة جذر، ثم يسارها: جانب، خلف، جانب، لسان غراء
  function bodyChain(L, W, H, t, glue) {
    const front = P('front', L, H, { role: 'front' });
    const s1 = add(front, 'left', 90, P('side', W + t, H));
    const back = add(s1, 'left', 90, P('back', L + t, H, { role: 'back' }));
    const s2 = add(back, 'left', 90, P('side', W, H));
    add(s2, 'left', 90, P('glue', glue, H, { role: 'glue' }));
    return { front, s1, back, s2 };
  }

  function tuckEnd(p, reverse) {
    const { L = 50, W = 50, H = 120, t = 0.5, glue = 15 } = p;
    const b = bodyChain(L, W, H, t, glue);
    lidTuck(reverse ? b.back : b.front, 'top', reverse ? L + t : L, W, t);
    lidTuck(b.front, 'bottom', L, W, t);
    dust(b.s1, 'top', W + t); dust(b.s1, 'bottom', W + t); dust(b.s2, 'top', W); dust(b.s2, 'bottom', W);
    if (p.window) b.front.holes.push({ type: 'rect', x: L * 0.2, y: H * 0.25, w: L * 0.6, h: H * 0.5, r: 3 });
    return { parts: [{ root: b.front, position: [0, 0, 0] }] };
  }

  function crashLock(p) {
    const { L = 50, W = 50, H = 120, t = 0.5, glue = 15 } = p;
    const b = bodyChain(L, W, H, t, glue);
    lidTuck(b.front, 'top', L, W, t);
    dust(b.s1, 'top', W + t); dust(b.s2, 'top', W);
    // قاعدة Crash Lock: لوح رئيسي على الواجهة، لوحان مائلان على الجانبين، لوح غراء على الخلف
    add(b.front, 'bottom', 90, P('lockMain', L, W * 0.85, { role: 'lock' }));
    add(b.back, 'bottom', 90, P('lockBack', L + t, W * 0.6, { role: 'lock' }));
    add(b.s1, 'bottom', 90, P('lockSide', W + t, W * 0.5, { role: 'lock' }));
    add(b.s2, 'bottom', 90, P('lockSide', W, W * 0.5, { role: 'lock' }));
    return { parts: [{ root: b.front, position: [0, 0, 0] }], note: 'قاعدة القفل الذاتي: هندسة الألسنة المائلة تقريبية في المعاينة.' };
  }

  function sleeve(p) {
    const { L = 52, W = 52, H = 125, t = 0.5, glue = 15 } = p;
    const b = bodyChain(L, W, H, t, glue);
    if (p.thumb !== false) b.front.holes.push({ type: 'circle', x: L / 2, y: H, d: 16 });
    return { parts: [{ root: b.front, position: [0, 0, 0] }] };
  }

  function tray(L, W, H, tabs = true) {
    const base = P('base', L, W, { role: 'base' });
    const top = add(base, 'top', 90, P('wall', L, H));
    const bot = add(base, 'bottom', 90, P('wall', L, H));
    const lft = add(base, 'left', 90, P('wall', H, W));
    const rgt = add(base, 'right', 90, P('wall', H, W));
    if (tabs) { add(lft, 'top', 90, P('tab', H - 1, H - 1, { role: 'glue' })); add(lft, 'bottom', 90, P('tab', H - 1, H - 1, { role: 'glue' }));
                add(rgt, 'top', 90, P('tab', H - 1, H - 1, { role: 'glue' })); add(rgt, 'bottom', 90, P('tab', H - 1, H - 1, { role: 'glue' })); }
    return base;
  }
  function rigidTray(p) { const { L = 60, W = 60, H = 30, clearance = 0 } = p; return { parts: [{ root: tray(L + clearance, W + clearance, H), position: [0, 0, 0] }] }; }
  function rigidSet(p) {   // قاعدة + غطاء + حشوة في مشهد واحد
    const { L = 60, W = 60, H = 35, clearance = 2.5, bottleW = 42, bottleD = 42 } = p;
    const base = tray(L, W, H), lid = tray(L + clearance, W + clearance, H * 0.6);
    const ins = insert({ L: L - 1, W: W - 1, H: H * 0.5, bottleW, bottleD }).parts[0].root;
    return { parts: [{ root: base, position: [0, 0, 0] }, { root: lid, position: [L + 30, 0, 0] }, { root: ins, position: [0.5, H * 0.5 + 0.5, -0.5] }] };
  }

  function insert(p) {
    const { L = 49, W = 49, H = 20, bottleW = 30, bottleD = 30, shape = 'rect', t = 0.5 } = p;
    const plat = P('platform', L, W, { role: 'platform' });
    plat.holes.push(shape === 'circle' ? { type: 'circle', x: L / 2, y: W / 2, d: bottleW + t } : { type: 'rect', x: (L - bottleW - t) / 2, y: (W - bottleD - t) / 2, w: bottleW + t, h: bottleD + t, r: 2 });
    const foot = Math.max(8, H * 0.6);
    const w1 = add(plat, 'top', 90, P('wall', L, H)); add(w1, 'top', 90, P('foot', L, foot, { role: 'glue' }));
    const w2 = add(plat, 'bottom', 90, P('wall', L, H)); add(w2, 'bottom', 90, P('foot', L, foot, { role: 'glue' }));
    return { parts: [{ root: plat, position: [0, 0, 0] }] };
  }

  function pillow(p) {
    const { Wp = 60, Hp = 110, glue = 12 } = p;
    const a = P('front', Wp, Hp, { role: 'front' });
    const b = add(a, 'left', 180, P('back', Wp, Hp, { role: 'back' }));
    add(b, 'left', 180, P('glue', glue, Hp, { role: 'glue' }));
    const fh = Wp * 0.42;
    add(a, 'top', 75, P('flap', Wp, fh, { role: 'lid' })); add(a, 'bottom', 75, P('flap', Wp, fh, { role: 'lid' }));
    add(b, 'top', -75, P('flap', Wp, fh, { role: 'lid' })); add(b, 'bottom', -75, P('flap', Wp, fh, { role: 'lid' }));
    return { parts: [{ root: a, position: [0, 0, 0] }], note: 'علبة الوسادة: الأقواس تُعرض كألواح مستوية مائلة، والقالب الثنائي يحمل المنحنيات الدقيقة.' };
  }

  function hexagon(p) {
    const { S = 30, H = 110, t = 0.5, glue = 12 } = p;   // S = طول الضلع
    const front = P('front', S, H, { role: 'front' });
    let cur = front;
    for (let i = 0; i < 5; i++) cur = add(cur, 'left', 60, P('side', S + (i ? 0 : t), H, { role: i === 2 ? 'back' : 'body' }));
    add(cur, 'left', 60, P('glue', glue, H, { role: 'glue' }));
    const lidH = S * Math.sqrt(3);                // ارتفاع السداسي
    const top = add(front, 'top', 90, P('hexlid', S, lidH, { role: 'lid', hex: true }));
    add(top, 'top', 90, P('tuck', S, 12, { role: 'tuck' }));
    const bot = add(front, 'bottom', 90, P('hexlid', S, lidH, { role: 'lid', hex: true }));
    add(bot, 'bottom', 90, P('tuck', S, 12, { role: 'tuck' }));
    return { parts: [{ root: front, position: [0, 0, 0] }] };
  }

  function mailer(p) {   // FEFCO 0427 مبسّط
    const { L = 120, W = 80, H = 40, t = 1.5 } = p;
    const base = P('base', L, W, { role: 'base' });
    const back = add(base, 'top', 90, P('back', L, H, { role: 'back' }));
    const lid = add(back, 'top', 90, P('lid', L, W + t, { role: 'lid' }));
    add(lid, 'top', 90, P('lidFlap', L, H - t, { role: 'tuck' }));
    add(lid, 'left', 90, P('lidTab', H - t, W + t, { role: 'dust' })); add(lid, 'right', 90, P('lidTab', H - t, W + t, { role: 'dust' }));
    add(base, 'bottom', 90, P('front', L, H, { role: 'front' }));
    const ls = add(base, 'left', 90, P('side', H, W)); add(ls, 'left', 180, P('inner', H, W, { role: 'glue' }));
    add(ls, 'top', 90, P('dust', H, H, { role: 'dust' })); add(ls, 'bottom', 90, P('dust', H, H, { role: 'dust' }));
    const rs = add(base, 'right', 90, P('side', H, W)); add(rs, 'right', 180, P('inner', H, W, { role: 'glue' }));
    add(rs, 'top', 90, P('dust', H, H, { role: 'dust' })); add(rs, 'bottom', 90, P('dust', H, H, { role: 'dust' }));
    return { parts: [{ root: base, position: [0, 0, 0] }] };
  }

  function drawer(p) {   // درج (صينية) + غلاف منزلق
    const { L = 60, W = 60, H = 30, t = 0.5, glue = 15 } = p;
    const tr = tray(L, W, H, true);
    const sl = sleeve({ L: W + 2 * t + 1, W: H + 2 * t + 1, H: L + 2, t, glue, thumb: true }).parts[0].root;
    return { parts: [{ root: tr, position: [0, 0, 0] }, { root: sl, position: [L + 30, 0, 0], rotation: [-Math.PI / 2, 0, 0] }] };
  }

  const MODELS = { ste: p => tuckEnd(p, false), rte: p => tuckEnd(p, true), window: p => tuckEnd({ ...p, window: true }, false),
    crashLock, sleeve, rigidTray, rigidLid: p => rigidTray({ ...p, clearance: p.clearance ?? 2.5 }), rigidSet, insert, pillow, hexagon, mailer, drawer };
  return { build: (type, p = {}) => { if (!MODELS[type]) throw new Error('نوع غير معروف: ' + type); return MODELS[type](p); }, TYPES: Object.keys(MODELS) };
});
