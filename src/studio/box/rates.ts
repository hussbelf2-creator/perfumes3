import { STYLES, type BoxStyle } from "./types";
import { DEFAULT_EXTRA_RATES } from "../spec";

// أسعار العلب — ملف خفيف بلا تبعيات (يستورده نظام المحتوى في الحزمة الرئيسية)

export interface BoxRates {
  /** سعر الخامة لكل م² من الفرخ (ريال) لكل نوع */
  boardPerM2: Record<BoxStyle, number>;
  /** هدر القص والتجهيز فوق مساحة الفرخ (1.18 = 18%) */
  waste: number;
  /** طباعة لكل م²: لون كامل (أسود/مخصص) أو نص فقط على كرتون فاتح */
  printFloodPerM2: number;
  printLightPerM2: number;
  /** تشطيب لكل م² */
  finishPerM2: { matte: number; soft: number; gloss: number };
  /** فويل لكل علبة (ضربة واحدة) */
  foilPerUnit: number;
  /** تجميع ولصق لكل علبة حسب النوع (يشمل المغناطيس للمغناطيسية) */
  assemblyPerUnit: Record<BoxStyle, number>;
  /** قالب القص: لكل مم من خطوط القص والتكسير، بحد أدنى */
  diePerMm: number;
  dieMin: number;
  /** ألواح الطباعة والتجهيز لكل طلب */
  platesSetup: number;
  /** كليشة الفويل */
  foilBlock: number;
  /** الحد الأدنى للطلب لكل نوع */
  moq: Record<BoxStyle, number>;
  /** ملحقات التغليف لكل علبة (بطاقة شكر، حشوة…) بمعرّفات studio/spec.ts؛ الناقص يأخذ الافتراضي */
  extrasPerUnit?: Record<string, number>;
}

/** قيمة لكل نوع من عائلته مع استثناءات محددة */
const perStyle = (fam: Record<"folding" | "rigid" | "corr" | "tube", number>, over: Partial<Record<BoxStyle, number>> = {}): Record<BoxStyle, number> =>
  Object.fromEntries(STYLES.map((s) => [s.id, over[s.id] ?? fam[s.family]])) as Record<BoxStyle, number>;

// أسعار مبدئية للتخطيط (ريال، السوق السعودي) — تُعاير على عروض موردي الكرتون والمطابع قبل الاعتماد
export const DEFAULT_BOX_RATES: BoxRates = {
  boardPerM2: perStyle({ folding: 3.5, rigid: 16, corr: 6, tube: 12 }, { window: 3.9, doubleWindow: 4.2, hangWindow: 3.9, sleeveWindow: 3.9, hexWindow: 4.2, drawer: 4.5, drawerWindow: 4.9, doubleDrawer: 4.5, shoulder: 17, neckMagnetic: 18, rigidWindow: 17, telescope: 16.5, clamshell: 17, rigidDrawer: 17, discovery: 16, crash: 3.7, gable: 3.8, handle: 3.8, octagon: 3.8, pentagon: 3.8, triangle: 3.6, hexagon: 3.8, bookSleeve: 4.2 }),
  waste: 1.18,
  printFloodPerM2: 2.5,
  printLightPerM2: 0.8,
  finishPerM2: { matte: 1.2, soft: 2.6, gloss: 0.9 },
  foilPerUnit: 0.35,
  assemblyPerUnit: perStyle({ folding: 0.25, rigid: 4.2, corr: 0.6, tube: 2.8 }, { sleeve: 0.18, sleeveWindow: 0.45, band: 0.12, window: 0.55, doubleWindow: 0.8, hang: 0.3, hangWindow: 0.6, sealEnd: 0.35, fullOverlap: 0.4, crash: 0.45, gable: 0.6, handle: 0.55, tuckTray: 0.3, foldTray: 0.5, bookSleeve: 0.6, hexagon: 0.45, hexWindow: 0.7, octagon: 0.5, pentagon: 0.45, triangle: 0.35, drawer: 1.6, drawerWindow: 1.9, rigidDrawer: 5, doubleDrawer: 2.6, magnetic: 5.5, clamshell: 5.2, shoulder: 5.2, neckMagnetic: 6.4, telescope: 4.6, rigidWindow: 4.8, discovery: 5, tube: 2.8, tubeTele: 2.9, mailer: 0.6, mailerWindow: 0.9, rsc: 0.5, display: 0.7 }),
  diePerMm: 0.08,
  dieMin: 450,
  platesSetup: 450,
  foilBlock: 300,
  moq: perStyle({ folding: 500, rigid: 300, corr: 300, tube: 300 }, { drawer: 300, drawerWindow: 300, doubleDrawer: 300, display: 200 }),
  extrasPerUnit: { ...DEFAULT_EXTRA_RATES },
};

