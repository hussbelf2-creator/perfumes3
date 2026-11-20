import type { Bi } from "@/i18n/context";
import { printMethodById, recommendPrintMethod } from "@/data/printing";
import { glassById } from "./materials";
import type { PackModel } from "./types";
import { bodyRadius, capBoreRadius, neckRadius, productFit, productWeight } from "./fit";
import { cleanExtras, fitStatus, labelChecklist, mouldById, recommendStyle, smartFit, type BottleSpec, type ExtraId } from "./spec";
import { ROUND, WRAPPED, styleById, type BoxDesign, type BoxStyle } from "./box/types";
import { DEFAULT_BOX_RATES } from "./box/rates";
import { labelZone, perimeter } from "./label/geometry";
import { FOILS, cleanProduction, type LabelDesign } from "./label/types";

// قواعد التوافق: مصدر واحد يجيب «هل هذا التصميم منطقي ويُصنَّع؟».
// كل قاعدة تشرح المشكلة بلغة العميل وتقترح إصلاحاً بضغطة (لا تعطيل صامت للخيارات).
// الأرقام من ممارسات المصانع (docs/research/packaging-ux.md): خلوص 3–5 مم، ملصق داخل الجدار المستقيم، نص ≥ 4 نقاط…

export type IssueLevel = "error" | "warn" | "tip";
export type IssueArea = "bottle" | "label" | "box" | "order";

/** إصلاح يُطبَّق على حالة الاستوديو: معاملات الرابط، ورقع على الملصق والعلبة، والكمية */
export interface Patch {
  params?: Record<string, string>;
  label?: Partial<LabelDesign>;
  box?: Partial<BoxDesign>;
  qty?: number;
}
export interface Issue {
  id: string;
  level: IssueLevel;
  area: IssueArea;
  text: Bi;
  fix?: { label: Bi; patch: Patch };
}
export interface DesignInput {
  bottle: PackModel | null;
  cap: PackModel | null;
  /** الأغطية المتاحة: لاقتراح بديل يركب على العنق */
  caps?: PackModel[];
  glass: string;
  spec: BottleSpec;
  label: LabelDesign | null;
  box: BoxDesign | null;
  qty: number;
}

const bi = (ar: string, en: string): Bi => ({ ar, en });
const PT = 0.3528; // مم لكل نقطة طباعية
const r1 = (n: number) => Math.round(n * 10) / 10;

/** أقصى عرض للملصق: وجه العبوة المسطّحة، أو المحيط ناقص فجوة الالتقاء للملتف */
export function labelLimits(bottle: PackModel) {
  const z = labelZone(bottle.profile, bottle.neckMm);
  const per = perimeter(z.radius, bottle.squareness, bottle.depthRatio);
  const flat = bottle.section !== "round";
  const maxW = flat ? Math.floor(z.radius * 2 * 0.92) : Math.floor(per - 6);
  // الارتفاع داخل الجدار المستقيم ناقص 3 مم (لا يصعد الكتف ولا ينزل الكعب)
  const maxH = Math.max(8, Math.floor(z.height - 3));
  return { zone: z, perimeter: per, maxW, maxH, flat };
}

/** يعيد الملصق داخل منطقة العبوة مع الحفاظ على نسب النصوص */
export function refitLabel(label: LabelDesign, bottle: PackModel): LabelDesign {
  const { zone, maxW, maxH } = labelLimits(bottle);
  const widthMm = Math.min(label.widthMm, maxW);
  const heightMm = Math.min(label.heightMm, maxH);
  const k = Math.min(widthMm / label.widthMm, heightMm / label.heightMm);
  const centerYmm = r1(Math.min(zone.top - 1.5 - heightMm / 2, Math.max(zone.bottom + 1.5 + heightMm / 2, label.centerYmm)));
  if (k === 1 && centerYmm === label.centerYmm) return label;
  return { ...label, widthMm, heightMm, centerYmm, texts: label.texts.map((t) => ({ ...t, sizeMm: r1(t.sizeMm * k) })), logo: label.logo ? { ...label.logo, widthMm: r1(label.logo.widthMm * k) } : label.logo };
}

/** أفضل غطاء يركب على العنق: فتحته أوسع من العنق بأقل فرق، ولا يتجاوز عرض العبوة كثيراً */
export function bestCap(bottle: PackModel, caps: PackModel[]): PackModel | null {
  const neck = neckRadius(bottle);
  const ok = caps.filter((c) => capBoreRadius(c) >= neck + 0.2 && bodyRadius(c) <= bodyRadius(bottle) * 1.15);
  return ok.sort((a, b) => capBoreRadius(a) - neck - (capBoreRadius(b) - neck))[0] ?? null;
}

const insertOf = (extras: string[] | undefined) => cleanExtras(extras).find((x) => x.startsWith("insert_"));

export function checkDesign(d: DesignInput): Issue[] {
  const out: Issue[] = [];
  const { bottle, cap, spec, label, box, qty } = d;
  if (!bottle) return out;
  const ai = bottle.source === "ai";
  const ml = bottle.capacityMl ?? 0;
  const fit = productFit(bottle, cap);

  // ── العبوة والغطاء
  if (cap && !ai) {
    const neck = neckRadius(bottle);
    const bore = capBoreRadius(cap);
    const alt = d.caps ? bestCap(bottle, d.caps) : null;
    if (bore < neck + 0.2) out.push({ id: "cap.neck", level: "error", area: "bottle", text: bi(`الغطاء «${cap.name.ar}» أضيق من عنق العبوة فلا يركب عليه`, `The “${cap.name.en}” cap is narrower than the neck and won't fit`), fix: alt ? { label: bi(`بدّل إلى «${alt.name.ar}»`, `Switch to “${alt.name.en}”`), patch: { params: { c: alt.id } } } : undefined });
    else if (bore > neck + 8.5) out.push({ id: "cap.loose", level: "warn", area: "bottle", text: bi(`فتحة الغطاء «${cap.name.ar}» أوسع من العنق بكثير: يحتاج طوقاً داخلياً ليثبت`, `The “${cap.name.en}” cap bore is far wider than the neck: it needs an inner collar`), fix: alt && alt.id !== cap.id ? { label: bi(`بدّل إلى «${alt.name.ar}»`, `Switch to “${alt.name.en}”`), patch: { params: { c: alt.id } } } : undefined });
    if (bodyRadius(cap) > bodyRadius(bottle) * 1.2) out.push({ id: "cap.wide", level: "warn", area: "bottle", text: bi("الغطاء أعرض من جسم العبوة: يبدو غير متزن ويكبّر العلبة بلا حاجة", "The cap is wider than the bottle body: it looks top-heavy and enlarges the box"), fix: alt && alt.id !== cap.id ? { label: bi(`بدّل إلى «${alt.name.ar}»`, `Switch to “${alt.name.en}”`), patch: { params: { c: alt.id } } } : undefined });
  }
  if (spec.pump === "rollon" && ml > 15) out.push({ id: "pump.rollon", level: "error", area: "bottle", text: bi(`الرول أون للزيوت حتى 12 مل، وعبوتك ${ml} مل`, `Roll-on suits oils up to 12 ml; your bottle is ${ml} ml`), fix: { label: bi("استخدم مضخة رذاذ", "Use a spray pump"), patch: { params: { pm: "" } } } });
  if (spec.pump === "dropper" && ml > 30) out.push({ id: "pump.dropper", level: "warn", area: "bottle", text: bi(`القطّارة تناسب الزيوت المركّزة حتى 30 مل، وعبوتك ${ml} مل`, `A dropper suits concentrated oils up to 30 ml; your bottle is ${ml} ml`), fix: { label: bi("استخدم مضخة رذاذ", "Use a spray pump"), patch: { params: { pm: "" } } } });
  if (spec.cap === "crimp" && (spec.pump === "none" || spec.pump === "rollon" || spec.pump === "dropper")) out.push({ id: "cap.crimp", level: "error", area: "bottle", text: bi("طوق الكريمب يُكبس على مضخة رذاذ، ولا مضخة رذاذ في اختيارك", "A crimp collar is crimped onto a spray pump, and no spray pump is selected"), fix: { label: bi("غطاء لولبي", "Screw cap"), patch: { params: { cm: "" } } } });
  if (spec.cap === "snap" && spec.pump === "none") out.push({ id: "cap.snap", level: "warn", area: "bottle", text: bi("غطاء الضغط يثبت على طوق المضخة، والسدادة بلا طوق", "A snap-on cap grips the pump collar; a stopper has none"), fix: { label: bi("غطاء لولبي", "Screw cap"), patch: { params: { cm: "" } } } });
  const g = glassById(d.glass);
  if (g.transmission === 0 && (spec.deco === "frost" || spec.deco === "coat")) out.push({ id: "deco.redundant", level: "warn", area: "bottle", text: bi("الزجاج مطلي أصلاً: التخشين أو الطلاء الإضافي تكلفة بلا أثر ظاهر", "The glass is already lacquered: extra frosting or coating costs more with no visible effect"), fix: { label: bi("أزل الزخرفة", "Remove the decoration"), patch: { params: { dc: "" } } } });
  const mould = mouldById(spec.mould ?? "catalogue");
  if (qty < mould.moq) out.push({ id: "mould.moq", level: spec.mould === "catalogue" ? "warn" : "error", area: "order", text: bi(`الكمية ${qty} أقل من الحد الأدنى لهذا القالب (${mould.moq})`, `Quantity ${qty} is below this mould's minimum (${mould.moq})`), fix: spec.mould !== "catalogue" && qty >= 500 ? { label: bi("شكل من الكتالوج", "Catalogue shape"), patch: { params: { md: "" } } } : { label: bi(`ارفع الكمية إلى ${mould.moq}`, `Raise quantity to ${mould.moq}`), patch: { qty: mould.moq } } });

  // ── الملصق
  if (label?.enabled && !ai) {
    const lim = labelLimits(bottle);
    const fitted = refitLabel(label, bottle);
    const top = label.centerYmm + label.heightMm / 2, bottom = label.centerYmm - label.heightMm / 2;
    if (label.heightMm > lim.maxH || label.widthMm > lim.maxW || top > lim.zone.top - 1 || bottom < lim.zone.bottom + 1)
      out.push({ id: "label.zone", level: "error", area: "label", text: label.widthMm > lim.maxW ? bi(lim.flat ? `الملصق (${label.widthMm} مم) أعرض من وجه العبوة (${lim.maxW} مم)` : `الملصق (${label.widthMm} مم) أطول من محيط العبوة مع فجوة الالتقاء (${lim.maxW} مم)`, lim.flat ? `The label (${label.widthMm} mm) is wider than the bottle face (${lim.maxW} mm)` : `The label (${label.widthMm} mm) exceeds the circumference minus the seam gap (${lim.maxW} mm)`) : bi("الملصق يتجاوز الجدار المستقيم للعبوة: سيتجعّد عند الكتف أو الكعب", "The label runs past the straight wall: it will wrinkle on the shoulder or heel"), fix: { label: bi("اضبط المقاس تلقائياً", "Fit automatically"), patch: { label: { widthMm: fitted.widthMm, heightMm: fitted.heightMm, centerYmm: fitted.centerYmm, texts: fitted.texts, logo: fitted.logo } } } });
    const list = labelChecklist(label, bottle);
    const vol = list.find((x) => x.id === "volume");
    const conc = list.find((x) => x.id === "conc");
    if ((vol && !vol.ok) || (conc && !conc.ok)) {
      const details = `EAU DE PARFUM · ${ml || 50} ML`;
      const has = label.texts.some((t) => t.id === "details");
      out.push({ id: "label.legal", level: "warn", area: "label", text: vol && !vol.ok ? vol.text : bi("أضف التركيز (EDP، EDT…) على الملصق", "Add the concentration (EDP, EDT…) to the label"), fix: has ? { label: bi(`اكتب «${details}»`, `Set “${details}”`), patch: { label: { texts: label.texts.map((t) => (t.id === "details" ? { ...t, text: details } : t)) } } } : undefined });
    }
    if (!label.texts.some((t) => t.id === "brand" && t.text.trim()) && !label.logo && !label.artwork) out.push({ id: "label.brand", level: "warn", area: "label", text: bi("لا اسم دار ولا شعار على الملصق", "No brand name or logo on the label") });
    const tiny = label.texts.filter((t) => t.text.trim() && t.sizeMm < 4 * PT);
    if (tiny.length) out.push({ id: "label.tiny", level: "warn", area: "label", text: bi("نص أصغر من 4 نقاط (1.4 مم) لا يُقرأ بعد الطباعة", "Text under 4 pt (1.4 mm) won't be legible in print"), fix: { label: bi("كبّره إلى الحد الأدنى", "Raise to the minimum"), patch: { label: { texts: label.texts.map((t) => (t.text.trim() && t.sizeMm < 4 * PT ? { ...t, sizeMm: r1(4 * PT + 0.05) } : t)) } } } });
    const thinFoil = label.texts.filter((t) => t.text.trim() && t.foil !== "none" && t.sizeMm < 7.5 * PT);
    if (thinFoil.length) out.push({ id: "label.foil", level: "warn", area: "label", text: bi("الفويل لا يثبت على نص أصغر من 7.5 نقطة (2.6 مم): تمتلئ الحروف", "Foil fills in on text under 7.5 pt (2.6 mm)"), fix: { label: bi("اطبعه حبراً بدل الفويل", "Print it in ink instead"), patch: { label: { texts: label.texts.map((t) => (thinFoil.includes(t) && t.foil !== "none" ? { ...t, color: FOILS[t.foil].color, foil: "none" as const } : t)) } } } });
    const p = cleanProduction(label);
    if (label.printMethod) {
      const m = printMethodById(label.printMethod);
      const rec = recommendPrintMethod({ qty, material: p.material, effects: p.effects });
      if (qty < m.minQty || qty > m.maxQty) out.push({ id: "label.print", level: "warn", area: "label", text: qty < m.minQty ? bi(`طباعة ${m.short.ar} اقتصادية من ${m.minQty} ملصق، وكميتك ${qty}`, `${m.short.en} is economical from ${m.minQty} labels; you have ${qty}`) : bi(`طباعة ${m.short.ar} تغلو فوق ${m.maxQty} ملصق`, `${m.short.en} gets expensive above ${m.maxQty} labels`), fix: rec.id !== m.id ? { label: bi(`استخدم ${printMethodById(rec.id).short.ar}`, `Use ${printMethodById(rec.id).short.en}`), patch: { label: { printMethod: rec.id } } } : undefined });
    }
    if ((spec.deco === "screen" || spec.deco === "uv" || spec.deco === "hotfoil") && !label.artwork) out.push({ id: "label.deco", level: "tip", area: "label", text: bi("اخترت طباعة مباشرة على الزجاج وملصقاً معاً: أحدهما يكفي غالباً، أو اجعل الملصق خلفياً للمكوّنات", "You chose direct glass print and a label: one is usually enough, or keep the label for the back/ingredients") });
    if (p.material === "pp_clear" && g.transmission === 0) out.push({ id: "label.clear", level: "tip", area: "label", text: bi("ملصق شفاف على زجاج مطلي: الطباعة المباشرة أوفر وأنظف", "A clear label on lacquered glass: direct print is cleaner and cheaper") });
  }

  // ── العلبة
  if (box && fit) {
    const meta = styleById(box.style);
    const wide = meta.fit === "wide" || meta.fit === "band" || meta.fit === "lying" || meta.fit === "cube";
    const st = fitStatus(box, fit);
    const sized = smartFit(box.style, fit);
    const refit = { label: bi("طابق مقاس العلبة للعبوة", "Fit the box to the bottle"), patch: { box: { ...sized, autoFit: true } as Partial<BoxDesign> } };
    if (!wide) {
      if (st.level === "tight") out.push({ id: "box.tight", level: "error", area: "box", text: bi(`العلبة أصغر من العبوة: ينقصها ${r1(-Math.min(st.clearance.w, st.clearance.d, st.clearance.h) + 3)} مم`, `The box is smaller than the bottle: short by ${r1(-Math.min(st.clearance.w, st.clearance.d, st.clearance.h) + 3)} mm`), fix: refit });
      else if (st.level === "snug") out.push({ id: "box.snug", level: "warn", area: "box", text: st.message, fix: refit });
      else if (st.level === "loose" && !insertOf(box.extras)) out.push({ id: "box.loose", level: "warn", area: "box", text: bi(`العلبة أكبر من العبوة بـ${Math.round(Math.max(st.clearance.w, st.clearance.d, st.clearance.h))} مم: تتحرك الزجاجة وتنكسر في الشحن`, `The box is ${Math.round(Math.max(st.clearance.w, st.clearance.d, st.clearance.h))} mm bigger than the bottle: it will move and break in transit`), fix: refit });
    }
    if (ROUND.includes(box.style) && (bottle.depthRatio || 1) < 0.75) {
      const rec = recommendStyle(fit, ml);
      out.push({ id: "box.round", level: "warn", area: "box", text: bi("علبة دائرية أو مضلّعة لعبوة مسطّحة: فراغ كبير على الجانبين", "A round or polygonal box for a flat bottle leaves big gaps at the sides"), fix: { label: bi(`بدّل إلى «${styleById(rec.style).name.ar}»`, `Switch to “${styleById(rec.style).name.en}”`), patch: { box: { style: rec.style, ...smartFit(rec.style, fit), structure: null, autoFit: true } as Partial<BoxDesign> } } });
    }
    const weight = productWeight(bottle, spec.weight === "heavy");
    if ((box.style === "hang" || box.style === "hangWindow") && (ml > 30 || weight > 160)) out.push({ id: "box.hang", level: "warn", area: "box", text: bi(`علبة التعليق لأحجام السفر حتى 30 مل؛ منتجك ≈ ${weight} غم سيمزّق اللسان`, `Hang-tab cartons suit travel sizes up to 30 ml; your product ≈ ${weight} g will tear the tab`), fix: { label: bi("علبة بلسان", "Tuck-end carton"), patch: { box: { style: "tuck" as BoxStyle, ...smartFit("tuck", fit), structure: null, autoFit: true } as Partial<BoxDesign> } } });
    if (meta.family === "folding" && meta.fit === "box" && weight > 300 && !insertOf(box.extras) && box.style !== "fullOverlap" && box.style !== "crash") out.push({ id: "box.heavy", level: "tip", area: "box", text: bi(`منتج ثقيل (≈ ${weight} غم) في كرتون مطوي: أضف حشوة أو اختر قاعدة قفل ذاتي`, `A heavy product (≈ ${weight} g) in a folding carton: add an insert or choose a crash-lock base`), fix: { label: bi("أضف حشوة ورقية", "Add a pulp insert"), patch: { box: { extras: [...cleanExtras(box.extras), "insert_pulp" as ExtraId] } } } });
    if (WRAPPED.includes(box.style) && !insertOf(box.extras)) out.push({ id: "box.insert", level: "warn", area: "box", text: bi("العلبة الصلبة بلا حشوة: الزجاجة ستتحرك داخلها", "A rigid box with no insert: the bottle will move inside"), fix: { label: bi("أضف حشوة EVA", "Add an EVA insert"), patch: { box: { extras: [...cleanExtras(box.extras), "insert_eva" as ExtraId] } } } });
    if (WRAPPED.includes(box.style) && ml > 0 && ml <= 15) out.push({ id: "box.overkill", level: "tip", area: "box", text: bi("علبة صلبة لعبوة صغيرة: قد تكلّف العلبة أكثر من المنتج. الأسطوانة أو علبة بلسان أنسب", "A rigid box for a small bottle may cost more than the product. A tube or tuck carton fits better") });
    if (meta.fit === "band") out.push({ id: "box.band", level: "tip", area: "box", text: bi("الحزام الورقي ليس علبة: يُلف فوق علبة أو طقم", "A belly band isn't a box: it wraps a box or set") });
    if (meta.group === "shipping") out.push({ id: "box.shipping", level: "tip", area: "box", text: bi("هذه علبة شحن: تحمي في التوصيل ولا تغني عن علبة العرض على الرف", "This is a shipping box: it protects in transit but doesn't replace a retail box") });
    const moq = DEFAULT_BOX_RATES.moq[box.style];
    if (qty < moq) out.push({ id: "box.moq", level: "warn", area: "order", text: bi(`الحد الأدنى لهذه العلبة ${moq}، وكميتك ${qty}`, `This box's minimum is ${moq}; you have ${qty}`), fix: { label: bi(`ارفع الكمية إلى ${moq}`, `Raise quantity to ${moq}`), patch: { qty: moq } } });
    const lb = label?.enabled ? label.texts.find((t) => t.id === "brand")?.text.trim() : "";
    if (lb && box.brand.trim() && lb.toLowerCase() !== box.brand.trim().toLowerCase()) out.push({ id: "box.brand", level: "warn", area: "box", text: bi(`اسم الدار على العلبة «${box.brand}» يخالف الملصق «${lb}»`, `The brand on the box “${box.brand}” differs from the label “${lb}”`), fix: { label: bi("وحّد الاسم مع الملصق", "Match the label"), patch: { box: { brand: lb } } } });
  }
  const order = { error: 0, warn: 1, tip: 2 } as const;
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

/** يدمج الرقع بالترتيب (اللاحق يغلب) */
export function mergePatches(patches: Patch[]): Patch {
  return patches.reduce<Patch>((acc, p) => ({ params: { ...acc.params, ...p.params }, label: { ...acc.label, ...p.label }, box: { ...acc.box, ...p.box }, qty: p.qty ?? acc.qty }), {});
}

/** إصلاح كل ما له حل تلقائي من الأخطاء والتحذيرات (لا يمس التلميحات) */
export const autoFixPatch = (issues: Issue[]): Patch => mergePatches(issues.filter((i) => i.level !== "tip" && i.fix).map((i) => i.fix!.patch));

export const readiness = (issues: Issue[]) => ({ errors: issues.filter((i) => i.level === "error").length, warns: issues.filter((i) => i.level === "warn").length, tips: issues.filter((i) => i.level === "tip").length, ready: !issues.some((i) => i.level === "error") });

const SPEC_KEYS: Record<string, keyof BottleSpec> = { cm: "cap", pm: "pump", dc: "deco", md: "mould", wt: "weight" };
const SPEC_DEFAULT: BottleSpec = { cap: "screw", pump: "standard", deco: "none", mould: "catalogue", weight: "standard" };

/** يطبّق رقعة على مدخل الفحص (للحساب البحت: الإصلاح المتتابع والاختبارات) */
export function applyPatchToInput(d: DesignInput, p: Patch): DesignInput {
  let { cap, spec } = d;
  for (const [k, v] of Object.entries(p.params ?? {})) {
    if (k === "c") cap = d.caps?.find((x) => x.id === v) ?? (v ? cap : null);
    else if (SPEC_KEYS[k]) spec = { ...spec, [SPEC_KEYS[k]]: v || SPEC_DEFAULT[SPEC_KEYS[k]] };
  }
  return { ...d, cap, spec, label: d.label && p.label ? { ...d.label, ...p.label } : d.label, box: d.box && p.box ? { ...d.box, ...p.box } : d.box, qty: p.qty ?? d.qty };
}

/** يصلح الأخطاء والتحذيرات واحداً تلو الآخر حتى لا يبقى ما له حل (كل إصلاح قد يغيّر ما بعده) */
export function autoFixAll(d: DesignInput): { patch: Patch; input: DesignInput; fixed: string[] } {
  let cur = d;
  const patches: Patch[] = [];
  const fixed: string[] = [];
  for (let i = 0; i < 16; i++) {
    const next = checkDesign(cur).find((x) => x.level !== "tip" && x.fix && !fixed.includes(x.id));
    if (!next) break;
    fixed.push(next.id);
    patches.push(next.fix!.patch);
    cur = applyPatchToInput(cur, next.fix!.patch);
  }
  // الملصق والعلبة يُرجعان كاملين (آخر حالة) حتى لا تضيع رقعة سابقة على الحقل نفسه
  const patch: Patch = { params: Object.assign({}, ...patches.map((p) => p.params ?? {})), qty: cur.qty !== d.qty ? cur.qty : undefined };
  if (cur.label !== d.label && cur.label) patch.label = cur.label;
  if (cur.box !== d.box && cur.box) patch.box = cur.box;
  return { patch, input: cur, fixed };
}

/** أشكال العلب المرشّحة لهذه العبوة (ستة على الأكثر): المقترح أولاً ثم ما يناسب الحجم والمقطع */
export function recommendedStyles(bottle: PackModel, cap: PackModel | null): BoxStyle[] {
  const fit = productFit(bottle, cap);
  if (!fit) return ["tuck", "rigid", "magnetic", "drawer"];
  const ml = bottle.capacityMl ?? 50;
  const round = (bottle.depthRatio || 1) >= 0.9 && bottle.section === "round";
  const rec = recommendStyle(fit, ml).style;
  const pool: BoxStyle[] = ml <= 15 ? ["tube", "tuck", "hang", "sleeve", "drawer", "discovery"] : ml <= 60 ? ["tuck", "rigid", "drawer", "window", round ? "tube" : "ste", "magnetic"] : ["magnetic", "rigid", "tuck", "shoulder", "drawer", round ? "tube" : "telescope"];
  return [...new Set<BoxStyle>([rec, ...pool])].filter((s) => round || !ROUND.includes(s)).slice(0, 6);
}

/** الأغطية التي تركب على هذه العبوة وتتزن معها */
export function fittingCaps(bottle: PackModel, caps: PackModel[]): PackModel[] {
  const neck = neckRadius(bottle);
  return caps.filter((c) => capBoreRadius(c) >= neck + 0.2 && capBoreRadius(c) <= neck + 8.5 && bodyRadius(c) <= bodyRadius(bottle) * 1.2);
}

/** يكتب حجم العبوة الفعلي في سطر التفاصيل (القوالب تحمل رقماً نموذجياً) */
export function withVolume(label: LabelDesign, ml: number | null | undefined): LabelDesign {
  if (!ml) return label;
  let changed = false;
  const texts = label.texts.map((t) => {
    if (t.id !== "details") return t;
    const next = /\d+\s*(ml|مل)/i.test(t.text) ? t.text.replace(/\d+(\s*)(ml|مل)/i, `${ml}$1$2`) : t.text;
    if (next !== t.text) changed = true;
    return next === t.text ? t : { ...t, text: next };
  });
  return changed ? { ...label, texts } : label;
}
