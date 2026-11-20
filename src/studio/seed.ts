import type { PackModel, ProfilePoint } from "./types";

// كتالوج البداية: أشكال قياسية شائعة في السوق المحلي، معرّفة بمقاطع جانبية بالمليمتر.
// تستبدلها الإدارة بصور عبواتها الحقيقية من /admin/studio.

const at = "2026-01-01T00:00:00Z";
const base = { thumb: null, createdAt: at, updatedAt: at, published: true } as const;

/** مقطع قياسي: قاعدة بحافة، جسم مستقيم حتى bodyTop، كتف حتى shoulderTop، ثم عنق حتى total */
const prof = (r: number, bodyTop: number, shoulderTop: number, total: number, neckR = 7.6): ProfilePoint[] => [
  [r - 1, 0],
  [r, 2],
  [r, bodyTop],
  [r - 0.7, bodyTop + (shoulderTop - bodyTop) * 0.45],
  [(r + neckR) / 2, bodyTop + (shoulderTop - bodyTop) * 0.8],
  [neckR + 1.2, shoulderTop - 1],
  [neckR, shoulderTop],
  [neckR, total],
];
const bottle = (id: string, ar: string, en: string, capacityMl: number, sort: number, profile: ProfilePoint[], neckMm: number, section: PackModel["section"] = "round", depthRatio = 1, squareness = 2): PackModel => ({
  ...base, id, kind: "bottle", name: { ar, en }, capacityMl, heightMm: Math.max(...profile.map((x) => x[1])), neckMm, section, depthRatio, squareness, sort, profile,
});
const capModel = (id: string, ar: string, en: string, sort: number, profile: ProfilePoint[], section: PackModel["section"] = "round", squareness = 2): PackModel => ({
  ...base, id, kind: "cap", name: { ar, en }, heightMm: Math.max(...profile.map((x) => x[1])), neckMm: 0, section, depthRatio: 1, squareness, sort, profile,
});

/** إصدار البذرة: يرتفع كلما أضيفت أشكال، فتصل للزوار الذين خُزّن عندهم كتالوج أقدم */
export const SEED_VERSION = 2;
/** أشكال أضيفت بعد الإصدار الأول (المعرّف ← الإصدار الذي ظهرت فيه) */
export const SEED_SINCE: Record<string, number> = {};

export const SEED_MODELS: PackModel[] = [
  {
    ...base,
    id: "B-ATLAS",
    kind: "bottle",
    name: { ar: "أطلس · أسطواني", en: "Atlas · cylinder" },
    capacityMl: 50,
    heightMm: 96,
    neckMm: 13,
    section: "round",
    depthRatio: 1,
    squareness: 2,
    sort: 1,
    profile: [[17.4, 0], [18.3, 1.5], [18.4, 3], [18.4, 70], [17.8, 74], [15.1, 78], [8.9, 81.5], [7.6, 83], [7.6, 96]],
  },
  {
    ...base,
    id: "B-NOOR",
    kind: "bottle",
    name: { ar: "نور · مربع مسطّح", en: "Noor · flat square" },
    capacityMl: 100,
    heightMm: 112,
    neckMm: 12,
    section: "square",
    depthRatio: 0.55,
    squareness: 7,
    sort: 2,
    profile: [[26, 0], [26.9, 2.5], [26.9, 88], [25.5, 93], [17.8, 97.5], [8.8, 99.5], [7.8, 100.5], [7.8, 112]],
  },
  {
    ...base,
    id: "B-QAHWA",
    kind: "bottle",
    name: { ar: "قهوة · كروي قصير", en: "Qahwa · squat round" },
    capacityMl: 30,
    heightMm: 66,
    neckMm: 10,
    section: "round",
    depthRatio: 1,
    squareness: 2,
    sort: 3,
    profile: [[14.8, 0], [17.3, 2], [18.9, 8], [19.6, 20], [18.9, 33], [16.7, 42], [11.6, 50], [7.9, 54], [7.4, 56], [7.4, 66]],
  },
  {
    ...base,
    id: "B-BAHR",
    kind: "bottle",
    name: { ar: "بحر · بيضاوي طويل", en: "Bahr · tall oval" },
    capacityMl: 75,
    heightMm: 128,
    neckMm: 11,
    section: "oval",
    depthRatio: 0.62,
    squareness: 2,
    sort: 4,
    profile: [[21.5, 0], [22.9, 2.5], [22.9, 104], [21.1, 110], [13.4, 114.5], [8, 116.5], [7.5, 117], [7.5, 128]],
  },
  {
    ...base,
    id: "C-CYL",
    kind: "cap",
    name: { ar: "أسطوانة", en: "Cylinder" },
    heightMm: 30,
    neckMm: 0,
    section: "round",
    depthRatio: 1,
    squareness: 2,
    sort: 1,
    profile: [[11.2, 0], [11.2, 28], [10.6, 29.6], [9.8, 30]],
  },
  {
    ...base,
    id: "C-CUBE",
    kind: "cap",
    name: { ar: "مكعب", en: "Cube" },
    heightMm: 30,
    neckMm: 0,
    section: "square",
    depthRatio: 1,
    squareness: 9,
    sort: 2,
    profile: [[14.5, 0], [15, 1], [15, 29], [14.5, 30]],
  },
  {
    ...base,
    id: "C-DOME",
    kind: "cap",
    name: { ar: "قبة", en: "Dome" },
    heightMm: 26,
    neckMm: 0,
    section: "round",
    depthRatio: 1,
    squareness: 2,
    sort: 3,
    profile: [[12.5, 0], [12.5, 9], [12.2, 14], [11, 18.5], [8.5, 22.5], [5, 25], [1, 26]],
  },
  {
    ...base,
    id: "C-TOWER",
    kind: "cap",
    name: { ar: "برج مخروطي", en: "Tapered tower" },
    heightMm: 44,
    neckMm: 0,
    section: "square",
    depthRatio: 1,
    squareness: 4,
    sort: 4,
    profile: [[12, 0], [13.5, 4], [12.5, 30], [10.5, 42], [9.5, 44]],
  },
  // ── الإصدار 2: أشكال السوق الشائعة بأحجامها القياسية
  bottle("B-CUBE", "مكعّب · مربع قصير", "Cube · squat square", 50, 5, prof(20.5, 43, 51, 63), 12, "square", 1, 9),
  bottle("B-TOWER", "برج · مربع طويل", "Tower · tall square", 100, 6, prof(20.5, 88, 96, 108), 12, "square", 1, 8),
  bottle("B-FLASK", "فلاسك · مسطّح عريض", "Flask · wide flat", 100, 7, prof(34, 80, 92, 104), 12, "oval", 0.42, 2),
  bottle("B-SLIM", "رشيق · أسطواني نحيل", "Slim · narrow cylinder", 30, 8, prof(13.5, 86, 92, 104), 12),
  bottle("B-SQ30", "بداية · مربع صغير", "Starter · small square", 30, 9, prof(17, 44, 51, 62), 11, "square", 1, 8),
  bottle("B-APOTH", "صيدلية · كتف مائل", "Apothecary · sloped shoulder", 50, 10, [[19.5, 0], [20.5, 2], [20.5, 46], [19, 54], [14.5, 62], [9.5, 67], [7.6, 69], [7.6, 81]], 12),
  bottle("B-HIP", "جيب · مسطّح قصير", "Hip · short flat", 50, 11, prof(28, 52, 62, 74), 12, "oval", 0.5, 2),
  bottle("B-SPHERE", "كرة · كروي كامل", "Sphere · full round", 75, 12, [[12, 0], [19, 3], [24, 11], [26.5, 24], [26.5, 33], [24, 46], [18, 55], [11, 61], [8.4, 63], [7.6, 64.5], [7.6, 76]], 12),
  bottle("B-DROP", "قطرة · مخروطي", "Drop · tapered cone", 60, 13, [[21.5, 0], [23.5, 2.5], [23.5, 14], [21.6, 34], [18, 54], [13.5, 70], [9.4, 80], [7.6, 84], [7.6, 96]], 12),
  bottle("B-PILLAR", "عمود · أسطواني عريض", "Pillar · wide cylinder", 100, 14, prof(24, 76, 84, 96), 12),
  bottle("B-TRAVEL", "سفر · بخاخ جيب", "Travel · pocket atomiser", 10, 15, prof(10, 64, 68, 78, 6.2), 10),
  bottle("B-ATTAR", "تولة · دهن عود", "Tola · attar oil", 12, 16, [[9.5, 0], [13, 2], [15.3, 8], [15.8, 17], [14.5, 26], [10.5, 33], [6.8, 37], [6.2, 38], [6.2, 46]], 8),
  bottle("B-MINI", "عيّنة · قارورة صغيرة", "Sample · mini vial", 5, 17, prof(8.5, 44, 47, 55, 5.2), 8),
  capModel("C-BALL", "كرة", "Ball", 5, [[9.5, 0], [10, 4], [13.5, 9], [15.5, 16], [15.5, 20], [13.5, 27], [9, 32], [3, 34.5], [0.5, 35]]),
  capModel("C-DISC", "قرص عريض", "Wide disc", 6, [[10, 0], [10, 8], [17, 10], [17.5, 11], [17.5, 19], [17, 20]]),
  capModel("C-TALL", "أسطوانة طويلة", "Tall cylinder", 7, [[10, 0], [10, 44], [9.5, 45.5], [8.6, 46]]),
  capModel("C-PYR", "هرم مقطوع", "Truncated pyramid", 8, [[15, 0], [15.5, 1], [11, 30], [10.5, 31]], "square", 6),
  capModel("C-STOP", "سدادة بكرة", "Ball stopper", 9, [[9, 0], [9, 7], [6.5, 9], [6, 13], [9.5, 17], [12, 23], [12, 27], [9.5, 33], [4, 36.5], [0.5, 37]]),
  capModel("C-MINI", "غطاء صغير", "Mini cap", 10, [[7.8, 0], [7.8, 17], [7.2, 18]]),
];

for (const m of SEED_MODELS) if (["B-CUBE", "B-TOWER", "B-FLASK", "B-SLIM", "B-SQ30", "B-APOTH", "B-HIP", "B-SPHERE", "B-DROP", "B-PILLAR", "B-TRAVEL", "B-ATTAR", "B-MINI", "C-BALL", "C-DISC", "C-TALL", "C-PYR", "C-STOP", "C-MINI"].includes(m.id)) SEED_SINCE[m.id] = 2;
