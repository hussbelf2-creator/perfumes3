import type { Bi } from "@/i18n/context";
import { SHAPES, isShape, type LabelShape } from "./shapes";
import type { PrintMethodId } from "@/data/printing";

export { SHAPES, isShape, type LabelShape };
export type Foil = "none" | "gold" | "silver" | "copper";
export type Paper = "white" | "cream" | "kraft" | "black" | "clear" | "custom";
export type Finish = "matte" | "gloss";
export type FontId = "readex" | "plex" | "amiri" | "reem" | "playfair";

export interface LabelText {
  id: "brand" | "name" | "details";
  text: string;
  font: FontId;
  /** ارتفاع الخط بالمليمتر */
  sizeMm: number;
  weight: 400 | 700;
  color: string;
  foil: Foil;
  /** الموضع العمودي داخل الملصق 0 (أعلى) – 1 (أسفل) */
  y: number;
  /** تباعد الحروف بالمليمتر (يُتجاهل للعربية لأنه يكسر اتصال الحروف) */
  trackingMm: number;
}

// خامة الملصق وتأثيرات التشطيب وطقم الملصقات والنقش على الزجاج — تغطية كاملة لخدمات الطباعة والتزيين في المصنع
export type LabelMaterial = "coated" | "textured" | "cotton" | "pp_white" | "pp_clear" | "metallic" | "wood";
export type LabelEffect = "emboss" | "deboss" | "spot_uv" | "dome" | "laminate" | "varnish";
export type LabelAdhesive = "permanent" | "removable" | "waterproof";
export type LabelSetItem = "back" | "neck" | "seal" | "batch" | "tamper";
export type EngravePosition = "front" | "back" | "base";
/** موضع الملصق حول العبوة: الواجهة، اليمين، اليسار، الخلف، أو يلتف حولها */
export type LabelSide = "front" | "right" | "left" | "back" | "wrap";
export type EngraveMethod = "laser" | "sandblast" | "hotfoil";
export interface Engrave {
  enabled: boolean;
  text: string;
  position: EngravePosition;
  method: EngraveMethod;
  /** ارتفاع النقش عن القاعدة (مم) للواجهة والخلف؛ يُحسب تلقائياً إن غاب */
  yMm?: number;
  /** ارتفاع الحرف (مم) */
  sizeMm?: number;
}

export interface LabelDesign {
  enabled: boolean;
  shape: LabelShape;
  widthMm: number;
  heightMm: number;
  /** مركز الملصق من قاعدة العبوة بالمليمتر */
  centerYmm: number;
  /** إزاحة أفقية حول العبوة بالمليمتر من منتصف الواجهة (موجب = يمين المشاهد) */
  offsetMm?: number;
  /** ميل الملصق بالدرجات (موجب = مع عقارب الساعة) */
  rotateDeg?: number;
  /** طريقة الطباعة المختارة (تلقائية حسب الكمية والخامة إن غابت) */
  printMethod?: PrintMethodId;
  /** تصميم جاهز يرفعه العميل (قالب خاص): يُفرَش خلفيةً للملصق تحت النصوص والشعار */
  artwork?: { dataUrl: string; fit: "cover" | "contain"; hideTexts?: boolean } | null;
  paper: Paper;
  /** لون الورق عند paper = custom */
  customColor: string;
  finish: Finish;
  border: { enabled: boolean; color: string; foil: Foil };
  texts: LabelText[];
  logo: { dataUrl: string; widthMm: number; y: number; foil: Foil } | null;
  /** خامة الملصق (افتراضي: ورق مطلي) */
  material?: LabelMaterial;
  /** تأثيرات تشطيب لا تظهر كلها في المعاينة لكنها تُصنَّع وتُسعَّر */
  effects?: LabelEffect[];
  adhesive?: LabelAdhesive;
  /** ملصقات إضافية تُطبع مع الأمامي (خلفي INCI، عنق، ختم، تشغيلة، ضمان) */
  set?: LabelSetItem[];
  /** نقش مباشر على الزجاج (نص أو اسم العميل) */
  engrave?: Engrave;
}

export const PAPERS: Record<Exclude<Paper, "custom">, { name: Bi; color: string | null; swatch: string }> = {
  white: { name: { ar: "أبيض", en: "White" }, color: "#fbfaf7", swatch: "#fbfaf7" },
  cream: { name: { ar: "كريمي", en: "Cream" }, color: "#f1e8d6", swatch: "#f1e8d6" },
  kraft: { name: { ar: "كرافت", en: "Kraft" }, color: "#c19a6b", swatch: "#c19a6b" },
  black: { name: { ar: "أسود", en: "Black" }, color: "#151515", swatch: "#151515" },
  clear: { name: { ar: "شفاف (طباعة مباشرة)", en: "Clear (no-label look)" }, color: null, swatch: "repeating-linear-gradient(45deg,#fff 0 4px,#e8e8e8 4px 8px)" },
};

export const FOILS: Record<Exclude<Foil, "none">, { name: Bi; color: string }> = {
  gold: { name: { ar: "ذهبي", en: "Gold" }, color: "#d1a95b" },
  silver: { name: { ar: "فضي", en: "Silver" }, color: "#cfd2d4" },
  copper: { name: { ar: "نحاسي", en: "Copper" }, color: "#c27c55" },
};


/** مظهر الخامة في المعاينة: خشونة ومعدنية ونسيج إجرائي يُرسم فوق لون الورق */
export type MaterialTexture = "none" | "linen" | "fibre" | "brushed" | "grain";
export const MATERIALS: Record<LabelMaterial, { name: Bi; note: Bi; perUnit: number; color?: string; roughness: number; metalness: number; texture: MaterialTexture }> = {
  coated: { name: { ar: "ورق مطلي", en: "Coated paper" }, note: { ar: "القياسي — ألوان دقيقة وسعر اقتصادي", en: "Standard — accurate colour, economical" }, perUnit: 0, roughness: 0.75, metalness: 0, texture: "none" },
  textured: { name: { ar: "ورق ملمس (كتّان/قماش)", en: "Textured paper (linen/felt)" }, note: { ar: "ملمس فاخر محسوس باليد", en: "A tactile, premium feel" }, perUnit: 0.18, roughness: 0.95, metalness: 0, texture: "linen" },
  cotton: { name: { ar: "ورق قطني", en: "Cotton paper" }, note: { ar: "ناعم ومطفأ — للبراندات الطبيعية", en: "Soft and matte — natural brands" }, perUnit: 0.22, roughness: 1, metalness: 0, texture: "fibre" },
  pp_white: { name: { ar: "PP أبيض (مقاوم للماء)", en: "White PP (waterproof)" }, note: { ar: "لا يتجعّد ولا يبهت مع الزيوت", en: "Won't wrinkle or fade with oils" }, perUnit: 0.12, roughness: 0.35, metalness: 0, texture: "none" },
  pp_clear: { name: { ar: "PP شفاف", en: "Clear PP" }, note: { ar: "مظهر «بلا ملصق» على الزجاج", en: "The no-label look on glass" }, perUnit: 0.15, color: "", roughness: 0.3, metalness: 0, texture: "none" },
  metallic: { name: { ar: "ورق معدني (فضي/ذهبي)", en: "Metallic paper (silver/gold)" }, note: { ar: "لمعة معدنية كاملة أسفل الطباعة", en: "A full metallic sheen under the print" }, perUnit: 0.3, color: "#d8d2bf", roughness: 0.3, metalness: 0.85, texture: "brushed" },
  wood: { name: { ar: "قشرة خشب", en: "Wood veneer" }, note: { ar: "خشب حقيقي رقيق — للإصدارات المحدودة", en: "Real thin wood — limited editions" }, perUnit: 0.9, color: "#b98f62", roughness: 0.8, metalness: 0, texture: "grain" },
};
export const EFFECTS: Record<LabelEffect, { name: Bi; note: Bi; perUnit: number; setup: number; preview: boolean }> = {
  emboss: { name: { ar: "بروز (Embossing)", en: "Embossing" }, note: { ar: "الشعار أو الاسم بارز عن السطح", en: "Logo or name raised above the surface" }, perUnit: 0.12, setup: 350, preview: false },
  deboss: { name: { ar: "غائر (Debossing)", en: "Debossing" }, note: { ar: "الشعار مضغوط داخل الورق", en: "Logo pressed into the paper" }, perUnit: 0.12, setup: 350, preview: false },
  spot_uv: { name: { ar: "ورنيش UV موضعي", en: "Spot UV" }, note: { ar: "لمعان على الشعار فقط فوق سطح مطفأ", en: "Gloss on the logo only over a matte surface" }, perUnit: 0.1, setup: 180, preview: false },
  dome: { name: { ar: "قبّة راتنج (3D)", en: "Resin dome (3D)" }, note: { ar: "طبقة راتنج شفافة محدّبة فوق الملصق", en: "A clear convex resin layer over the label" }, perUnit: 0.45, setup: 0, preview: false },
  laminate: { name: { ar: "تغليف حماية", en: "Protective lamination" }, note: { ar: "طبقة شفافة ضد الخدش والزيوت", en: "A clear layer against scratches and oils" }, perUnit: 0.06, setup: 0, preview: false },
  varnish: { name: { ar: "ورنيش كامل", en: "Full varnish" }, note: { ar: "لمعة موحّدة وحماية خفيفة", en: "Even sheen and light protection" }, perUnit: 0.04, setup: 0, preview: false },
};
export const ADHESIVES: Record<LabelAdhesive, { name: Bi; perUnit: number }> = {
  permanent: { name: { ar: "دائم", en: "Permanent" }, perUnit: 0 },
  removable: { name: { ar: "قابل للإزالة", en: "Removable" }, perUnit: 0.03 },
  waterproof: { name: { ar: "مقاوم للماء والزيت", en: "Water & oil resistant" }, perUnit: 0.05 },
};
export const LABEL_SET: Record<LabelSetItem, { name: Bi; note: Bi; perUnit: number; icon: string }> = {
  back: { name: { ar: "ملصق خلفي (INCI)", en: "Back label (INCI)" }, note: { ar: "المكوّنات والمسببات والحجم وبلد المنشأ — مطلوب نظامياً", en: "Ingredients, allergens, volume and origin — legally required" }, perUnit: 0.14, icon: "ri-file-list-3-line" },
  neck: { name: { ar: "ملصق أو بطاقة عنق", en: "Neck label or tag" }, note: { ar: "شريط حول العنق أو بطاقة معلّقة", en: "A band around the neck or a hang tag" }, perUnit: 0.1, icon: "ri-bookmark-line" },
  seal: { name: { ar: "ختم الغطاء", en: "Cap seal" }, note: { ar: "دائرة أو شريط فوق الغطاء", en: "A disc or strip over the cap" }, perUnit: 0.06, icon: "ri-checkbox-blank-circle-line" },
  batch: { name: { ar: "ملصق التشغيلة والباركود", en: "Batch & barcode label" }, note: { ar: "رقم التشغيلة وتاريخ الإنتاج وباركود GS1 — يُطبع بالتغيّر", en: "Batch, production date and GS1 barcode — variable print" }, perUnit: 0.05, icon: "ri-barcode-line" },
  tamper: { name: { ar: "شريط ضمان الفتح الأول", en: "Tamper-evident strip" }, note: { ar: "يتمزّق عند أول فتح", en: "Tears on first opening" }, perUnit: 0.08, icon: "ri-lock-line" },
};
export const ENGRAVE_METHODS: Record<EngraveMethod, { name: Bi; note: Bi; perUnit: number; setup: number }> = {
  laser: { name: { ar: "نقش ليزر", en: "Laser engraving" }, note: { ar: "حفر دقيق دائم — مناسب للأسماء الشخصية", en: "Fine permanent etching — ideal for personal names" }, perUnit: 2.2, setup: 0 },
  sandblast: { name: { ar: "تخشين رملي", en: "Sandblasting" }, note: { ar: "نقش مطفأ أعمق للشعارات الكبيرة", en: "Deeper matte etch for larger marks" }, perUnit: 1.6, setup: 250 },
  hotfoil: { name: { ar: "فويل حراري على الزجاج", en: "Hot foil on glass" }, note: { ar: "ذهبي أو فضي معدني مباشرة على الزجاجة", en: "Metallic gold or silver straight on the bottle" }, perUnit: 1.1, setup: 450 },
};
export const ENGRAVE_POSITIONS: Record<EngravePosition, Bi> = { front: { ar: "الواجهة", en: "Front" }, back: { ar: "الخلف", en: "Back" }, base: { ar: "القاعدة", en: "Base" } };
export const ENGRAVE_MAX = 30;

const oneOf = <T extends string>(keys: readonly string[], v: unknown, d: T): T => (typeof v === "string" && keys.includes(v) ? (v as T) : d);
const many = <T extends string>(keys: readonly string[], v: unknown): T[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is T => typeof x === "string" && keys.includes(x)))] : []);
/** تنقية خيارات الإنتاج من أي مصدر (تخزين، رابط، طلب وارد) */
export function cleanProduction(d: Partial<LabelDesign>): Required<Pick<LabelDesign, "material" | "effects" | "adhesive" | "set">> & { engrave: Engrave } {
  const e = (d.engrave ?? {}) as Partial<Engrave>;
  return {
    material: oneOf(Object.keys(MATERIALS), d.material, "coated"),
    effects: many(Object.keys(EFFECTS), d.effects),
    adhesive: oneOf(Object.keys(ADHESIVES), d.adhesive, "permanent"),
    set: many(Object.keys(LABEL_SET), d.set),
    engrave: {
      enabled: !!e.enabled,
      text: String(e.text ?? "").slice(0, ENGRAVE_MAX),
      position: oneOf(Object.keys(ENGRAVE_POSITIONS), e.position, "front"),
      method: oneOf(Object.keys(ENGRAVE_METHODS), e.method, "laser"),
      ...(Number.isFinite(Number(e.yMm)) && e.yMm !== undefined ? { yMm: Math.max(0, Number(e.yMm)) } : {}),
      sizeMm: Number.isFinite(Number(e.sizeMm)) && Number(e.sizeMm) > 0 ? Math.min(20, Math.max(2, Number(e.sizeMm))) : 5,
    },
  };
}

/** شكل الملصق بعد التنقية (التصاميم المحفوظة القديمة فيها الأربعة الأولى فقط) */
export const labelShapeOf = (d: Pick<LabelDesign, "shape">): LabelShape => (isShape(d.shape) ? d.shape : "rect");
/** الجهة التي يقع عليها مركز الملصق من إزاحته حول المحيط */
export function labelSide(offsetMm: number | undefined, perimeterMm: number): LabelSide {
  const o = ((offsetMm ?? 0) % perimeterMm + perimeterMm * 1.5) % perimeterMm - perimeterMm / 2;
  const q = perimeterMm / 8;
  if (Math.abs(o) <= q) return "front";
  if (o > q && o < 3 * q) return "right";
  if (o < -q && o > -3 * q) return "left";
  return "back";
}
export const SIDE_OFFSET: Record<Exclude<LabelSide, "wrap">, number> = { front: 0, right: 0.25, left: -0.25, back: 0.5 };

/** لون سطح الملصق في المعاينة: الخامة المعدنية والخشبية تفرض لونها، وPP الشفاف يُخفي الورق */
export const paperColor = (d: Pick<LabelDesign, "paper" | "customColor"> & { material?: LabelMaterial }) => {
  if (d.material === "pp_clear") return null;
  if (d.material && MATERIALS[d.material].color) return MATERIALS[d.material].color!;
  return d.paper === "custom" ? d.customColor : PAPERS[d.paper].color;
};
export const hasArabic = (s: string) => /[؀-ۿ]/.test(s);
