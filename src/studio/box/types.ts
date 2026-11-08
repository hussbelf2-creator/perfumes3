import type { Bi } from "@/i18n/context";
import type { Foil, FontId } from "../label/types";
import type { BoxStructure } from "@/lib/packaging";

export type Board = "white" | "cream" | "kraft" | "black" | "custom";
export type BoxFinish = "matte" | "gloss" | "soft";

export interface BoxDesign {
  style: BoxStyle;
  /** المقاسات الداخلية بالمليمتر: الطول (الواجهة) × العمق × الارتفاع */
  L: number;
  W: number;
  H: number;
  board: Board;
  customColor: string;
  /** لون البطانة الداخلية */
  interior: string;
  finish: BoxFinish;
  foil: Foil;
  /** خط ذهبي حول الواجهة */
  frame: boolean;
  brand: string;
  name: string;
  details: string;
  font: FontId;
  /** يُستخدم شعار الملصق (إن وُجد) على الواجهة */
  useLogo: boolean;
  /** الكمية لتقدير السعر (اختياري في التصاميم القديمة) */
  qty?: number;
  /** ملحقات التغليف (بطاقة شكر، حشوة…) — معرّفاتها في studio/spec.ts */
  extras?: string[];
  /** تأثيرات العلبة (بروز، UV، نافذة…) — معرّفاتها في studio/spec.ts */
  effects?: string[];
  /** هيكل القالب من مكتبة ECMA/FEFCO (lib/packaging) — غيابه يعني المقابل التلقائي لنوع العلبة */
  structure?: BoxStructure | null;
}

export const DEFAULT_QTY = 1000;

export type Family = "folding" | "rigid" | "corr" | "tube";
export type StyleGroup = "folding" | "shapes" | "rigid" | "slide" | "shipping" | "retail";
/** كيف يُشتق المقاس الداخلي من العبوة */
export type FitKind = "box" | "round" | "drawer" | "cube" | "band" | "wide" | "lying";

export type BoxStyle =
  | "tuck" | "ste" | "window" | "doubleWindow" | "hang" | "hangWindow" | "sleeve" | "sleeveWindow" | "band" | "sealEnd" | "fullOverlap" | "crash" | "gable" | "handle" | "cube" | "tuckTray" | "foldTray" | "bookSleeve"
  | "hexagon" | "hexWindow" | "octagon" | "pentagon" | "triangle"
  | "rigid" | "telescope" | "magnetic" | "clamshell" | "shoulder" | "rigidWindow" | "discovery" | "neckMagnetic"
  | "drawer" | "drawerWindow" | "rigidDrawer" | "doubleDrawer" | "tube" | "tubeTele"
  | "mailer" | "mailerWindow" | "rsc"
  | "display";

export interface StyleMeta {
  id: BoxStyle;
  group: StyleGroup;
  family: Family;
  fit: FitKind;
  /** المرجع الصناعي (ECMA/FEFCO) أو وصف قياسي */
  code: string;
  icon: string;
  name: Bi;
  note: Bi;
}

export const STYLE_GROUPS: { id: StyleGroup; name: Bi; note: Bi }[] = [
  { id: "folding", name: { ar: "علب مطوية (كرتون مقوّى)", en: "Folding cartons" }, note: { ar: "الأوفر والأسرع — من 500 علبة", en: "Most economical and fastest — from 500" } },
  { id: "shapes", name: { ar: "أشكال هندسية", en: "Geometric shapes" }, note: { ar: "ثلاثية إلى ثمانية الأوجه — تمييز على الرف", en: "Three to eight faces — shelf stand-out" } },
  { id: "rigid", name: { ar: "علب صلبة (كرتون رمادي مغلّف)", en: "Rigid boxes" }, note: { ar: "الفخامة والوزن — من 300 علبة", en: "Premium weight and feel — from 300" } },
  { id: "slide", name: { ar: "درج وأسطوانة", en: "Drawers & tubes" }, note: { ar: "تجربة فتح مختلفة", en: "A different opening ritual" } },
  { id: "shipping", name: { ar: "كرتون مضلّع وشحن", en: "Corrugated & shipping" }, note: { ar: "للتجارة الإلكترونية وكرتون التصدير", en: "E-commerce and export cartons" } },
  { id: "retail", name: { ar: "عرض وأطقم", en: "Display & sets" }, note: { ar: "نقطة البيع وأطقم الاكتشاف", en: "Point of sale and discovery sets" } },
];

const S = (id: BoxStyle, group: StyleGroup, family: Family, fit: FitKind, code: string, icon: string, ar: string, en: string, nAr: string, nEn: string): StyleMeta => ({ id, group, family, fit, code, icon, name: { ar, en }, note: { ar: nAr, en: nEn } });

// الأسماء العربية مختارة بحيث لا يتشابه نوعان في كلمة مميزة واحدة (تُستخدم في الاختبارات والبحث)
export const STYLES: StyleMeta[] = [
  // ── علب مطوية
  S("tuck", "folding", "folding", "box", "ECMA A20.20.03 (R)", "ri-box-3-line", "علبة بلسان (Tuck End)", "Reverse tuck end", "كرتون مقوّى 350 غم — الأوفر والأسرع إنتاجاً", "350 gsm folding carton — the most economical"),
  S("ste", "folding", "folding", "box", "ECMA A20.20.03", "ri-box-2-line", "لسان مستقيم (STE)", "Straight tuck (STE)", "اللسانان من الواجهة نفسها — فتح وإغلاق بالاتجاه ذاته", "Both tucks on the front — open and close the same way"),
  S("window", "folding", "folding", "box", "ECMA A20 + window", "ri-window-line", "علبة بنافذة عرض", "Window carton", "فتحة على الواجهة تُظهر الزجاجة — مع أو بدون فيلم شفاف", "A front cut-out shows the bottle — with or without a clear film"),
  S("doubleWindow", "folding", "folding", "box", "ECMA A20 + 2 windows", "ri-layout-column-line", "نافذتان أمام وخلف", "Double window", "فتحتان متقابلتان يمرّ الضوء عبر الزجاجة", "Two opposite cut-outs let light pass through the bottle"),
  S("hang", "folding", "folding", "box", "ECMA A20 + Euro slot", "ri-bookmark-line", "علبة تعليق (Euro hook)", "Hang-tab carton", "بلسان وفتحة أوروبية للتعليق على خطّاف الرف — للترافل", "Tab with a Euro slot for peg hooks — travel sizes"),
  S("hangWindow", "folding", "folding", "box", "ECMA A20 + slot + window", "ri-bookmark-3-line", "لسان تعليق بنافذة", "Hang tab + window", "تعليق على الرف مع إظهار المنتج", "Peg-hook display that also shows the product"),
  S("sleeve", "folding", "folding", "box", "ECMA B10", "ri-layout-row-line", "علبة غلاف (Sleeve)", "Open sleeve", "غلاف مفتوح الطرفين بفتحة إبهام — للعينات والأطقم وفوق علبة داخلية", "Open-ended sleeve with a thumb notch — samples, sets, or over an inner box"),
  S("sleeveWindow", "folding", "folding", "box", "ECMA B10 + window", "ri-layout-top-line", "غلاف بنافذة", "Sleeve with window", "غلاف مفتوح بفتحة عرض على الواجهة", "Open sleeve with a front cut-out"),
  S("band", "folding", "folding", "band", "Belly band", "ri-subtract-line", "حزام ورقي (Belly band)", "Belly band", "شريط يلتف حول العلبة أو الطقم — للتمييز والختم", "A band wrapped around a box or set — branding and tamper seal"),
  S("sealEnd", "folding", "folding", "box", "ECMA A20.21", "ri-archive-stack-line", "ألسنة غراء (Seal End)", "Seal end carton", "يُغلق بالغراء من الطرفين على خط التعبئة الآلي", "Glued at both ends on an automatic line"),
  S("fullOverlap", "folding", "folding", "box", "ECMA A20.22", "ri-stack-overflow-line", "تراكب كامل (Full overlap)", "Full-overlap seal end", "ألسنة بعمق العمق كله — أقوى حماية للزجاج الثقيل", "Flaps the full depth — the strongest end for heavy glass"),
  S("crash", "folding", "folding", "box", "ECMA A60.20", "ri-lock-2-line", "قاعدة قفل ذاتي (Crash lock)", "Crash-lock bottom", "قاعدة 1-2-3 تُغلق بضغطة — للتعبئة السريعة", "1-2-3 base that snaps shut — for fast lines"),
  S("gable", "folding", "folding", "box", "ECMA A50 gable", "ri-home-5-line", "سقف جملوني بمقبض (Gable)", "Gable top", "سقف مائل بمقبض علوي — علبة هدية تُحمل", "A pitched top with a carry handle — a gift box you carry"),
  S("handle", "folding", "folding", "box", "ECMA A20 + handle", "ri-handbag-line", "علبة بمقبض حمل", "Carry-handle carton", "مقبض يقوم فوق الغطاء — للأطقم الثقيلة", "A handle rises above the lid — for heavier sets"),
  S("cube", "folding", "folding", "cube", "ECMA A20 cube", "ri-checkbox-blank-line", "مكعّب هدية", "Gift cube", "علبة متساوية الأضلاع حول الزجاجة — للعطور العريضة والشموع", "An equal-sided box around the bottle — wide bottles and candles"),
  S("tuckTray", "folding", "folding", "lying", "ECMA C tray", "ri-inbox-line", "صينية مطوية مفتوحة", "Folding tray", "صينية بلا غطاء من كرتون مقوّى — للعرض والأطقم", "A lidless folding-board tray — display and sets"),
  S("foldTray", "folding", "folding", "lying", "ECMA C + hinged lid", "ri-inbox-archive-line", "صينية مطوية بغطاء متصل", "Folding tray with hinged lid", "صينية وغطاء من قطعة واحدة بشفة أمامية", "Tray and lid in one piece with a front lip"),
  S("bookSleeve", "folding", "folding", "box", "ECMA A20 + B10", "ri-book-2-line", "علبة داخلية بغلاف خارجي", "Inner box + outer sleeve", "قطعتان: علبة بلسان داخل غلاف منزلق مطبوع — طبقتان للعلامة", "Two pieces: a tuck box inside a printed sleeve — two brand layers"),
  // ── أشكال هندسية
  S("hexagon", "shapes", "folding", "round", "ECMA hexagonal", "ri-hexagon-line", "علبة سداسية الأوجه", "Hexagonal carton", "ست أوجه بغطاء مدسوس — مظهر فاخر للعود", "Six faces with a tuck lid — a premium oud look"),
  S("hexWindow", "shapes", "folding", "round", "ECMA hexagonal + window", "ri-shape-line", "سداسية بنافذة", "Hexagon with window", "سداسية بفتحة عرض على الوجه الأمامي", "Hexagon with a front cut-out"),
  S("octagon", "shapes", "folding", "round", "ECMA octagonal", "ri-octagon-line", "علبة ثمانية الأوجه", "Octagonal carton", "ثمانية أوجه تقترب من الدائرة — مظهر التيوب بسعر الكرتون", "Eight faces close to a cylinder — a tube look at carton cost"),
  S("pentagon", "shapes", "folding", "round", "ECMA pentagonal", "ri-pentagon-line", "علبة خماسية الأوجه", "Pentagonal carton", "خمسة أوجه — شكل نادر للإصدارات المحدودة", "Five faces — a rare form for limited editions"),
  S("triangle", "shapes", "folding", "round", "ECMA triangular", "ri-triangle-line", "علبة ثلاثية الأوجه", "Triangular carton", "منشور ثلاثي للعينات والترافل", "A triangular prism for samples and travel sizes"),
  // ── صلبة
  S("rigid", "rigid", "rigid", "box", "Rigid lid & base", "ri-archive-line", "علبة صلبة بغطاء", "Rigid lid & base", "كرتون رمادي 2 مم مغلّف بورق مطبوع", "2 mm greyboard wrapped in printed paper"),
  S("telescope", "rigid", "rigid", "box", "Rigid telescope", "ri-archive-2-line", "صلبة تلسكوبية", "Telescope rigid box", "غطاء بعمق القاعدة كله — يُسحب كاملاً", "A lid as deep as the base — slides fully off"),
  S("magnetic", "rigid", "rigid", "box", "Rigid hinged (magnetic)", "ri-magnet-line", "علبة مغناطيسية", "Magnetic closure", "غطاء متصل يُغلق بمغناطيس — الأكثر فخامة", "Hinged lid with a magnet — the most premium"),
  S("clamshell", "rigid", "rigid", "box", "Rigid clamshell", "ri-book-open-line", "صلبة صدفية (Clamshell)", "Clamshell rigid box", "غطاء مفصلي بعمق القاعدة يُفتح كالكتاب", "A hinged lid as deep as the base that opens like a book"),
  S("shoulder", "rigid", "rigid", "box", "Rigid shoulder / neck", "ri-stack-line", "صلبة بكتف (Shoulder)", "Shoulder box", "عنق داخلي يظهر بين القاعدة والغطاء — طابع الدور الفرنسية", "An inner neck shows between base and lid — the French-house look"),
  S("neckMagnetic", "rigid", "rigid", "box", "Rigid neck + magnet", "ri-magnet-fill", "كتف مع غطاء مغناطيسي", "Neck + magnetic lid", "عنق داخلي وغطاء متصل بمغناطيس — جمع الفخامتين", "An inner neck with a hinged magnetic lid"),
  S("rigidWindow", "rigid", "rigid", "box", "Rigid lid + window", "ri-window-2-line", "صلبة بنافذة في الغطاء", "Rigid box with lid window", "فتحة في الغطاء الصلب تُظهر الزجاجة", "A cut-out in the rigid lid shows the bottle"),
  S("discovery", "rigid", "rigid", "wide", "Rigid discovery tray", "ri-flask-line", "طقم اكتشاف صلب", "Rigid discovery set", "قاعدة عريضة منخفضة لعدة قوارير مع غطاء", "A wide shallow base for several vials with a lid"),
  // ── درج وأسطوانة
  S("drawer", "slide", "folding", "drawer", "Drawer (tray + sleeve)", "ri-archive-drawer-line", "علبة درج", "Drawer (sleeve & tray)", "غلاف خارجي ودرج ينزلق — تجربة فتح مميزة", "Outer sleeve with a sliding tray"),
  S("drawerWindow", "slide", "folding", "drawer", "Drawer + window", "ri-slideshow-line", "درج بنافذة", "Drawer with window", "غلاف بفتحة علوية تُظهر محتوى الدرج", "A sleeve with a top cut-out showing the drawer"),
  S("rigidDrawer", "slide", "rigid", "drawer", "Rigid drawer", "ri-archive-drawer-fill", "درج صلب", "Rigid drawer", "درج وغلاف من كرتون رمادي مغلّف — وزن وفخامة", "Tray and sleeve in wrapped greyboard — weight and luxury"),
  S("doubleDrawer", "slide", "folding", "drawer", "Double drawer", "ri-layout-grid-line", "درج مزدوج", "Double drawer", "درجان فوق بعضهما في غلاف واحد — للعطر ودهنه", "Two trays stacked in one sleeve — perfume and oil"),
  S("tube", "slide", "tube", "round", "Paper tube", "ri-database-2-line", "أسطوانة ورقية", "Paper tube", "أنبوب كرتوني بغطاء — مناسب للهدايا", "Cardboard tube with lid — great for gifting"),
  S("tubeTele", "slide", "tube", "round", "Telescope tube", "ri-capsule-line", "تيوب تلسكوبي", "Telescope tube", "غطاء بنصف الارتفاع ينزلق على الجسم", "A half-height lid sliding over the body"),
  // ── مضلّع وشحن
  S("mailer", "shipping", "corr", "lying", "FEFCO 0427", "ri-truck-line", "علبة شحن بغطاء (0427)", "Mailer box (FEFCO 0427)", "كرتون مضلّع بغطاء متصل ولسان أمامي — للتجارة الإلكترونية", "Corrugated with a hinged lid and front tuck — e-commerce"),
  S("mailerWindow", "shipping", "corr", "lying", "FEFCO 0427 + window", "ri-mail-open-line", "شحن بنافذة", "Mailer with window", "علبة شحن بفتحة في الغطاء", "A mailer with a cut-out in the lid"),
  S("rsc", "shipping", "corr", "box", "FEFCO 0201", "ri-box-1-line", "كرتون التصدير (0201)", "Shipping carton (FEFCO 0201)", "الكرتون الرئيسي: أربعة جدران وألسنة متقابلة", "The master carton: four walls and meeting flaps"),
  // ── عرض وأطقم
  S("display", "retail", "folding", "wide", "Counter display", "ri-store-2-line", "صينية عرض بلوح خلفي", "Counter display tray", "صينية لعدة زجاجات بلوح مطبوع خلفها — لنقطة البيع", "A tray for several bottles with a printed header — point of sale"),
];
export const STYLE_IDS = STYLES.map((s) => s.id) as BoxStyle[];
export const styleById = (id: BoxStyle) => STYLES.find((s) => s.id === id) ?? STYLES[0];

export const BOARDS: Record<Exclude<Board, "custom">, { name: Bi; color: string; edge: string }> = {
  white: { name: { ar: "أبيض", en: "White" }, color: "#f6f4ef", edge: "#ece8df" },
  cream: { name: { ar: "كريمي", en: "Cream" }, color: "#efe4cf", edge: "#e2d6bf" },
  kraft: { name: { ar: "كرافت", en: "Kraft" }, color: "#b98f62", edge: "#a07a51" },
  black: { name: { ar: "أسود", en: "Black" }, color: "#1b1a19", edge: "#2a2826" },
};

export const FINISHES: { id: BoxFinish; name: Bi; roughness: number; clearcoat: number }[] = [
  { id: "matte", name: { ar: "مطفأ", en: "Matte" }, roughness: 0.82, clearcoat: 0 },
  { id: "soft", name: { ar: "ملمس مخملي", en: "Soft-touch" }, roughness: 0.95, clearcoat: 0 },
  { id: "gloss", name: { ar: "لامع", en: "Gloss" }, roughness: 0.35, clearcoat: 0.6 },
];

export const boardColor = (d: Pick<BoxDesign, "board" | "customColor">) => (d.board === "custom" ? d.customColor : BOARDS[d.board].color);

/** سماكة الخامة بالمليمتر لكل نوع */
const FAMILY_T: Record<Family, number> = { folding: 0.45, rigid: 2, corr: 1.5, tube: 1.5 };
export const THICKNESS: Record<BoxStyle, number> = Object.fromEntries(STYLES.map((s) => [s.id, s.id === "drawer" || s.id === "drawerWindow" || s.id === "doubleDrawer" ? 0.6 : FAMILY_T[s.family]])) as Record<BoxStyle, number>;

export const LIMITS = { min: 20, max: 400 };
/** العلب المطوية من الكرتون المقوّى (مقاس داخلي ضيّق، سماكة رقيقة) */
export const FOLDING: BoxStyle[] = STYLES.filter((s) => s.family === "folding").map((s) => s.id);
/** العلب المغلّفة: حوافها بلون ورق التغليف وتُباع بحشوة */
export const WRAPPED: BoxStyle[] = STYLES.filter((s) => s.family === "rigid").map((s) => s.id);
/** الأشكال الدائرية والمضلّعة: مقاس واحد (القطر أو العرض بين الوجوه) */
export const ROUND: BoxStyle[] = STYLES.filter((s) => s.fit === "round").map((s) => s.id);

export function defaultBox(fit?: { w: number; d: number; h: number }): BoxDesign {
  return {
    style: "tuck",
    ...fitFor("tuck", fit ?? { w: 52, d: 36, h: 120 }),
    board: "black",
    customColor: "#3b2f2a",
    interior: "#f1ece2",
    finish: "soft",
    foil: "gold",
    frame: true,
    brand: "Maison",
    name: "عود الليل",
    details: "Eau de Parfum · 50 ml",
    font: "playfair",
    useLogo: true,
  };
}

/** المقاس الداخلي المناسب للعبوة لكل نوع (مع هامش للحشوة) — الدرج يستلقي فيه المنتج */
export function fitFor(style: BoxStyle, f: { w: number; d: number; h: number }): Pick<BoxDesign, "L" | "W" | "H"> {
  const r = (n: number) => Math.min(LIMITS.max, Math.max(LIMITS.min, Math.round(n)));
  const meta = styleById(style);
  const pad = meta.family === "folding" ? 3 : meta.family === "corr" ? 8 : 10;
  switch (meta.fit) {
    case "drawer":
      // يستلقي فيه المنتج: الطول = محور الانزلاق
      return { L: r(f.h + 8), W: r(f.w + 8), H: r(f.d + 6) };
    case "round":
      // القطر أو العرض بين الوجوه المتقابلة يحتضن قطر العبوة
      return { L: r(Math.max(f.w, f.d) + (style === "tube" || style === "tubeTele" ? 4 : 6)), W: r(Math.max(f.w, f.d) + (style === "tube" || style === "tubeTele" ? 4 : 6)), H: r(f.h + (meta.family === "tube" ? 6 : 4)) };
    case "cube": {
      const side = Math.max(f.w, f.d, f.h) + 6;
      return { L: r(side), W: r(side), H: r(side) };
    }
    case "band":
      // حزام حول العلبة: الارتفاع ثلث العبوة
      return { L: r(f.w + 3), W: r(f.d + 3), H: r(Math.max(20, f.h * 0.3)) };
    case "wide":
      // صينية عريضة لثلاث عبوات جنباً إلى جنب
      return { L: r(f.w * 3 + 4 * 6), W: r(f.d + 10), H: r(style === "display" ? Math.max(25, f.h * 0.45) : f.h + 8) };
    case "lying":
      // يستلقي المنتج في صينية منخفضة
      return { L: r(f.h + pad + 4), W: r(f.w + pad + 4), H: r(f.d + pad) };
    default:
      return { L: r(f.w + pad), W: r(f.d + pad), H: r(f.h + pad) };
  }
}
