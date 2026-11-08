// مواصفات التصنيع في الاستوديو: ما يحتاجه المصنع فعلاً ليصنّع ما يراه العميل على الشاشة.
// - العبوة: آلية الغطاء، نوع المضخة، زخرفة الزجاج (كلها لا تغيّر المجسم بل تُرفق بالمواصفة والسعر)
// - العلبة: ملاءمة ذكية مع العبوة (النوع المناسب للحجم، وهل المقاس يحتضنها)، وملحقات التغليف
//   (بطاقة شكر، بطاقة المكوّنات، حشوة، شريط…) التي تُحسب في سعر العلبة وتصل المصنع ضمن الطلب.
import type { Bi } from "@/i18n/context";
import { ADHESIVES, EFFECTS, ENGRAVE_METHODS, ENGRAVE_POSITIONS, LABEL_SET, MATERIALS, cleanProduction, type LabelDesign , labelShapeOf } from "./label/types";
import { shapeById } from "./label/shapes";
import { printMethodById } from "@/data/printing";
import type { PackModel } from "./types";
import { LIMITS, ROUND, THICKNESS, WRAPPED, fitFor, type BoxDesign, type BoxStyle } from "./box/types";

// ─── خيارات العبوة ────────────────────────────────────────────────
export type CapMechanism = "screw" | "snap" | "magnetic" | "crimp";
export type Pump = "standard" | "fine" | "collar" | "rollon" | "dropper" | "none";
export type Decoration = "none" | "frost" | "coat" | "screen" | "uv" | "hotfoil" | "laser";

export type Mould = "catalogue" | "semi" | "private";
export type GlassWeight = "standard" | "heavy";
export interface BottleSpec {
  cap: CapMechanism;
  pump: Pump;
  deco: Decoration;
  /** مصدر الشكل: كتالوج، غطاء/طوق بقالب خاص، أو قالب زجاج خاص بالكامل */
  mould: Mould;
  /** زجاج قياسي أو قاعدة ثقيلة (وزن ولمسة فاخرة) */
  weight: GlassWeight;
}

export const MOULDS: { id: Mould; name: Bi; note: Bi; perUnit: number; setup: number; moq: number }[] = [
  { id: "catalogue", name: { ar: "شكل من الكتالوج", en: "Catalogue shape" }, note: { ar: "جاهز، من 500 قطعة، بلا تكلفة قالب", en: "Ready, from 500 pcs, no tooling" }, perUnit: 0, setup: 0, moq: 500 },
  { id: "semi", name: { ar: "غطاء أو طوق بقالب خاص", en: "Custom-mould cap or collar" }, note: { ar: "الزجاجة من الكتالوج والغطاء يميّزك — من 1,000 قطعة", en: "Catalogue bottle, a cap that's yours — from 1,000 pcs" }, perUnit: 0.8, setup: 6500, moq: 1000 },
  { id: "private", name: { ar: "قالب زجاج خاص", en: "Private glass mould" }, note: { ar: "زجاجة لا يملكها غيرك — من 5,000 قطعة و10 – 14 أسبوعاً", en: "A bottle nobody else has — from 5,000 pcs, 10 – 14 weeks" }, perUnit: 0.4, setup: 38000, moq: 5000 },
];
export const WEIGHTS: { id: GlassWeight; name: Bi; note: Bi; perUnit: number }[] = [
  { id: "standard", name: { ar: "زجاج قياسي", en: "Standard glass" }, note: { ar: "الوزن المعتاد للحجم", en: "The usual weight for the size" }, perUnit: 0 },
  { id: "heavy", name: { ar: "قاعدة ثقيلة", en: "Heavy base" }, note: { ar: "قاعدة سميكة تعطي وزناً وإحساساً فاخراً", en: "A thick base for weight and a premium feel" }, perUnit: 1.5 },
];

export const CAP_MECHANISMS: { id: CapMechanism; name: Bi; note: Bi; perUnit: number }[] = [
  { id: "screw", name: { ar: "غطاء لولبي", en: "Screw cap" }, note: { ar: "القياسي — يناسب كل الأعناق", en: "Standard — fits every neck" }, perUnit: 0 },
  { id: "snap", name: { ar: "غطاء ضغط", en: "Snap-on cap" }, note: { ar: "يُثبَّت بضغطة على طوق المضخة", en: "Presses onto the pump collar" }, perUnit: 0.6 },
  { id: "magnetic", name: { ar: "غطاء مغناطيسي", en: "Magnetic cap" }, note: { ar: "يلتقط العنق بمغناطيس — إحساس فاخر عند الفتح", en: "Snaps to the neck with a magnet — a premium feel" }, perUnit: 2.4 },
  { id: "crimp", name: { ar: "غطاء على طوق كريمب", en: "Cap over crimp collar" }, note: { ar: "مضخة مكبوسة بطوق معدني — لا تُفك ولا تتسرب", en: "Crimped pump with a metal collar — tamper-proof, leak-proof" }, perUnit: 1.1 },
];

export const PUMPS: { id: Pump; name: Bi; note: Bi; perUnit: number }[] = [
  { id: "standard", name: { ar: "مضخة رذاذ قياسية", en: "Standard spray pump" }, note: { ar: "لولبية، تُفك لإعادة التعبئة", en: "Screw-on, refillable" }, perUnit: 0 },
  { id: "fine", name: { ar: "رذاذ ناعم (Fine mist)", en: "Fine-mist pump" }, note: { ar: "غيمة أنعم وأغنى — للعطور الفاخرة", en: "A finer, richer cloud — for prestige scents" }, perUnit: 0.9 },
  { id: "collar", name: { ar: "مضخة بطوق معدني", en: "Pump with metal collar" }, note: { ar: "طوق ذهبي أو فضي ظاهر حول العنق", en: "A visible gold or silver collar at the neck" }, perUnit: 1.4 },
  { id: "rollon", name: { ar: "رول أون", en: "Roll-on" }, note: { ar: "كرة معدنية أو زجاجية — للزيوت 6 – 12 مل", en: "Metal or glass ball — for 6 – 12 ml oils" }, perUnit: 0.5 },
  { id: "dropper", name: { ar: "قطّارة", en: "Dropper" }, note: { ar: "للزيوت المركّزة والعود", en: "For concentrated oils and oud" }, perUnit: 0.8 },
  { id: "none", name: { ar: "بدون مضخة (سدادة)", en: "No pump (stopper)" }, note: { ar: "سدادة زجاجية أو فلين — للعطور التراثية", en: "Glass or cork stopper — heritage style" }, perUnit: 0.3 },
];

export const DECORATIONS: { id: Decoration; name: Bi; note: Bi; perUnit: number; setup: number }[] = [
  { id: "none", name: { ar: "بدون زخرفة", en: "No decoration" }, note: { ar: "الزجاج كما هو والملصق يحمل الهوية", en: "Plain glass; the label carries the identity" }, perUnit: 0, setup: 0 },
  { id: "frost", name: { ar: "تخشين (فروستد)", en: "Frosting" }, note: { ar: "حمض يطفئ لمعة الزجاج كلّه", en: "Acid-etched matte over the whole bottle" }, perUnit: 0.9, setup: 0 },
  { id: "coat", name: { ar: "طلاء لوني", en: "Colour coating" }, note: { ar: "رش لون كامل أو متدرج على الزجاج", en: "Full or gradient spray colour on the glass" }, perUnit: 1.3, setup: 350 },
  { id: "screen", name: { ar: "طباعة حريرية", en: "Screen printing" }, note: { ar: "لون أو لونان مباشرة على الزجاج بدل الملصق", en: "One or two colours printed on the glass instead of a label" }, perUnit: 0.7, setup: 600 },
  { id: "uv", name: { ar: "طباعة UV رقمية", en: "Digital UV print" }, note: { ar: "ألوان كاملة وتدرجات على الزجاج — بلا قوالب", en: "Full colour and gradients on glass — no plates" }, perUnit: 1.6, setup: 0 },
  { id: "hotfoil", name: { ar: "فويل حراري على الزجاج", en: "Hot foil on glass" }, note: { ar: "شعار ذهبي أو فضي معدني", en: "A metallic gold or silver mark" }, perUnit: 1.1, setup: 450 },
  { id: "laser", name: { ar: "نقش ليزر", en: "Laser engraving" }, note: { ar: "حفر دائم — للأسماء والإصدارات المحدودة", en: "Permanent etching — names and limited editions" }, perUnit: 2.2, setup: 0 },
];

export const DEFAULT_BOTTLE_SPEC: BottleSpec = { cap: "screw", pump: "standard", deco: "none", mould: "catalogue", weight: "standard" };

const oneOf = <T extends string>(list: { id: T }[], v: string | null | undefined, d: T): T => (list.some((x) => x.id === v) ? (v as T) : d);
/** من معاملات الرابط (cm, pm, dc) */
export function parseBottleSpec(get: (k: string) => string | null): BottleSpec {
  return { cap: oneOf(CAP_MECHANISMS, get("cm"), "screw"), pump: oneOf(PUMPS, get("pm"), "standard"), deco: oneOf(DECORATIONS, get("dc"), "none"), mould: oneOf(MOULDS, get("md"), "catalogue"), weight: oneOf(WEIGHTS, get("wt"), "standard") };
}
export const mouldById = (id: Mould) => MOULDS.find((x) => x.id === id)!;
export const weightById = (id: GlassWeight) => WEIGHTS.find((x) => x.id === id)!;
export const capById = (id: CapMechanism) => CAP_MECHANISMS.find((x) => x.id === id)!;
export const pumpById = (id: Pump) => PUMPS.find((x) => x.id === id)!;
export const decoById = (id: Decoration) => DECORATIONS.find((x) => x.id === id)!;

/** الإضافة لكل عبوة فوق سعر الزجاجة والغطاء القياسيين */
export const bottleSpecExtra = (s: BottleSpec) => capById(s.cap).perUnit + pumpById(s.pump).perUnit + decoById(s.deco).perUnit + mouldById(s.mould ?? "catalogue").perUnit + weightById(s.weight ?? "standard").perUnit;
/** تجهيز لمرة (قوالب) للعبوة */
export const bottleSpecSetup = (s: BottleSpec) => decoById(s.deco).setup + mouldById(s.mould ?? "catalogue").setup;

/** سطور المواصفة للملخص والطلب */
export function bottleSpecLines(s: BottleSpec, pick: (b: Bi) => string): string[] {
  const out: string[] = [];
  if (s.mould && s.mould !== "catalogue") out.push(pick(mouldById(s.mould).name));
  if (s.weight === "heavy") out.push(pick(weightById(s.weight).name));
  if (s.cap !== "screw") out.push(pick(capById(s.cap).name));
  if (s.pump !== "standard") out.push(pick(pumpById(s.pump).name));
  if (s.deco !== "none") out.push(pick(decoById(s.deco).name));
  return out;
}

// ─── ملحقات التغليف ───────────────────────────────────────────────
export type ExtraId = "thanks" | "ingredients" | "authenticity" | "tissue" | "ribbon" | "insert_eva" | "insert_pulp" | "insert_satin" | "seal" | "shrink" | "shipper" | "giftbag" | "sleeve" | "vial" | "travel" | "display";
export type ExtraGroup = "cards" | "insert" | "wrap" | "protect" | "secondary";

export const EXTRAS: { id: ExtraId; group: ExtraGroup; name: Bi; note: Bi; perUnit: number; icon: string }[] = [
  { id: "thanks", group: "cards", name: { ar: "بطاقة شكر", en: "Thank-you card" }, note: { ar: "بطاقة مطبوعة باسم الدار ورسالة قصيرة", en: "A printed card with the brand and a short message" }, perUnit: 0.45, icon: "ri-heart-3-line" },
  { id: "ingredients", group: "cards", name: { ar: "بطاقة المكوّنات (INCI)", en: "Ingredients card (INCI)" }, note: { ar: "قائمة المكوّنات والمسببات للحساسية — مطلوبة نظامياً في أغلب الأسواق إن لم تُطبع على العلبة", en: "Ingredients and allergens — required in most markets unless printed on the box" }, perUnit: 0.4, icon: "ri-file-list-3-line" },
  { id: "authenticity", group: "cards", name: { ar: "بطاقة أصالة ورقم تسلسلي", en: "Authenticity card & serial" }, note: { ar: "رقم فريد وكود QR للتحقق", en: "A unique number and QR for verification" }, perUnit: 0.6, icon: "ri-shield-check-line" },
  { id: "insert_eva", group: "insert", name: { ar: "حشوة إسفنج EVA", en: "EVA foam insert" }, note: { ar: "تجويف بشكل الزجاجة — الأكثر حماية", en: "A cavity cut to the bottle — the most protective" }, perUnit: 1.8, icon: "ri-stack-line" },
  { id: "insert_pulp", group: "insert", name: { ar: "حشوة ورق مقولب", en: "Moulded pulp insert" }, note: { ar: "قابلة لإعادة التدوير وبلون طبيعي", en: "Recyclable, natural colour" }, perUnit: 1.2, icon: "ri-leaf-line" },
  { id: "insert_satin", group: "insert", name: { ar: "بطانة ساتان", en: "Satin lining" }, note: { ar: "قماش مشدود فوق الحشوة — للعلب الصلبة", en: "Fabric stretched over the insert — rigid boxes" }, perUnit: 2.6, icon: "ri-t-shirt-line" },
  { id: "tissue", group: "wrap", name: { ar: "ورق حرير مطبوع", en: "Printed tissue paper" }, note: { ar: "يلفّ الزجاجة داخل العلبة", en: "Wraps the bottle inside the box" }, perUnit: 0.35, icon: "ri-file-paper-2-line" },
  { id: "ribbon", group: "wrap", name: { ar: "شريط ساتان", en: "Satin ribbon" }, note: { ar: "ربطة حول العلبة أو مقبض للدرج", en: "A bow around the box or a drawer pull" }, perUnit: 0.5, icon: "ri-gift-line" },
  { id: "seal", group: "protect", name: { ar: "ملصق ختم (ضمان الفتح الأول)", en: "Tamper seal sticker" }, note: { ar: "يُقطع عند أول فتح", en: "Breaks on first opening" }, perUnit: 0.15, icon: "ri-sticky-note-line" },
  { id: "shrink", group: "protect", name: { ar: "تغليف سيلوفان حراري", en: "Cellophane shrink wrap" }, note: { ar: "غلاف شفاف بشريط نزع — مطلوب في بعض المتاجر", en: "Clear film with a tear strip — required by some retailers" }, perUnit: 0.4, icon: "ri-checkbox-blank-line" },
  { id: "shipper", group: "protect", name: { ar: "كرتون شحن خارجي (12 علبة)", en: "Outer shipping carton (12 units)" }, note: { ar: "كرتون مموج مطبوع بالباركود للشحن والتخزين", en: "Corrugated, barcoded, for shipping and storage" }, perUnit: 0.55, icon: "ri-truck-line" },
  { id: "giftbag", group: "secondary", name: { ar: "حقيبة هدايا مطبوعة", en: "Printed gift bag" }, note: { ar: "ورق مقوّى بمقبض شريط، بالهوية نفسها", en: "Card stock with a ribbon handle, same identity" }, perUnit: 2.4, icon: "ri-shopping-bag-3-line" },
  { id: "sleeve", group: "secondary", name: { ar: "غلاف انكماش حول العلبة", en: "Shrink sleeve around the box" }, note: { ar: "طباعة كاملة الالتفاف أو شفافة للحماية", en: "Full-wrap print or clear for protection" }, perUnit: 0.6, icon: "ri-layout-row-line" },
  { id: "vial", group: "secondary", name: { ar: "عينة 2 مل مع كل عبوة", en: "2 ml sample vial with each bottle" }, note: { ar: "قنينة زجاجية صغيرة بملصق صغير — للهدية أو التجربة", en: "A small glass vial with a mini label — for gifting or trial" }, perUnit: 1.9, icon: "ri-test-tube-line" },
  { id: "travel", group: "secondary", name: { ar: "قنينة سفر 10 مل", en: "10 ml travel size" }, note: { ar: "رذاذ معدني قابل لإعادة التعبئة بالهوية نفسها", en: "A refillable metal atomiser in the same identity" }, perUnit: 6.5, icon: "ri-flight-takeoff-line" },
  { id: "display", group: "secondary", name: { ar: "منصة عرض للرف", en: "Shelf display" }, note: { ar: "كرتون مقوّى يعرض 6 – 12 عبوة في نقطة البيع", en: "Rigid board holding 6 – 12 bottles at the point of sale" }, perUnit: 3.2, icon: "ri-layout-top-2-line" },
];
export const EXTRA_GROUPS: { id: ExtraGroup; name: Bi }[] = [
  { id: "cards", name: { ar: "بطاقات داخل العلبة", en: "Cards inside the box" } },
  { id: "insert", name: { ar: "الحشوة", en: "Insert" } },
  { id: "wrap", name: { ar: "اللمسة", en: "Finishing touch" } },
  { id: "protect", name: { ar: "الحماية والشحن", en: "Protection & shipping" } },
  { id: "secondary", name: { ar: "التغليف الثانوي ونقطة البيع", en: "Secondary packaging & point of sale" } },
];

// ─── تأثيرات العلبة ───────────────────────────────────────────────
export type BoxEffectId = "emboss" | "spot_uv" | "window" | "textured_wrap" | "ribbon_pull" | "interior_print";
export const BOX_EFFECTS: { id: BoxEffectId; name: Bi; note: Bi; perUnit: number; setup: number }[] = [
  { id: "emboss", name: { ar: "بروز الشعار", en: "Embossed logo" }, note: { ar: "الشعار بارز أو غائر على الواجهة", en: "Logo raised or pressed on the front" }, perUnit: 0.18, setup: 420 },
  { id: "spot_uv", name: { ar: "ورنيش UV موضعي", en: "Spot UV" }, note: { ar: "لمعان على الشعار فوق سطح مطفأ", en: "Gloss on the logo over a matte surface" }, perUnit: 0.14, setup: 200 },
  { id: "window", name: { ar: "نافذة شفافة", en: "Clear window" }, note: { ar: "فتحة بفيلم شفاف تُظهر الزجاجة", en: "A film-covered cut-out showing the bottle" }, perUnit: 0.35, setup: 150 },
  { id: "textured_wrap", name: { ar: "ورق تغليف ملمس", en: "Textured wrap paper" }, note: { ar: "كتّان أو قماش أو جلد صناعي حول العلبة الصلبة", en: "Linen, cloth or faux leather over the rigid box" }, perUnit: 0.9, setup: 0 },
  { id: "ribbon_pull", name: { ar: "شريط سحب الدرج", en: "Drawer ribbon pull" }, note: { ar: "شريط ساتان يسحب الدرج", en: "A satin ribbon that pulls the tray" }, perUnit: 0.25, setup: 0 },
  { id: "interior_print", name: { ar: "طباعة البطانة الداخلية", en: "Printed interior" }, note: { ar: "نقش أو رسالة داخل العلبة تُرى عند الفتح", en: "A pattern or message inside, seen on opening" }, perUnit: 0.3, setup: 180 },
];
export const boxEffectById = (id: string) => BOX_EFFECTS.find((x) => x.id === id);
export const cleanBoxEffects = (v: unknown): BoxEffectId[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is BoxEffectId => typeof x === "string" && !!boxEffectById(x)))] : []);
export const extraById = (id: string) => EXTRAS.find((x) => x.id === id);
export const DEFAULT_EXTRA_RATES: Record<ExtraId, number> = Object.fromEntries(EXTRAS.map((x) => [x.id, x.perUnit])) as Record<ExtraId, number>;
/** قائمة ملحقات نظيفة من أي مصدر (رابط، تخزين، طلب وارد) */
export const cleanExtras = (v: unknown): ExtraId[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is ExtraId => typeof x === "string" && !!extraById(x)))] : []);
/** حشوة واحدة فقط: اختيار حشوة يستبدل الأخرى */
export function toggleExtra(list: ExtraId[], id: ExtraId): ExtraId[] {
  if (list.includes(id)) return list.filter((x) => x !== id);
  const ex = extraById(id)!;
  return [...list.filter((x) => ex.group !== "insert" || extraById(x)!.group !== "insert"), id];
}

// ─── الملاءمة الذكية بين العلبة والعبوة ───────────────────────────
export interface Fit {
  w: number;
  d: number;
  h: number;
}

/** النوع المناسب لحجم العبوة: الصغير يوفّر، والكبير يستحق علبة صلبة */
export function recommendStyle(fit: Fit, capacityMl?: number | null): { style: BoxStyle; reason: Bi } {
  const ml = capacityMl ?? 0;
  if (ml > 0 && ml <= 15) return { style: "tube", reason: { ar: "حجم عيّنة أو سفر: الأسطوانة الورقية أخف وأوفر وتحمي الزجاجة الصغيرة", en: "Sample or travel size: a paper tube is light, economical and protective" } };
  if (fit.h <= 95 || (ml > 0 && ml <= 30)) return { style: "tuck", reason: { ar: "عبوة صغيرة: علبة بلسان توفّر الكرتون والتجميع دون أن تبدو رخيصة مع تشطيب جيد", en: "A small bottle: a tuck-end box saves board and assembly, and still looks refined with a good finish" } };
  if (ml >= 100 || fit.h >= 135) return { style: "magnetic", reason: { ar: "عبوة كبيرة: العلبة المغناطيسية تحمل الوزن وتعطي تجربة فتح فاخرة تليق بالحجم", en: "A large bottle: a magnetic box carries the weight and opens like a luxury piece" } };
  return { style: "rigid", reason: { ar: "حجم المتجر الأشهر (50 مل): العلبة الصلبة توازن بين الفخامة والتكلفة", en: "The most common retail size (50 ml): a rigid box balances premium feel and cost" } };
}

export type FitLevel = "ok" | "tight" | "loose" | "snug";
export interface FitStatus {
  level: FitLevel;
  /** الفراغ حول العبوة بكل اتجاه (مم) — سالب يعني لا تدخل */
  clearance: { w: number; d: number; h: number };
  message: Bi;
}

/** هل المقاس الداخلي يحتضن العبوة؟ ضيّق لا يُصنَّع، وواسع يحتاج حشوة */
export function fitStatus(d: BoxDesign, fit: Fit): FitStatus {
  // الدرج يستلقي فيه المنتج (الطول = ارتفاع العبوة)، والأسطوانة قطرها يحتضن أكبر بُعد
  const round = ROUND.includes(d.style);
  const need = d.style === "drawer" ? { w: fit.h, d: fit.w, h: fit.d } : round ? { w: Math.max(fit.w, fit.d), d: Math.max(fit.w, fit.d), h: fit.h } : { w: fit.w, d: fit.d, h: fit.h };
  const clearance = { w: d.L - need.w, d: (round ? d.L : d.W) - need.d, h: d.H - need.h };
  const min = Math.min(clearance.w, clearance.d, clearance.h);
  const max = Math.max(clearance.w, clearance.d, clearance.h);
  if (min < 1) return { level: "tight", clearance, message: { ar: "العبوة لا تدخل في هذا المقاس — ضيّق بمقدار", en: "The bottle won't fit this size — short by" } };
  if (min < 2.5) return { level: "snug", clearance, message: { ar: "ملاصق جداً: قد يخدش الزجاج أو يعلق الغطاء. أضف 2 – 3 مم", en: "Very snug: may scratch the glass or jam the lid. Add 2 – 3 mm" } };
  if (max > 24) return { level: "loose", clearance, message: { ar: "فراغ كبير: تتحرك الزجاجة في الشحن — تحتاج حشوة أو مقاساً أصغر", en: "Too much room: the bottle will move in transit — add an insert or shrink the size" } };
  return { level: "ok", clearance, message: { ar: "المقاس يحتضن العبوة بهامش مناسب", en: "The size holds the bottle with the right margin" } };
}

/** المقاس الموصى به مع هامش يناسب النوع (كما يُنتج فعلاً) */
export const smartFit = (style: BoxStyle, fit: Fit) => fitFor(style, fit);

/** الملحقات الموصى بها لهذا التصميم والسوق */
export function recommendedExtras(d: BoxDesign, fit: Fit | null, exporting: boolean): { id: ExtraId; why: Bi }[] {
  const out: { id: ExtraId; why: Bi }[] = [];
  const status = fit ? fitStatus(d, fit) : null;
  if (WRAPPED.includes(d.style)) out.push({ id: "insert_eva", why: { ar: "العلب الصلبة تُباع بحشوة تثبّت الزجاجة في مكانها", en: "Rigid boxes ship with an insert that holds the bottle in place" } });
  else if (status?.level === "loose") out.push({ id: "insert_pulp", why: { ar: "الفراغ حول العبوة يحتاج حشوة حتى لا تتحرك", en: "The space around the bottle needs an insert" } });
  out.push({ id: "ingredients", why: exporting ? { ar: "التصدير يتطلب قائمة المكوّنات (INCI) ومسببات الحساسية مع المنتج", en: "Export markets require an INCI list and allergens with the product" } : { ar: "هيئة الغذاء والدواء تطلب قائمة المكوّنات على العبوة أو معها", en: "The SFDA requires an ingredients list on or with the pack" } });
  if (exporting) out.push({ id: "shipper", why: { ar: "الشحن الدولي يحتاج كرتوناً خارجياً بالباركود", en: "International shipping needs a barcoded outer carton" } });
  if (d.style !== "tuck") out.push({ id: "thanks", why: { ar: "لمسة صغيرة ترفع تجربة الفتح وتُشارك على السوشال", en: "A small touch that lifts the unboxing and gets shared" } });
  return out;
}

/** تكلفة الملحقات لكل علبة (من أسعار المحتوى إن وُجدت) */
export function extrasPerUnit(extras: ExtraId[] | undefined, rates: Partial<Record<ExtraId, number>> = DEFAULT_EXTRA_RATES): number {
  return (extras ?? []).reduce((s, id) => s + (rates[id] ?? DEFAULT_EXTRA_RATES[id] ?? 0), 0);
}

// ─── جاهزية الملصق للتصنيع والتسجيل ──────────────────────────────
export interface LabelCheck {
  id: "brand" | "name" | "volume" | "conc" | "fit";
  ok: boolean;
  text: Bi;
}

/** ما يجب أن يحمله الملصق قبل الطباعة والتسجيل (الحجم بالمل إلزامي، والتركيز معتاد) */
export function labelChecklist(label: LabelDesign | null, bottle: PackModel | null): LabelCheck[] {
  if (!label?.enabled) return [];
  const txt = (id: "brand" | "name" | "details") => label.texts.find((x) => x.id === id)?.text.trim() ?? "";
  const all = label.texts.map((x) => x.text).join(" ");
  const ml = /(\d+)\s*(ml|مل)/i.exec(all);
  const volumeOk = !!ml && (!bottle?.capacityMl || Number(ml[1]) === bottle.capacityMl);
  return [
    { id: "brand", ok: txt("brand").length > 0, text: { ar: "اسم الدار", en: "Brand name" } },
    { id: "name", ok: txt("name").length > 0, text: { ar: "اسم العطر", en: "Fragrance name" } },
    { id: "volume", ok: volumeOk, text: ml && !volumeOk ? { ar: `الحجم على الملصق (${ml[1]} مل) لا يطابق العبوة (${bottle?.capacityMl} مل)`, en: `Label volume (${ml[1]} ml) doesn't match the bottle (${bottle?.capacityMl} ml)` } : { ar: "الحجم بالمل (إلزامي نظامياً)", en: "Volume in ml (legally required)" } },
    { id: "conc", ok: /(edp|edt|parfum|extrait|cologne|بارفان|تواليت|إكستريه|كولونيا|زيت|oil)/i.test(all), text: { ar: "التركيز (EDP، EDT، إكستريه…)", en: "Concentration (EDP, EDT, extrait…)" } },
    { id: "fit", ok: !!bottle && label.widthMm <= Math.max(...bottle.profile.map((p) => p[0])) * 2 * Math.PI * 0.9 + 1, text: { ar: "عرض الملصق يناسب محيط العبوة", en: "Label width suits the bottle circumference" } },
  ];
}

export const clampDim = (n: number) => Math.min(LIMITS.max, Math.max(LIMITS.min, Math.round(n)));
export const wallOf = (style: BoxStyle) => THICKNESS[style];

// ─── تسعير الملصق وطقمه والنقش ─────────────────────────────────────
export interface LabelRates {
  /** الملصق الأمامي الأساسي (ورق مطلي، حبر) لكل وحدة */
  basePerUnit: number;
  /** فويل حراري لكل وحدة وكليشته لمرة */
  foilPerUnit: number;
  foilBlock: number;
  /** تجهيز القص بالشكل (مستطيل = 0) */
  dieCut: number;
}
export const DEFAULT_LABEL_RATES: LabelRates = { basePerUnit: 0.35, foilPerUnit: 0.12, foilBlock: 220, dieCut: 150 };

export interface LabelEstimate {
  qty: number;
  variable: { key: string; label: Bi; value: number }[];
  variableTotal: number;
  setup: { key: string; label: Bi; value: number }[];
  setupTotal: number;
  /** سعر الملصق (وطقمه ونقشه) لكل وحدة */
  unit: number;
  total: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** تكلفة الملصق الأمامي بخامته وتأثيراته + الطقم + النقش، لكل وحدة ثم ÷ الكمية للتجهيز */
export function estimateLabel(d: LabelDesign, qty: number, rates: LabelRates = DEFAULT_LABEL_RATES): LabelEstimate {
  const p = cleanProduction(d);
  const usesFoil = d.texts.some((t) => t.foil !== "none") || (d.logo?.foil ?? "none") !== "none" || (d.border.enabled && d.border.foil !== "none");
  // بلا اختيار صريح يُسعَّر على الرقمية (بلا تجهيز)؛ الترشيح يظهر في الواجهة ويُطبَّق حين يختاره العميل
  const method = printMethodById(d.printMethod ?? "digital");
  const variable = [
    { key: "base", label: { ar: `الملصق الأمامي (طباعة ${method.short.ar} وقص)`, en: `Front label (${method.short.en} print & cut)` }, value: rates.basePerUnit * method.unitFactor },
    ...(MATERIALS[p.material].perUnit ? [{ key: "material", label: MATERIALS[p.material].name, value: MATERIALS[p.material].perUnit }] : []),
    ...(usesFoil ? [{ key: "foil", label: { ar: "فويل حراري", en: "Hot foil" }, value: rates.foilPerUnit }] : []),
    ...p.effects.map((e) => ({ key: `fx_${e}`, label: EFFECTS[e].name, value: EFFECTS[e].perUnit })),
    ...(ADHESIVES[p.adhesive].perUnit ? [{ key: "adhesive", label: ADHESIVES[p.adhesive].name, value: ADHESIVES[p.adhesive].perUnit }] : []),
    ...p.set.map((x) => ({ key: `set_${x}`, label: LABEL_SET[x].name, value: LABEL_SET[x].perUnit })),
    ...(p.engrave.enabled ? [{ key: "engrave", label: ENGRAVE_METHODS[p.engrave.method].name, value: ENGRAVE_METHODS[p.engrave.method].perUnit }] : []),
  ].map((l) => ({ ...l, value: r2(l.value) }));
  const setup = [
    ...(shapeById(d.shape).die ? [{ key: "die", label: { ar: "قالب القص بالشكل", en: "Shaped die" }, value: rates.dieCut }] : []),
    ...(method.setup > 0 ? [{ key: "plates", label: { ar: `ألواح/كليشات ${method.short.ar}`, en: `${method.short.en} plates` }, value: method.setup }] : []),
    ...(usesFoil ? [{ key: "foilBlock", label: { ar: "كليشة الفويل", en: "Foil block" }, value: rates.foilBlock }] : []),
    ...p.effects.filter((e) => EFFECTS[e].setup > 0).map((e) => ({ key: `fxs_${e}`, label: { ar: `قالب ${EFFECTS[e].name.ar}`, en: `${EFFECTS[e].name.en} die` }, value: EFFECTS[e].setup })),
    ...(p.engrave.enabled && ENGRAVE_METHODS[p.engrave.method].setup > 0 ? [{ key: "engraveSetup", label: { ar: "تجهيز النقش", en: "Engraving setup" }, value: ENGRAVE_METHODS[p.engrave.method].setup }] : []),
  ];
  const q = Math.max(1, Math.round(qty));
  const variableTotal = r2(variable.reduce((s, l) => s + l.value, 0));
  const setupTotal = setup.reduce((s, l) => s + l.value, 0);
  const unit = r2(variableTotal + setupTotal / q);
  return { qty: q, variable, variableTotal, setup, setupTotal, unit, total: Math.round(unit * q) };
}

/** سطور خيارات الإنتاج للملخص والطلب */
export function labelProductionLines(d: LabelDesign | null, pick: (b: Bi) => string, t: (ar: string, en: string) => string): string[] {
  if (!d?.enabled) return [];
  const p = cleanProduction(d);
  const out: string[] = [];
  if (p.material !== "coated") out.push(`${t("خامة الملصق", "Label stock")}: ${pick(MATERIALS[p.material].name)}`);
  if (p.effects.length) out.push(`${t("تأثيرات", "Effects")}: ${p.effects.map((e) => pick(EFFECTS[e].name)).join("، ")}`);
  if (p.adhesive !== "permanent") out.push(`${t("لاصق", "Adhesive")}: ${pick(ADHESIVES[p.adhesive].name)}`);
  if (p.set.length) out.push(`${t("طقم الملصقات", "Label set")}: ${p.set.map((x) => pick(LABEL_SET[x].name)).join("، ")}`);
  if (p.engrave.enabled) out.push(`${t("نقش على الزجاج", "Glass engraving")}: ${pick(ENGRAVE_METHODS[p.engrave.method].name)} · ${pick(ENGRAVE_POSITIONS[p.engrave.position])}${p.engrave.text ? ` «${p.engrave.text}»` : ""}`);
  if (d.printMethod) out.push(`${t("طباعة الملصق", "Label printing")}: ${pick(printMethodById(d.printMethod).short)}`);
  if (d.artwork) out.push(t("تصميم الملصق: ملف العميل الجاهز", "Label artwork: client's finished file"));
  return out;
}

/** حقول الطلب الواردة للفريق */
export function labelProductionFields(d: LabelDesign | null): Record<string, string> {
  if (!d?.enabled) return {};
  const p = cleanProduction(d);
  const f: Record<string, string> = { label_material: p.material, label_adhesive: p.adhesive };
  if (p.effects.length) f.label_effects = p.effects.join(",");
  if (p.set.length) f.label_set = p.set.join(",");
  if (p.engrave.enabled) { f.engrave_method = p.engrave.method; f.engrave_position = p.engrave.position; if (p.engrave.text) f.engrave_text = p.engrave.text; }
  f.label_shape = labelShapeOf(d);
  if (d.artwork) f.label_artwork = d.artwork.fit;
  if (d.printMethod) f.label_print = d.printMethod;
  if (d.offsetMm) f.label_offset = String(Math.round(d.offsetMm));
  return f;
}
