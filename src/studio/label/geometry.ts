import { BufferGeometry, Float32BufferAttribute } from "three";
import { sectionPoint, smoothProfile } from "../geometry";
import type { ProfilePoint } from "../types";

// سطح الملصق ملتصق بجسم العبوة: لكل ارتفاع نسير على محيط المقطع من منتصف الواجهة
// يميناً ويساراً بطول القوس — فعرض 50 مم يبقى 50 مم على الدائري والمربع والبيضاوي.

export interface LabelPlacement {
  widthMm: number;
  heightMm: number;
  centerYmm: number;
  /** ارتفاع الملصق فوق الزجاج (يمنع التداخل البصري) */
  offsetMm?: number;
  /** إزاحة أفقية حول المحيط من منتصف الواجهة (مم، موجب = يمين المشاهد) */
  offsetXmm?: number;
  /** ميل الملصق بالدرجات */
  rotateDeg?: number;
}

export function radiusAt(p: ProfilePoint[], y: number) {
  for (let i = 1; i < p.length; i++) {
    const [r0, y0] = p[i - 1], [r1, y1] = p[i];
    if (y >= y0 && y <= y1) return r0 + (r1 - r0) * ((y - y0) / (y1 - y0 || 1));
  }
  return y < p[0][1] ? p[0][0] : p[p.length - 1][0];
}

/** طول محيط المقطع عند نصف قطر r */
export function perimeter(r: number, squareness: number, depthRatio: number, n = 720) {
  let len = 0;
  let [px, pz] = sectionPoint(0, r, r * depthRatio, squareness);
  for (let i = 1; i <= n; i++) {
    const [x, z] = sectionPoint((i / n) * Math.PI * 2, r, r * depthRatio, squareness);
    len += Math.hypot(x - px, z - pz);
    px = x;
    pz = z;
  }
  return len;
}

/**
 * جدول طول القوس من منتصف الواجهة: الواجهة عند t = 3π/2 (حيث z الموضعي = +r)،
 * والزيادة الموجبة نحو +x (يمين المشاهد).
 * أخذ عينات تكيّفي: معادلة المقطع شبه المربع تتغير بسرعة هائلة قرب منتصف الواجهة
 * (خطوة زاوية واحدة = عدة مليمترات)، فنقسم كل خطوة حتى لا يتجاوز الوتر 0.1 مم.
 */
function arcTable(r: number, sq: number, d: number, maxChord = 0.1) {
  const front = (3 * Math.PI) / 2;
  const pt = (t: number) => sectionPoint(t, r, r * d, sq);
  const ts: number[] = [front - Math.PI];
  const ss: number[] = [0];
  const N = 720;
  const refine = (t0: number, p0: [number, number], t1: number, p1: [number, number], depth: number) => {
    const chord = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    if (chord > maxChord && depth < 24) {
      const tm = (t0 + t1) / 2;
      const pm = pt(tm);
      refine(t0, p0, tm, pm, depth + 1);
      refine(tm, pm, t1, p1, depth + 1);
      return;
    }
    ts.push(t1);
    ss.push(ss[ss.length - 1] + chord);
  };
  let prevT = front - Math.PI;
  let prevP = pt(prevT);
  for (let i = 1; i <= N; i++) {
    const t = front - Math.PI + (i / N) * 2 * Math.PI;
    const p = pt(t);
    refine(prevT, prevP, t, p, 0);
    prevT = t;
    prevP = p;
  }
  // الصفر في منتصف الواجهة
  const mid = ss[ts.findIndex((t) => t >= front)];
  return { ts, ss: ss.map((v) => v - mid) };
}

function tAtArc(tab: { ts: number[]; ss: number[] }, s: number) {
  const { ts, ss } = tab;
  let lo = 0, hi = ss.length - 1;
  if (s <= ss[0]) return ts[0];
  if (s >= ss[hi]) return ts[hi];
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (ss[m] < s) lo = m;
    else hi = m;
  }
  const w = (s - ss[lo]) / (ss[hi] - ss[lo] || 1);
  return ts[lo] + (ts[hi] - ts[lo]) * w;
}

export function buildLabelGeometry(profile: ProfilePoint[], squareness: number, depthRatio: number, pl: LabelPlacement, segU = 72, segV = 24): BufferGeometry {
  const p = smoothProfile([...profile].sort((a, b) => a[1] - b[1]));
  const off = pl.offsetMm ?? 0.25;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const rot = ((pl.rotateDeg ?? 0) * Math.PI) / 180;
  const cosR = Math.cos(rot), sinR = Math.sin(rot);
  const ox = pl.offsetXmm ?? 0;
  // الإزاحة حول المحيط تُطوى على الدورة الكاملة فيعمل «الخلف» من أي جهة
  const wrapS = (s: number, per: number) => ((s % per) + per * 1.5) % per - per / 2;
  // جدول القوس مكلف: يُحسب مرة لكل نصف قطر (بدقة 0.05 مم)
  const tabs = new Map<number, ReturnType<typeof arcTable>>();
  const tableFor = (r: number) => {
    const k = Math.round(r * 20);
    let tab = tabs.get(k);
    if (!tab) {
      tab = arcTable(k / 20, squareness, depthRatio);
      tabs.set(k, tab);
    }
    return tab;
  };
  for (let j = 0; j <= segV; j++) {
    for (let i = 0; i <= segU; i++) {
      // إحداثيات الملصق المحلية (مم) حول مركزه، ثم الميل
      const lx0 = -pl.widthMm / 2 + (pl.widthMm * i) / segU;
      const ly0 = -pl.heightMm / 2 + (pl.heightMm * j) / segV;
      const lx = lx0 * cosR - ly0 * sinR, ly = lx0 * sinR + ly0 * cosR;
      const y = pl.centerYmm + ly;
      const r = radiusAt(p, y) + off;
      const tab = tableFor(r);
      const per = tab.ss[tab.ss.length - 1] - tab.ss[0];
      // لا يلتف الملصق على نفسه: حد أقصى 96% من المحيط
      const maxHalf = per * 0.48;
      const s = wrapS(Math.max(-maxHalf, Math.min(maxHalf, lx)) + ox, per);
      const t = tAtArc(tab, s);
      const [x, z] = sectionPoint(t, r, r * depthRatio, squareness);
      pos.push(x, y, -z);
      uv.push(i / segU, j / segV);
    }
  }
  const row = segU + 1;
  for (let j = 0; j < segV; j++) {
    for (let i = 0; i < segU; i++) {
      const a = j * row + i, b = a + 1, c = a + row, e = c + 1;
      idx.push(a, b, c, b, e, c);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** منطقة الجسم المناسبة للملصق: من فوق القاعدة حتى بداية الكتف */
export function labelZone(profile: ProfilePoint[], neckMm: number) {
  const p = [...profile].sort((a, b) => a[1] - b[1]);
  const h = p[p.length - 1][1];
  const maxR = Math.max(...p.map((x) => x[0]));
  let top = h - neckMm;
  // نصعد من الأسفل حتى يقل نصف القطر عن 92% من الأقصى (بداية الكتف)
  for (let y = maxR * 0.2; y < h - neckMm; y += 0.5) {
    if (y > h * 0.3 && radiusAt(p, y) < maxR * 0.92) {
      top = y;
      break;
    }
  }
  const bottom = Math.min(6, top * 0.1);
  const center = (top + bottom) / 2;
  return { bottom, top, height: top - bottom, center, radius: radiusAt(p, center) };
}
