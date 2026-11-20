import type { Bi } from "@/i18n/context";

// أربعون شكلاً جاهزاً للملصق. كل شكل مضلّع مغلق بالمليمتر داخل مستطيل (w × h)،
// يُرسم نفسه في المعاينة ثلاثية الأبعاد، وفي معاينة الملصق، وفي خط القص بملف الطباعة.

export type Pt = [number, number];
export type LabelShape =
  | "rect" | "rounded" | "bevel" | "notched" | "pill" | "squircle" | "oval" | "circle" | "vesica"
  | "arch" | "archBottom" | "domeBoth" | "cathedral" | "ogee" | "horseshoe"
  | "hexagon" | "hexagonTall" | "octagon" | "pentagon" | "diamond" | "trapezoid"
  | "shield" | "shieldPointed" | "badge" | "seal" | "medallion" | "star8" | "quatrefoil" | "scallopRect"
  | "ticket" | "ticketSide" | "banner" | "cartouche" | "tag" | "pennant" | "chevron"
  | "waveTop" | "waveBottom" | "leaf" | "teardrop";

export type ShapeGroup = "basic" | "arches" | "geometric" | "badges" | "tickets" | "organic";

export const SHAPE_GROUPS: { id: ShapeGroup; name: Bi }[] = [
  { id: "basic", name: { ar: "أساسية", en: "Basic" } },
  { id: "arches", name: { ar: "أقواس وقباب", en: "Arches & domes" } },
  { id: "geometric", name: { ar: "هندسية", en: "Geometric" } },
  { id: "badges", name: { ar: "شارات وأختام", en: "Badges & seals" } },
  { id: "tickets", name: { ar: "بطاقات وأشرطة", en: "Tickets & ribbons" } },
  { id: "organic", name: { ar: "موجات وطبيعة", en: "Waves & organic" } },
];

export interface ShapeMeta {
  id: LabelShape;
  group: ShapeGroup;
  name: Bi;
  /** يحتاج قالب قص بالشكل (المستطيل والزوايا الدائرية تُقص رقمياً بلا قالب) */
  die: boolean;
}

const M = (id: LabelShape, group: ShapeGroup, ar: string, en: string, die = true): ShapeMeta => ({ id, group, name: { ar, en }, die });

export const SHAPES: ShapeMeta[] = [
  M("rect", "basic", "مستطيل", "Rectangle", false),
  M("rounded", "basic", "بزوايا دائرية", "Rounded", false),
  M("bevel", "basic", "بزوايا مشطوفة", "Bevelled"),
  M("notched", "basic", "بزوايا مقعّرة", "Notched corners"),
  M("pill", "basic", "كبسولة", "Pill"),
  M("squircle", "basic", "مربّع ناعم", "Squircle"),
  M("oval", "basic", "بيضاوي", "Oval"),
  M("circle", "basic", "دائرة", "Circle"),
  M("vesica", "basic", "بيضاوي مدبّب", "Pointed oval"),
  M("arch", "arches", "قوس علوي", "Arch"),
  M("archBottom", "arches", "قوس سفلي", "Inverted arch"),
  M("domeBoth", "arches", "قوسان", "Double dome"),
  M("cathedral", "arches", "قوس مدبّب", "Pointed arch"),
  M("ogee", "arches", "قوس بصلي (إسلامي)", "Ogee arch"),
  M("horseshoe", "arches", "قوس حدوة (أندلسي)", "Horseshoe arch"),
  M("hexagon", "geometric", "سداسي", "Hexagon"),
  M("hexagonTall", "geometric", "سداسي قائم", "Tall hexagon"),
  M("octagon", "geometric", "ثماني", "Octagon"),
  M("pentagon", "geometric", "خماسي", "Pentagon"),
  M("diamond", "geometric", "معيّن", "Diamond"),
  M("trapezoid", "geometric", "شبه منحرف", "Trapezoid"),
  M("shield", "badges", "درع", "Shield"),
  M("shieldPointed", "badges", "درع مدبّب", "Pointed shield"),
  M("badge", "badges", "شارة مموّجة", "Scalloped badge"),
  M("seal", "badges", "ختم مسنّن", "Serrated seal"),
  M("medallion", "badges", "ميدالية", "Medallion"),
  M("star8", "badges", "نجمة ثمانية", "Eight-point star"),
  M("quatrefoil", "badges", "رباعية الفصوص", "Quatrefoil"),
  M("scallopRect", "badges", "مستطيل مموّج", "Scalloped rectangle"),
  M("ticket", "tickets", "تذكرة", "Ticket"),
  M("ticketSide", "tickets", "تذكرة جانبية", "Side-notched ticket"),
  M("banner", "tickets", "شريط راية", "Banner"),
  M("cartouche", "tickets", "خرطوشة", "Cartouche"),
  M("tag", "tickets", "بطاقة معلّقة", "Hang tag"),
  M("pennant", "tickets", "راية", "Pennant"),
  M("chevron", "tickets", "سهم سفلي", "Chevron"),
  M("waveTop", "organic", "موجة علوية", "Wave top"),
  M("waveBottom", "organic", "موجة سفلية", "Wave bottom"),
  M("leaf", "organic", "ورقة", "Leaf"),
  M("teardrop", "organic", "قطرة", "Teardrop"),
];

export const shapeById = (id: string): ShapeMeta => SHAPES.find((s) => s.id === id) ?? SHAPES[0];
export const isShape = (id: unknown): id is LabelShape => typeof id === "string" && SHAPES.some((s) => s.id === id);

// ── أدوات
const arc = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 16): Pt[] => {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return out;
};
const ngon = (cx: number, cy: number, rx: number, ry: number, n: number, start = -Math.PI / 2): Pt[] => Array.from({ length: n }, (_, i) => [cx + rx * Math.cos(start + (2 * Math.PI * i) / n), cy + ry * Math.sin(start + (2 * Math.PI * i) / n)] as Pt);
const star = (cx: number, cy: number, rOut: number, rIn: number, n: number, start = -Math.PI / 2): Pt[] => {
  const out: Pt[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? rIn : rOut;
    const a = start + (Math.PI * i) / n;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
};
/** دائرة ذات فصوص: نصف دوائر صغيرة على محيط إهليلجي */
const scallopedEllipse = (cx: number, cy: number, rx: number, ry: number, lobes: number, depth: number): Pt[] => {
  const out: Pt[] = [];
  const N = lobes * 10;
  for (let i = 0; i < N; i++) {
    const a = (2 * Math.PI * i) / N;
    const k = 1 + depth * Math.abs(Math.sin((lobes * a) / 2));
    out.push([cx + rx * k * Math.cos(a), cy + ry * k * Math.sin(a)]);
  }
  return out;
};
const bez = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, n = 12): Pt[] => Array.from({ length: n + 1 }, (_, i) => {
  const u = i / n, v = 1 - u;
  return [v * v * v * p0[0] + 3 * v * v * u * p1[0] + 3 * v * u * u * p2[0] + u * u * u * p3[0], v * v * v * p0[1] + 3 * v * v * u * p1[1] + 3 * v * u * u * p2[1] + u * u * u * p3[1]] as Pt;
});
const roundedBox = (x: number, y: number, w: number, h: number, r: number): Pt[] => {
  const rr = Math.min(r, w / 2, h / 2);
  return [...arc(x + w - rr, y + rr, rr, rr, -Math.PI / 2, 0, 8), ...arc(x + w - rr, y + h - rr, rr, rr, 0, Math.PI / 2, 8), ...arc(x + rr, y + h - rr, rr, rr, Math.PI / 2, Math.PI, 8), ...arc(x + rr, y + rr, rr, rr, Math.PI, 1.5 * Math.PI, 8)];
};
const wave = (x0: number, x1: number, y: number, amp: number, waves: number, n = 40): Pt[] => Array.from({ length: n + 1 }, (_, i) => {
  const u = i / n;
  return [x0 + (x1 - x0) * u, y + amp * Math.sin(u * Math.PI * 2 * waves)] as Pt;
});

/**
 * نقاط الشكل داخل المستطيل (0,0)–(w,h)، y للأسفل كما في لوحة الرسم.
 * corner: نصف قطر الزوايا الدائرية (مم) حيث يلزم.
 */
export function shapePoints(shape: LabelShape, w: number, h: number, corner = 4): Pt[] {
  const cx = w / 2, cy = h / 2, m = Math.min(w, h);
  switch (shape) {
    case "rect":
      return [[0, 0], [w, 0], [w, h], [0, h]];
    case "rounded":
      return roundedBox(0, 0, w, h, corner);
    case "bevel": {
      const c = Math.min(m * 0.18, 8);
      return [[c, 0], [w - c, 0], [w, c], [w, h - c], [w - c, h], [c, h], [0, h - c], [0, c]];
    }
    case "notched": {
      const c = Math.min(m * 0.16, 7);
      return [[c, 0], [w - c, 0], ...arc(w, 0, c, c, Math.PI, Math.PI / 2, 6).slice(1, -1), [w, c], [w, h - c], ...arc(w, h, c, c, -Math.PI / 2, -Math.PI, 6).slice(1, -1), [w - c, h], [c, h], ...arc(0, h, c, c, 0, -Math.PI / 2, 6).slice(1, -1), [0, h - c], [0, c], ...arc(0, 0, c, c, Math.PI / 2, 0, 6).slice(1, -1)];
    }
    case "pill":
      return roundedBox(0, 0, w, h, m / 2);
    case "squircle":
      return roundedBox(0, 0, w, h, m * 0.3);
    case "oval":
      return arc(cx, cy, w / 2, h / 2, 0, Math.PI * 2, 64).slice(0, -1);
    case "circle":
      return arc(cx, cy, m / 2, m / 2, 0, Math.PI * 2, 64).slice(0, -1);
    case "vesica": {
      // تقاطع قوسين كبيرين: مدبّب من الأعلى والأسفل
      const R = (h * h / 4 + w * w / 4) / w;
      const a = Math.asin(h / 2 / R);
      return [...arc(cx - R + w / 2, cy, R, R, -a, a, 24), ...arc(cx + R - w / 2, cy, R, R, Math.PI - a, Math.PI + a, 24)];
    }
    case "arch": {
      const r = Math.min(w / 2, h);
      return [[0, h], [0, r], ...arc(cx, r, w / 2, r, Math.PI, 2 * Math.PI, 24), [w, h]];
    }
    case "archBottom": {
      const r = Math.min(w / 2, h);
      return [[0, 0], [w, 0], [w, h - r], ...arc(cx, h - r, w / 2, r, 0, Math.PI, 24)];
    }
    case "domeBoth": {
      const r = Math.min(w / 2, h / 2);
      return [[0, h - r], [0, r], ...arc(cx, r, w / 2, r, Math.PI, 2 * Math.PI, 24), [w, h - r], ...arc(cx, h - r, w / 2, r, 0, Math.PI, 24)];
    }
    case "cathedral": {
      // قوس مدبّب: منحنيان يلتقيان في قمة
      const top = Math.min(h * 0.55, w * 0.7);
      return [[0, h], [0, top], ...bez([0, top], [0, top * 0.38], [w * 0.3, top * 0.08], [cx, 0], 14).slice(1), ...bez([cx, 0], [w * 0.7, top * 0.08], [w, top * 0.38], [w, top], 14).slice(1), [w, h]];
    }
    case "ogee": {
      // قوس بصلي: منحنى S من كل جانب يلتقيان في قمة مدبّبة
      const top = Math.min(h * 0.5, w * 0.75);
      return [[0, h], [0, top], ...bez([0, top], [w * 0.1, top * 0.25], [w * 0.3, top * 0.45], [cx, 0], 14).slice(1), ...bez([cx, 0], [w * 0.7, top * 0.45], [w * 0.9, top * 0.25], [w, top], 14).slice(1), [w, h]];
    }
    case "horseshoe": {
      // قوس حدوة: دائرة تزيد على نصفها فتضيق عند القاعدة
      const r = w / 2, phi = 0.42, yc = Math.min(h * 0.5, r + 2);
      const a = arc(cx, yc, r, r, Math.PI - phi, 2 * Math.PI + phi, 40);
      return [[a[a.length - 1][0], h], ...a.slice().reverse().map((q) => q).reverse(), [a[0][0], h]].map(([x, y]) => [Math.min(w, Math.max(0, x)), Math.min(h, Math.max(0, y))] as Pt);
    }
    case "hexagon":
      return [[w * 0.25, 0], [w * 0.75, 0], [w, cy], [w * 0.75, h], [w * 0.25, h], [0, cy]];
    case "hexagonTall":
      return [[cx, 0], [w, h * 0.25], [w, h * 0.75], [cx, h], [0, h * 0.75], [0, h * 0.25]];
    case "octagon": {
      const c = Math.min(w, h) * 0.29;
      return [[c, 0], [w - c, 0], [w, c], [w, h - c], [w - c, h], [c, h], [0, h - c], [0, c]];
    }
    case "pentagon":
      return ngon(cx, cy, w / 2, h / 2, 5).map(([x, y]) => [x, y + (h / 2 - (h / 2) * Math.cos(Math.PI / 5)) / 2]);
    case "diamond":
      return [[cx, 0], [w, cy], [cx, h], [0, cy]];
    case "trapezoid":
      return [[w * 0.12, 0], [w * 0.88, 0], [w, h], [0, h]];
    case "shield":
      return [[0, 0], [w, 0], [w, h * 0.55], ...arc(cx, h * 0.55, w / 2, h * 0.45, 0, Math.PI, 24).slice(1, -1), [0, h * 0.55]];
    case "shieldPointed":
      return [[0, 0], [w, 0], [w, h * 0.55], [cx, h], [0, h * 0.55]];
    case "badge":
      return scallopedEllipse(cx, cy, w * 0.44, h * 0.44, 12, 0.12);
    case "seal":
      return star(cx, cy, m / 2, m * 0.42, 24);
    case "medallion":
      return star(cx, cy, m / 2, m * 0.4, 12);
    case "star8":
      return star(cx, cy, m / 2, m * 0.37, 8, -Math.PI / 2);
    case "quatrefoil": {
      const r = m / 4;
      return [...arc(cx, cy - r, r, r, Math.PI * 0.75, Math.PI * 2.25, 20), ...arc(cx + r, cy, r, r, Math.PI * 1.25, Math.PI * 2.75, 20), ...arc(cx, cy + r, r, r, Math.PI * 1.75, Math.PI * 3.25, 20), ...arc(cx - r, cy, r, r, Math.PI * 0.25, Math.PI * 1.75, 20)];
    }
    case "scallopRect": {
      // فصوص نصف دائرية داخل حدود الملصق: المستطيل الداخلي منكمش بعمق الفص
      const r = Math.min(m * 0.1, 4), nx = Math.max(2, Math.round((w - 2 * r) / (2 * r))), ny = Math.max(2, Math.round((h - 2 * r) / (2 * r)));
      const x0 = r, y0 = r, iw = w - 2 * r, ih = h - 2 * r, sx = iw / nx, sy = ih / ny;
      const pts: Pt[] = [];
      for (let i = 0; i < nx; i++) pts.push(...arc(x0 + sx * (i + 0.5), y0, sx / 2, r, Math.PI, 2 * Math.PI, 6));
      for (let i = 0; i < ny; i++) pts.push(...arc(x0 + iw, y0 + sy * (i + 0.5), r, sy / 2, -Math.PI / 2, Math.PI / 2, 6));
      for (let i = nx - 1; i >= 0; i--) pts.push(...arc(x0 + sx * (i + 0.5), y0 + ih, sx / 2, r, 0, Math.PI, 6));
      for (let i = ny - 1; i >= 0; i--) pts.push(...arc(x0, y0 + sy * (i + 0.5), r, sy / 2, Math.PI / 2, 1.5 * Math.PI, 6));
      return pts;
    }
    case "ticket": {
      // تذكرة: زوايا دائرية وشقّان صغيران يفصلان كعباً على اليمين
      const r = Math.min(corner, m / 4), n = Math.min(m * 0.08, 3), xs = w * 0.72;
      return [...arc(r, r, r, r, Math.PI, 1.5 * Math.PI, 6), [xs - n, 0], ...arc(xs, 0, n, n, Math.PI, 0, 8).slice(1, -1), [xs + n, 0], ...arc(w - r, r, r, r, -Math.PI / 2, 0, 6), ...arc(w - r, h - r, r, r, 0, Math.PI / 2, 6), [xs + n, h], ...arc(xs, h, n, n, 0, -Math.PI, 8).slice(1, -1), [xs - n, h], ...arc(r, h - r, r, r, Math.PI / 2, Math.PI, 6)];
    }
    case "ticketSide": {
      const r = Math.min(h * 0.18, 5);
      return [[0, 0], [w, 0], [w, cy - r], ...arc(w, cy, r, r, -Math.PI / 2, -1.5 * Math.PI, 10).slice(1, -1), [w, cy + r], [w, h], [0, h], [0, cy + r], ...arc(0, cy, r, r, Math.PI / 2, -Math.PI / 2, 10).slice(1, -1), [0, cy - r]];
    }
    case "banner": {
      const k = Math.min(w * 0.12, h * 0.5);
      return [[0, 0], [w, 0], [w - k, cy], [w, h], [0, h], [k, cy]];
    }
    case "cartouche": {
      // كبسولة بخصر خفيف: شقّان مقعّران في منتصف الأعلى والأسفل
      const r = Math.min(h / 2, w * 0.2), n = Math.min(w * 0.09, h * 0.16);
      return [[r, 0], [cx - n * 1.6, 0], ...arc(cx, 0, n * 1.6, n, 0, Math.PI, 10).slice(1, -1).reverse().map(([x, y]) => [w - x, y] as Pt).reverse(), [cx + n * 1.6, 0], [w - r, 0], ...arc(w - r, cy, r, h / 2, -Math.PI / 2, Math.PI / 2, 16).slice(1, -1), [w - r, h], [cx + n * 1.6, h], ...arc(cx, h, n * 1.6, n, 0, -Math.PI, 10).slice(1, -1).map(([x, y]) => [x, y] as Pt), [cx - n * 1.6, h], [r, h], ...arc(r, cy, r, h / 2, Math.PI / 2, 1.5 * Math.PI, 16).slice(1, -1)];
    }
    case "tag": {
      const c = Math.min(m * 0.3, 10), r = Math.min(corner, m / 4);
      return [[c, 0], [w - r, 0], ...arc(w - r, r, r, r, -Math.PI / 2, 0, 6).slice(1), [w, h - r], ...arc(w - r, h - r, r, r, 0, Math.PI / 2, 6).slice(1), [r, h], ...arc(r, h - r, r, r, Math.PI / 2, Math.PI, 6).slice(1), [0, c]];
    }
    case "pennant": {
      const k = Math.min(w * 0.22, h / 2);
      return [[0, 0], [w, 0], [w - k, cy], [w, h], [0, h]];
    }
    case "chevron": {
      const k = Math.min(h * 0.22, w / 2);
      return [[0, 0], [w, 0], [w, h - k], [cx, h], [0, h - k]];
    }
    case "waveTop": {
      const amp = Math.min(h * 0.07, 4);
      return [...wave(0, w, amp * 1.2, amp, 1.5), [w, h], [0, h]];
    }
    case "waveBottom": {
      const amp = Math.min(h * 0.07, 4);
      return [[0, 0], [w, 0], ...wave(w, 0, h - amp * 1.2, amp, 1.5)];
    }
    case "leaf":
      return [...arc(cx - w * 0.5, cy + h * 0.5, w, h, -Math.PI / 2, 0, 28), ...arc(cx + w * 0.5, cy - h * 0.5, w, h, Math.PI / 2, Math.PI, 28)];
    case "teardrop": {
      // قطرة: قمة مدبّبة تهبط بمماسّين إلى دائرة سفلية داخل الحدود
      const r = Math.min(w / 2, h * 0.42), cyd = h - r;
      const a = Math.acos(Math.min(1, r / cyd));
      return [[cx, 0], ...arc(cx, cyd, r, r, -Math.PI / 2 + a, 1.5 * Math.PI - a, 40)];
    }
  }
}

/** مسار الشكل على لوحة رسم: من النقاط نفسها التي تُقص بها الطباعة */
export function shapePath(ctx: CanvasRenderingContext2D, shape: LabelShape, x: number, y: number, w: number, h: number, cornerPx: number) {
  const pts = shapePoints(shape, w, h, cornerPx);
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(x + px, y + py) : ctx.moveTo(x + px, y + py)));
  ctx.closePath();
}

/** مساحة المضلّع (موجبة) — للاختبارات ولحساب هدر القص */
export function shapeArea(pts: Pt[]) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}
