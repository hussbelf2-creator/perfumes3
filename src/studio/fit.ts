import type { PackModel } from "./types";
import type { Fit } from "./spec";

// أبعاد المنتج الجاهز (العبوة مع غطائها): الأساس الوحيد الذي تُشتق منه العلبة والملصق.
// كل ما يعتمد على «هل هذا يناسب ذاك؟» يمر من هنا حتى تتفق المعاينة والتسعير وقواعد التوافق.

const maxR = (m: PackModel) => Math.max(0, ...m.profile.map((p) => p[0]));

/** الارتفاع الكلي: الغطاء يركب على العنق فيغطيه */
export const totalHeight = (bottle: PackModel, cap: PackModel | null) => bottle.heightMm + (cap ? Math.max(0, cap.heightMm - bottle.neckMm) : 0);

export function productFit(bottle: PackModel | null, cap: PackModel | null): Fit | null {
  if (!bottle) return null;
  const r = Math.max(maxR(bottle), cap ? maxR(cap) : 0);
  const w = r > 0 ? r * 2 : 50;
  return { w, d: w * (bottle.depthRatio || 1), h: totalHeight(bottle, cap) };
}

/** نصف قطر العنق (أعلى نقطة في المقطع) */
export const neckRadius = (bottle: PackModel) => [...bottle.profile].sort((a, b) => b[1] - a[1])[0][0];
/** نصف القطر الداخلي لفتحة الغطاء (أسفل نقطة في مقطعه) */
export const capBoreRadius = (cap: PackModel) => [...cap.profile].sort((a, b) => a[1] - b[1])[0][0];
export const bodyRadius = maxR;

/** وزن تقريبي للمنتج المعبأ بالغرام: زجاج (يزيد مع الحجم) + سائل ≈ 0.85 غم/مل + غطاء ومضخة */
export function productWeight(bottle: PackModel, heavyBase = false): number {
  const ml = bottle.capacityMl ?? 50;
  const glass = (55 + 1.6 * ml) * (heavyBase ? 1.4 : 1);
  return Math.round(glass + ml * 0.85 + 18);
}
