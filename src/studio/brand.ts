import type { BoxDesign } from "./box/types";
import type { FontId, Foil, LabelDesign } from "./label/types";

// الهوية البصرية للعميل: شعار ولونان وخط وتشطيب معدني. تُطبَّق بضغطة على الملصق وعلى العلبة
// فيبقى المظهر النهائي متسقاً، وتُرفق مع الطلب ليتسلّمها المصمم أو الفريق.

export interface BrandKit {
  logo: string | null;
  primary: string;
  secondary: string;
  font: FontId;
  foil: Foil;
  name: string;
}

export const DEFAULT_BRAND: BrandKit = { logo: null, primary: "#15101D", secondary: "#D4A853", font: "readex", foil: "gold", name: "" };
const KEY = "pp_brand_v1";
const HEX = /^#[0-9a-f]{6}$/i;
const FONTS: FontId[] = ["readex", "plex", "amiri", "reem", "playfair"];
const FOILS: Foil[] = ["none", "gold", "silver", "copper"];

export function cleanBrand(x: unknown): BrandKit {
  const o = (x && typeof x === "object" ? x : {}) as Partial<Record<keyof BrandKit, unknown>>;
  return {
    logo: typeof o.logo === "string" && /^data:image\/(png|svg\+xml|jpeg|webp);base64,/.test(o.logo) && o.logo.length < 400_000 ? o.logo : null,
    primary: typeof o.primary === "string" && HEX.test(o.primary) ? o.primary : DEFAULT_BRAND.primary,
    secondary: typeof o.secondary === "string" && HEX.test(o.secondary) ? o.secondary : DEFAULT_BRAND.secondary,
    font: FONTS.includes(o.font as FontId) ? (o.font as FontId) : DEFAULT_BRAND.font,
    foil: FOILS.includes(o.foil as Foil) ? (o.foil as Foil) : DEFAULT_BRAND.foil,
    name: typeof o.name === "string" ? o.name.slice(0, 40) : "",
  };
}

export function loadBrand(): BrandKit | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? cleanBrand(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
export function saveBrand(b: BrandKit | null) {
  try {
    if (b) localStorage.setItem(KEY, JSON.stringify(b));
    else localStorage.removeItem(KEY);
  } catch {
    /* التخزين معطّل: تبقى الهوية في الجلسة فقط */
  }
}

const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
/** حبر مقروء فوق لون ما */
export const inkOn = (bg: string) => (luminance(bg) > 0.4 ? "#1d1b19" : "#f6f1e8");

/** تطبيق الهوية على الملصق: الورق باللون الأساسي، اسم الدار بالفويل، البقية بحبر مقروء، والشعار والخط */
export function applyBrandToLabel(d: LabelDesign, b: BrandKit): LabelDesign {
  const ink = inkOn(b.primary);
  const texts = d.texts.map((x) => ({
    ...x,
    font: b.font,
    foil: x.id === "brand" ? b.foil : "none" as Foil,
    color: x.id === "brand" ? (b.foil === "none" ? b.secondary : x.color) : x.id === "name" ? ink : ink,
    ...(x.id === "brand" && b.name ? { text: b.name } : {}),
  }));
  return {
    ...d,
    paper: "custom",
    customColor: b.primary,
    border: { ...d.border, color: b.secondary, foil: b.foil },
    texts,
    logo: b.logo ? { dataUrl: b.logo, widthMm: d.logo?.widthMm ?? Math.round(d.widthMm * 0.28), y: d.logo?.y ?? 0.2, foil: b.foil } : d.logo,
  };
}

/** تطبيق الهوية على العلبة: الكرتون باللون الأساسي، الفويل، الخط، واسم الدار */
export function applyBrandToBox(d: BoxDesign, b: BrandKit): BoxDesign {
  return { ...d, board: "custom", customColor: b.primary, interior: b.secondary, foil: b.foil, font: b.font, useLogo: !!b.logo, ...(b.name ? { brand: b.name } : {}) };
}

/** حقول الهوية المرفقة بالطلب */
export function brandFields(b: BrandKit | null): Record<string, string> {
  if (!b) return {};
  const f: Record<string, string> = { brand_primary: b.primary, brand_secondary: b.secondary, brand_font: b.font, brand_foil: b.foil };
  if (b.name) f.brand_name = b.name;
  if (b.logo) f.brand_logo = "attached";
  return f;
}
