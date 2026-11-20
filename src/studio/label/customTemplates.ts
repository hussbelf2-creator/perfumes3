import type { PackModel } from "../types";
import { labelZone } from "./geometry";
import { isShape, type LabelDesign } from "./types";

// قوالب العميل الخاصة: يحفظ تصميمه الحالي باسم ليعيد استخدامه على أي عبوة، أو يرفع تصميماً
// جاهزاً (PNG/SVG/JPG) يُفرَش كخلفية للملصق كما لو جاء من مصممه. تُخزَّن في الجهاز وتُرفق مع الطلب.

export interface CustomTemplate {
  id: string;
  name: string;
  /** التصميم كما حُفظ (بلا شعار ضخم: يُقصّ إلى 150 ألف حرف) */
  design: LabelDesign;
  createdAt: string;
}

const KEY = "pp_label_templates_v1";
export const MAX_TEMPLATES = 20;
export const MAX_ARTWORK_CHARS = 350_000;

const isDataImage = (s: unknown): s is string => typeof s === "string" && /^data:image\/(png|svg\+xml|jpeg|webp);base64,/.test(s);

export function cleanTemplate(x: unknown): CustomTemplate | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Partial<CustomTemplate>;
  const d = o.design as Partial<LabelDesign> | undefined;
  if (!d || typeof d !== "object" || !Array.isArray(d.texts)) return null;
  if (typeof o.id !== "string" || typeof o.name !== "string" || !o.name.trim()) return null;
  const design: LabelDesign = { ...(d as LabelDesign), enabled: true, shape: isShape(d.shape) ? d.shape : "rect", logo: d.logo && isDataImage(d.logo.dataUrl) ? d.logo : null };
  if (design.artwork && !isDataImage(design.artwork.dataUrl)) design.artwork = undefined;
  return { id: o.id, name: o.name.slice(0, 40), design, createdAt: typeof o.createdAt === "string" ? o.createdAt : new Date().toISOString() };
}

export function listCustomTemplates(): CustomTemplate[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as unknown[]) : [];
    return (Array.isArray(arr) ? arr : []).map(cleanTemplate).filter((x): x is CustomTemplate => !!x).slice(0, MAX_TEMPLATES);
  } catch {
    return [];
  }
}

function persist(list: CustomTemplate[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_TEMPLATES)));
    return true;
  } catch {
    return false;
  }
}

/** يحفظ التصميم الحالي قالباً؛ الأحدث أولاً، وبحد أقصى عشرين */
export function saveCustomTemplate(name: string, design: LabelDesign, now = new Date()): CustomTemplate[] {
  const item: CustomTemplate = { id: `t_${now.getTime().toString(36)}`, name: name.trim().slice(0, 40) || design.texts.find((x) => x.id === "brand")?.text || "قالبي", design: { ...design, enabled: true }, createdAt: now.toISOString() };
  const list = [item, ...listCustomTemplates().filter((x) => x.name !== item.name)].slice(0, MAX_TEMPLATES);
  persist(list);
  return list;
}

export function deleteCustomTemplate(id: string): CustomTemplate[] {
  const list = listCustomTemplates().filter((x) => x.id !== id);
  persist(list);
  return list;
}

/** يطبّق القالب على عبوة أخرى: يُبقي الأسلوب ويضبط المقاس داخل منطقة الجسم */
export function applyCustomTemplate(tpl: CustomTemplate, bottle: PackModel, keep: Pick<LabelDesign, "logo"> | null = null): LabelDesign {
  const z = labelZone(bottle.profile, bottle.neckMm);
  const d = tpl.design;
  const heightMm = Math.min(d.heightMm, Math.floor(z.height));
  const centerYmm = Math.min(z.top - heightMm / 2, Math.max(z.bottom + heightMm / 2, d.centerYmm));
  return { ...d, enabled: true, heightMm, centerYmm, logo: keep?.logo ?? d.logo };
}

/** يقرأ ملف تصميم جاهز ويصغّره للمعاينة (الملف الأصلي يُرسل للمطبعة عند الطلب) */
export async function readArtwork(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    let out = c.toDataURL(file.type === "image/png" || file.type === "image/svg+xml" ? "image/png" : "image/jpeg", 0.9);
    if (out.length > MAX_ARTWORK_CHARS) out = c.toDataURL("image/jpeg", 0.75);
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}
