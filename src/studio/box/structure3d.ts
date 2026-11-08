import { CanvasTexture, Color, DoubleSide, ExtrudeGeometry, Group, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, Path, PlaneGeometry, Shape, SRGBColorSpace } from "three";
import { FINISHES, boardColor, type BoxDesign } from "./types";
import { FOILS } from "../label/types";
import { cleanBoxEffects } from "../spec";
import { STOCKS, stockFor, structureModel, type BoxStructure, type Panel3D } from "@/lib/packaging";

// معاينة هيكل القالب مجسّماً: كل لوح من شجرة Models3D شريحة بسماكة الخامة، وكل حافة مفصل يدور
// بزاوية الطي × نسبة الطي. الخامة والتشطيب والفويل والتأثيرات من تصميم العلبة نفسه.

export interface Hinge {
  pivot: Group;
  edge: "left" | "right" | "top" | "bottom";
  angle: number;
}

const PRINTED = new Set(["front", "back", "body", "lid", "tuck", "dust", "lock", "header"]);
const RAW = new Set(["glue", "platform", "foot", "tab"]);

function panelShape(p: Panel3D): Shape {
  const s = new Shape();
  if (p.poly) {
    // مضلّع منتظم ضلعه السفلي على الحافة من (0,0) إلى (w,0) — قرص الأسطوانة
    const n = p.poly, side = p.w, R = side / (2 * Math.sin(Math.PI / n)), a = side / (2 * Math.tan(Math.PI / n));
    for (let k = 0; k < n; k++) {
      const th = -Math.PI / 2 + Math.PI / n + (2 * Math.PI * k) / n;
      const x = side / 2 + R * Math.cos(th), y = a + R * Math.sin(th);
      if (k === 0) s.moveTo(x, y);
      else s.lineTo(x, y);
    }
    s.closePath();
  } else if (p.hex) {
    const S = p.w, hh = p.h;
    s.moveTo(0, 0);
    s.lineTo(S, 0);
    s.lineTo(S * 1.5, hh / 2);
    s.lineTo(S, hh);
    s.lineTo(0, hh);
    s.lineTo(-S * 0.5, hh / 2);
    s.closePath();
  } else {
    s.moveTo(0, 0);
    s.lineTo(p.w, 0);
    s.lineTo(p.w, p.h);
    s.lineTo(0, p.h);
    s.closePath();
  }
  for (const h of p.holes) {
    const path = new Path();
    if (h.type === "circle") path.absarc(h.x, h.y, h.d / 2, 0, Math.PI * 2, true);
    else {
      const r = h.r || 0;
      path.moveTo(h.x + r, h.y);
      path.lineTo(h.x + h.w - r, h.y);
      path.quadraticCurveTo(h.x + h.w, h.y, h.x + h.w, h.y + r);
      path.lineTo(h.x + h.w, h.y + h.h - r);
      path.quadraticCurveTo(h.x + h.w, h.y + h.h, h.x + h.w - r, h.y + h.h);
      path.lineTo(h.x + r, h.y + h.h);
      path.quadraticCurveTo(h.x, h.y + h.h, h.x, h.y + h.h - r);
      path.lineTo(h.x, h.y + r);
      path.quadraticCurveTo(h.x, h.y, h.x + r, h.y);
    }
    s.holes.push(path);
  }
  return s;
}

export interface Look {
  printedColor: string;
  rawColor: string;
  rawRough: number;
  wrapped: boolean;
  roughness: number;
  clearcoat: number;
  sheen: number;
  metalness: number;
  foil: string | null;
  brand: string;
  emboss: boolean;
  spotUv: boolean;
  interior: string;
}

export function lookOf(d: BoxDesign, s: BoxStructure): Look {
  const stock = STOCKS[stockFor(s.type, d)];
  const fin = FINISHES.find((f) => f.id === d.finish) ?? FINISHES[0];
  const fx = cleanBoxEffects(d.effects);
  return {
    printedColor: boardColor(d),
    rawColor: stock.base,
    rawRough: stock.rough,
    // الكرتون الصلب مغلّف بالورق المطبوع كله؛ المطوي يُطبع على ألواحه الظاهرة فقط
    wrapped: stock === STOCKS.grey,
    roughness: d.finish === "gloss" ? 0.18 : d.finish === "soft" ? 1 : fin.roughness,
    clearcoat: d.finish === "gloss" ? 1 : 0,
    sheen: d.finish === "soft" ? 0.6 : 0,
    metalness: 0,
    foil: d.foil !== "none" ? FOILS[d.foil].color : null,
    brand: d.brand,
    emboss: fx.includes("emboss"),
    spotUv: fx.includes("spot_uv"),
    interior: d.interior,
  };
}

function textTexture(text: string): CanvasTexture | null {
  // لا لوحة رسم خارج المتصفح (اختبارات Node): يُهمَل الشعار وتبقى الهندسة
  if (typeof document === "undefined") return null;
  const cvs = document.createElement("canvas");
  cvs.width = 512;
  cvs.height = 256;
  const x = cvs.getContext("2d")!;
  x.clearRect(0, 0, 512, 256);
  x.fillStyle = "#fff";
  x.font = "bold 120px serif";
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillText(text || " ", 256, 128);
  const tex = new CanvasTexture(cvs);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** شعار بالفويل / سبوت UV / نقش بارز على الواجهة */
function decorate(g: Group, p: Panel3D, look: Look) {
  const brand = look.brand.trim();
  if (!brand) return;
  const w = p.w * 0.7, h = w / 2, cx = p.w / 2, cy = p.h * 0.62;
  const tex = look.foil || look.spotUv ? textTexture(brand) : null;
  if (tex) {
    const m = look.foil
      ? new MeshPhysicalMaterial({ color: look.foil, metalness: 1, roughness: 0.18, alphaMap: tex, transparent: true, alphaTest: 0.5 })
      : new MeshPhysicalMaterial({ color: look.printedColor, clearcoat: 1, clearcoatRoughness: 0, roughness: 0.05, alphaMap: tex, transparent: true, alphaTest: 0.5 });
    const plane = new Mesh(new PlaneGeometry(w, h), m);
    plane.position.set(cx, cy, 0.08);
    g.add(plane);
  }
  if (look.emboss) {
    // شريط مرتفع بعرض النص (تمثيل تقريبي للنقش)
    const tw = Math.min(w, (brand.length || 1) * h * 0.45), x0 = (w - tw) / 2;
    const s = new Shape();
    s.moveTo(x0, h * 0.3);
    s.lineTo(x0 + tw, h * 0.3);
    s.lineTo(x0 + tw, h * 0.7);
    s.lineTo(x0, h * 0.7);
    s.closePath();
    const em = new Mesh(new ExtrudeGeometry(s, { depth: 0.35, bevelEnabled: true, bevelSize: 0.3, bevelThickness: 0.2, bevelSegments: 2 }), new MeshPhysicalMaterial({ color: look.printedColor, roughness: 0.6 }));
    em.position.set(cx - w / 2, cy - h / 2, 0);
    g.add(em);
  }
}

function buildPanel(p: Panel3D, t: number, sg: number, look: Look, hinges: Hinge[]): Group {
  const g = new Group();
  g.name = p.id;
  const geo = new ExtrudeGeometry(panelShape(p), { depth: t, bevelEnabled: false });
  geo.translate(0, 0, -t);
  const printed = !RAW.has(p.role) && (look.wrapped || PRINTED.has(p.role));
  const col = printed ? look.printedColor : look.rawColor;
  const outer = new MeshPhysicalMaterial({ color: col, roughness: printed ? look.roughness : look.rawRough, metalness: printed ? look.metalness : 0, clearcoat: printed ? look.clearcoat : 0, clearcoatRoughness: 0.1, sheen: printed ? look.sheen : 0, sheenColor: new Color(col), side: DoubleSide });
  // الوجه الداخلي والحواف: الخامة الخام (أو البطانة في العلب الصلبة المغلّفة)
  const inner = new MeshStandardMaterial({ color: look.wrapped ? look.interior : look.rawColor, roughness: 0.95, side: DoubleSide });
  // ExtrudeGeometry: المجموعة 0 = الوجهان، 1 = الحواف
  const mesh = new Mesh(geo, [outer, inner]);
  mesh.castShadow = mesh.receiveShadow = true;
  g.add(mesh);
  if (p.role === "front") decorate(g, p, look);
  for (const c of p.children) {
    const cg = buildPanel(c.panel, t, sg, look, hinges);
    const pivot = new Group();
    const cw = c.panel.w, ch = c.panel.h;
    if (c.edge === "right") pivot.position.set(p.w, 0, 0);
    if (c.edge === "left") {
      pivot.position.set(0, 0, 0);
      cg.position.set(-cw, 0, 0);
    }
    if (c.edge === "top") pivot.position.set(0, p.h, 0);
    if (c.edge === "bottom") {
      pivot.position.set(0, 0, 0);
      cg.position.set(0, -ch, 0);
    }
    pivot.add(cg);
    g.add(pivot);
    hinges.push({ pivot, edge: c.edge, angle: (sg * c.angle * Math.PI) / 180 });
  }
  return g;
}

function applyFold(hinges: Hinge[], f: number) {
  for (const h of hinges) {
    const a = f * h.angle;
    h.pivot.rotation.set(0, 0, 0);
    if (h.edge === "right") h.pivot.rotation.y = a;
    if (h.edge === "left") h.pivot.rotation.y = -a;
    if (h.edge === "top") h.pivot.rotation.x = -a;
    if (h.edge === "bottom") h.pivot.rotation.x = a;
  }
}

/** يبني المجسم (بالمليمتر) ويعيد المفاصل؛ مستقل عن React ليُختبر في Node */
export function buildStructure(s: BoxStructure, look: Look): { group: Group; hinges: Hinge[]; note?: string; setFold: (f: number) => void } {
  const m = structureModel(s);
  const group = new Group();
  const hinges: Hinge[] = [];
  for (const part of m.parts) {
    const g = buildPanel(part.root, s.t, part.root.role === "platform" ? -1 : 1, look, hinges);
    const holder = new Group();
    holder.add(g);
    holder.position.set(part.position[0], part.position[1], part.position[2]);
    // القاعدة والمنصة تُداران لتستقرا أفقياً؛ والقطعة التي تطلب الاستلقاء (غلاف الدرج) تُدار بالاتجاه نفسه
    // حتى تُطوى إلى أعلى فوق الأرض لا تحتها
    if (part.root.role === "base" || part.root.role === "platform" || (part.rotation && part.rotation[0] !== 0)) holder.rotation.x = Math.PI / 2;
    group.add(holder);
  }
  return { group, hinges, note: m.note, setFold: (f) => applyFold(hinges, f) };
}
