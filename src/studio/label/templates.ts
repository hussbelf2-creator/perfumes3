import type { Bi } from "@/i18n/context";
import type { PackModel } from "../types";
import { labelZone, perimeter } from "./geometry";
import type { LabelDesign, LabelText } from "./types";

// قوالب جاهزة في مجموعات: نقطة بداية يعدّلها العميل. المقاسات تُحسب من شكل العبوة نفسها،
// وبجانبها «قوالبي»: ما يحفظه العميل من تصاميمه، وقالب خاص يرفعه ملفاً جاهزاً (customTemplates.ts).

export type TemplateGroup = "minimal" | "arabic" | "luxury" | "modern" | "natural";
export type TemplateId =
  | "minimal" | "mono" | "swiss"
  | "classic" | "calligraphy" | "andalus"
  | "luxury" | "noir" | "emerald"
  | "modern" | "coral" | "editorial"
  | "botanical" | "linen" | "apothecary";

export const TEMPLATE_GROUPS: { id: TemplateGroup; name: Bi }[] = [
  { id: "minimal", name: { ar: "بسيطة", en: "Minimal" } },
  { id: "arabic", name: { ar: "عربية وتراثية", en: "Arabic & heritage" } },
  { id: "luxury", name: { ar: "فاخرة", en: "Luxury" } },
  { id: "modern", name: { ar: "عصرية", en: "Modern" } },
  { id: "natural", name: { ar: "طبيعية", en: "Natural" } },
];

export const TEMPLATES: { id: TemplateId; group: TemplateGroup; name: Bi; swatch: [string, string] }[] = [
  { id: "minimal", group: "minimal", name: { ar: "بسيط", en: "Minimal" }, swatch: ["#fbfaf7", "#151515"] },
  { id: "mono", group: "minimal", name: { ar: "أحادي أسود", en: "Mono black" }, swatch: ["#151515", "#fbfaf7"] },
  { id: "swiss", group: "minimal", name: { ar: "شبكي سويسري", en: "Swiss grid" }, swatch: ["#fbfaf7", "#c2612f"] },
  { id: "classic", group: "arabic", name: { ar: "كلاسيكي عربي", en: "Classic Arabic" }, swatch: ["#f1e8d6", "#3b2a1a"] },
  { id: "calligraphy", group: "arabic", name: { ar: "خطّ ديواني", en: "Calligraphic" }, swatch: ["#fbfaf7", "#1d3a5a"] },
  { id: "andalus", group: "arabic", name: { ar: "أندلسي", en: "Andalusian" }, swatch: ["#0f3b2e", "#d1a95b"] },
  { id: "luxury", group: "luxury", name: { ar: "فاخر بالذهب", en: "Gold luxury" }, swatch: ["#151515", "#d1a95b"] },
  { id: "noir", group: "luxury", name: { ar: "نوار فضي", en: "Silver noir" }, swatch: ["#1a1a1a", "#cfd2d4"] },
  { id: "emerald", group: "luxury", name: { ar: "زمردي ونحاس", en: "Emerald & copper" }, swatch: ["#123d33", "#c27c55"] },
  { id: "modern", group: "modern", name: { ar: "عصري جريء", en: "Bold modern" }, swatch: ["#c2612f", "#ffffff"] },
  { id: "coral", group: "modern", name: { ar: "مرجاني", en: "Coral" }, swatch: ["#e4612e", "#15101d"] },
  { id: "editorial", group: "modern", name: { ar: "تحريري", en: "Editorial" }, swatch: ["#fbfaf7", "#15101d"] },
  { id: "botanical", group: "natural", name: { ar: "طبيعي كرافت", en: "Kraft botanical" }, swatch: ["#c19a6b", "#2e2418"] },
  { id: "linen", group: "natural", name: { ar: "كتّان", en: "Linen" }, swatch: ["#efe6d3", "#4f5b3a"] },
  { id: "apothecary", group: "natural", name: { ar: "صيدلية قديمة", en: "Apothecary" }, swatch: ["#f1e8d6", "#5a3a1f"] },
];
export const isTemplateId = (id: unknown): id is TemplateId => TEMPLATES.some((x) => x.id === id);

const text = (id: LabelText["id"], t: string, o: Partial<LabelText>): LabelText => ({
  id,
  text: t,
  font: "readex",
  sizeMm: 5,
  weight: 400,
  color: "#151515",
  foil: "none",
  y: 0.5,
  trackingMm: 0,
  ...o,
});

/** المقاس الافتراضي: نحو ثلث المحيط عرضاً، ونصف منطقة الجسم ارتفاعاً */
export function defaultSize(bottle: PackModel) {
  const z = labelZone(bottle.profile, bottle.neckMm);
  const per = perimeter(z.radius, bottle.squareness, bottle.depthRatio);
  // في العبوات المسطحة الواجهة هي العرض كاملاً: نأخذ 80% من عرض الواجهة
  const faceWidth = bottle.section === "round" ? per * 0.36 : z.radius * 2 * 0.8;
  const widthMm = Math.round(Math.min(90, Math.max(20, faceWidth)));
  const heightMm = Math.round(Math.min(z.height * 0.62, widthMm * 1.15));
  return { widthMm, heightMm, centerYmm: Math.round(z.center * 10) / 10, zone: z, perimeter: per };
}

export function makeTemplate(id: TemplateId, bottle: PackModel, brand = "نور", name = "عود الليل"): LabelDesign {
  const { widthMm, heightMm, centerYmm } = defaultSize(bottle);
  const base: LabelDesign = {
    enabled: true,
    shape: "rect",
    widthMm,
    heightMm,
    centerYmm,
    paper: "white",
    customColor: "#e9e1d3",
    finish: "matte",
    border: { enabled: false, color: "#151515", foil: "none" },
    texts: [],
    logo: null,
  };
  const s = Math.min(widthMm, heightMm * 1.3) / 40; // مقياس الخطوط حسب حجم الملصق
  switch (id) {
    case "mono":
      return { ...base, paper: "black", shape: "rect", texts: [text("brand", brand.toUpperCase(), { font: "readex", sizeMm: 7.5 * s, weight: 700, color: "#fbfaf7", y: 0.42, trackingMm: 0.8 }), text("name", name, { font: "plex", sizeMm: 3.8 * s, color: "#d9d4ca", y: 0.62 }), text("details", "EAU DE PARFUM · 50 ML", { font: "plex", sizeMm: 2 * s, color: "#9a948a", y: 0.84, trackingMm: 0.5 })] };
    case "swiss":
      return { ...base, shape: "rect", texts: [text("brand", brand, { font: "readex", sizeMm: 9 * s, weight: 700, color: "#151515", y: 0.3 }), text("name", name, { font: "readex", sizeMm: 3.6 * s, color: "#c2612f", y: 0.52 }), text("details", "50 ML — EDP", { font: "plex", sizeMm: 2.2 * s, color: "#151515", y: 0.88, trackingMm: 0.3 })] };
    case "classic":
      return { ...base, shape: "arch", paper: "cream", border: { enabled: true, color: "#6b4b2a", foil: "none" }, texts: [text("brand", brand, { font: "amiri", sizeMm: 7.5 * s, weight: 700, color: "#3b2a1a", y: 0.38 }), text("name", name, { font: "amiri", sizeMm: 4.6 * s, color: "#3b2a1a", y: 0.6 }), text("details", "EAU DE PARFUM · 100 ML", { font: "playfair", sizeMm: 2.2 * s, color: "#6b4b2a", y: 0.82, trackingMm: 0.5 })] };
    case "calligraphy":
      return { ...base, shape: "ogee", paper: "white", border: { enabled: true, color: "#1d3a5a", foil: "none" }, texts: [text("brand", brand, { font: "reem", sizeMm: 9 * s, weight: 700, color: "#1d3a5a", y: 0.44 }), text("name", name, { font: "amiri", sizeMm: 4.2 * s, color: "#1d3a5a", y: 0.66 }), text("details", "عطر زيتي · 12 مل", { font: "amiri", sizeMm: 2.4 * s, color: "#4a5f78", y: 0.84 })] };
    case "andalus":
      return { ...base, shape: "star8", paper: "custom", customColor: "#0f3b2e", finish: "matte", border: { enabled: true, color: "#d1a95b", foil: "gold" }, texts: [text("brand", brand, { font: "reem", sizeMm: 7 * s, weight: 700, foil: "gold", y: 0.42 }), text("name", name, { font: "amiri", sizeMm: 3.8 * s, color: "#f1e8d6", y: 0.6 }), text("details", "EXTRAIT · 30 ML", { font: "playfair", sizeMm: 1.9 * s, foil: "gold", y: 0.74, trackingMm: 0.4 })] };
    case "luxury":
      return { ...base, shape: "rounded", paper: "black", finish: "gloss", border: { enabled: true, color: "#d1a95b", foil: "gold" }, texts: [text("brand", brand, { font: "reem", sizeMm: 8 * s, weight: 700, foil: "gold", y: 0.4 }), text("name", name, { font: "amiri", sizeMm: 4.4 * s, color: "#e9e1d3", y: 0.62 }), text("details", "EXTRAIT DE PARFUM", { font: "playfair", sizeMm: 2.1 * s, foil: "gold", y: 0.82, trackingMm: 0.6 })] };
    case "noir":
      return { ...base, shape: "shield", paper: "black", finish: "matte", material: "textured", border: { enabled: true, color: "#cfd2d4", foil: "silver" }, texts: [text("brand", brand.toUpperCase(), { font: "playfair", sizeMm: 7 * s, weight: 700, foil: "silver", y: 0.4, trackingMm: 0.6 }), text("name", name, { font: "playfair", sizeMm: 4 * s, color: "#e6e6e6", y: 0.6 }), text("details", "PARFUM · 75 ML", { font: "plex", sizeMm: 2 * s, foil: "silver", y: 0.78, trackingMm: 0.5 })] };
    case "emerald":
      return { ...base, shape: "medallion", paper: "custom", customColor: "#123d33", finish: "gloss", border: { enabled: true, color: "#c27c55", foil: "copper" }, texts: [text("brand", brand, { font: "playfair", sizeMm: 7 * s, weight: 700, foil: "copper", y: 0.42 }), text("name", name, { font: "amiri", sizeMm: 3.8 * s, color: "#f1e8d6", y: 0.6 }), text("details", "EDP · 50 ML", { font: "plex", sizeMm: 1.9 * s, foil: "copper", y: 0.74, trackingMm: 0.4 })] };
    case "modern":
      return { ...base, paper: "custom", customColor: "#c2612f", texts: [text("brand", brand.toUpperCase(), { font: "readex", sizeMm: 10 * s, weight: 700, color: "#ffffff", y: 0.42 }), text("name", name, { font: "readex", sizeMm: 4 * s, color: "#ffffff", y: 0.66 }), text("details", "100 ML · EDP", { font: "readex", sizeMm: 2.4 * s, color: "#fbe9de", y: 0.84, trackingMm: 0.3 })] };
    case "coral":
      return { ...base, shape: "pill", paper: "custom", customColor: "#e4612e", finish: "gloss", texts: [text("brand", brand, { font: "readex", sizeMm: 8 * s, weight: 700, color: "#15101d", y: 0.44 }), text("name", name, { font: "readex", sizeMm: 4 * s, color: "#15101d", y: 0.64 }), text("details", "EDP 50 ML", { font: "plex", sizeMm: 2.2 * s, color: "#3a2a24", y: 0.8, trackingMm: 0.3 })] };
    case "editorial":
      return { ...base, shape: "rect", paper: "white", border: { enabled: true, color: "#15101d", foil: "none" }, texts: [text("brand", brand.toUpperCase(), { font: "playfair", sizeMm: 6 * s, weight: 700, color: "#15101d", y: 0.22, trackingMm: 1 }), text("name", name, { font: "playfair", sizeMm: 7 * s, color: "#15101d", y: 0.52 }), text("details", "No. 01 · EAU DE PARFUM · 50 ML", { font: "plex", sizeMm: 2 * s, color: "#15101d", y: 0.86, trackingMm: 0.6 })] };
    case "botanical":
      return { ...base, shape: "oval", paper: "kraft", texts: [text("brand", brand, { font: "reem", sizeMm: 7 * s, weight: 700, color: "#2e2418", y: 0.4 }), text("name", name, { font: "plex", sizeMm: 4 * s, color: "#2e2418", y: 0.6 }), text("details", "NATURAL · 100 ML", { font: "plex", sizeMm: 2.2 * s, color: "#4a3a26", y: 0.76, trackingMm: 0.3 })] };
    case "linen":
      return { ...base, shape: "scallopRect", paper: "custom", customColor: "#efe6d3", material: "textured", texts: [text("brand", brand, { font: "playfair", sizeMm: 7 * s, weight: 700, color: "#4f5b3a", y: 0.4 }), text("name", name, { font: "amiri", sizeMm: 4 * s, color: "#4f5b3a", y: 0.6 }), text("details", "EAU DE TOILETTE · 100 ML", { font: "plex", sizeMm: 2 * s, color: "#6f7a5a", y: 0.8, trackingMm: 0.4 })] };
    case "apothecary":
      return { ...base, shape: "ticketSide", paper: "cream", material: "cotton", border: { enabled: true, color: "#5a3a1f", foil: "none" }, texts: [text("brand", brand.toUpperCase(), { font: "playfair", sizeMm: 6 * s, weight: 700, color: "#5a3a1f", y: 0.34, trackingMm: 0.8 }), text("name", name, { font: "amiri", sizeMm: 4.4 * s, color: "#5a3a1f", y: 0.56 }), text("details", "ELIXIR · 30 ML · EST. 2026", { font: "plex", sizeMm: 2 * s, color: "#7a5a3a", y: 0.8, trackingMm: 0.4 })] };
    default:
      return { ...base, texts: [text("brand", brand, { font: "readex", sizeMm: 7 * s, weight: 700, y: 0.4 }), text("name", name, { font: "plex", sizeMm: 4 * s, color: "#444444", y: 0.6 }), text("details", "EAU DE PARFUM · 100 ML", { font: "plex", sizeMm: 2.2 * s, color: "#666666", y: 0.8, trackingMm: 0.4 })] };
  }
}
