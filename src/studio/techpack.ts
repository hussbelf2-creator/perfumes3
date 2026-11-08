import type { PackModel } from "./types";
import type { LabelDesign } from "./label/types";
import type { BoxDesign } from "./box/types";
import { STYLES as BOX_STYLES, BOARDS, FINISHES, DEFAULT_QTY } from "./box/types";
import { CAP_FINISH, GLASS, LIQUID, glassById, finishById, liquidById } from "./materials";
import { ADHESIVES, EFFECTS, ENGRAVE_METHODS, ENGRAVE_POSITIONS, FOILS, LABEL_SET, MATERIALS, PAPERS, cleanProduction, labelShapeOf, labelSide } from "./label/types";
import { shapeById } from "./label/shapes";
import { labelZone, perimeter } from "./label/geometry";
import { ARTWORK_REQUIREMENTS, printMethodById } from "@/data/printing";
import { BOX_EFFECTS, EXTRAS, bottleSpecExtra, bottleSpecSetup, capById, cleanBoxEffects, cleanExtras, decoById, estimateLabel, mouldById, pumpById, weightById, type BottleSpec } from "./spec";
import { estimateBox } from "./box/pricing";
import { buildSpec } from "./box/dielines";
import { STOCKS, paramsText, resolveStructure, stockFor, structureById, structureSvg, svgSheet } from "@/lib/packaging";

// ورقة المواصفات الفنية (Tech Pack): ما يراه المصنع بالضبط — كل اختيار في الاستوديو في مجموعات مقروءة.
// منطق خالص بلا React ليُختبر في Node؛ العرض والتنزيل في TechPack.tsx.

export interface TechPackInput {
  bottle: PackModel | null;
  cap: PackModel | null;
  glass: string;
  capFinish: string;
  liquid: string;
  spec: BottleSpec;
  label: LabelDesign | null;
  box: BoxDesign | null;
  thumb?: string | null;
}

export interface Row {
  k: string;
  v: string;
}
export interface Group {
  title: string;
  rows: Row[];
}

export function techPackGroups(i: TechPackInput, pick: (b: { ar: string; en: string }) => string, t: (ar: string, en: string) => string, num: (n: number, d?: number) => string, rates: Parameters<typeof estimateBox>[2], tiers: Parameters<typeof estimateBox>[3]): { groups: Group[]; totals: Row[] } {
  const qty = i.box?.qty ?? DEFAULT_QTY;
  const groups: Group[] = [];
  const mm = (n: number) => `${num(Math.round(n * 10) / 10)} ${t("مم", "mm")}`;
  if (i.bottle) {
    const b = i.bottle;
    groups.push({
      title: t("العبوة", "Bottle"),
      rows: [
        { k: t("الشكل", "Shape"), v: `${pick(b.name)}${b.source === "ai" ? ` (${t("نموذج AI", "AI model")})` : ""}` },
        { k: t("السعة الاسمية", "Nominal capacity"), v: b.capacityMl ? `${num(b.capacityMl)} ${t("مل", "ml")}` : "—" },
        { k: t("الارتفاع الكلي", "Total height"), v: mm(b.heightMm + (i.cap ? i.cap.heightMm - b.neckMm : 0)) },
        { k: t("المقطع", "Section"), v: b.section === "round" ? t("دائري", "Round") : b.section === "square" ? t("مربع", "Square") : t("بيضاوي", "Oval") },
        { k: t("الزجاج", "Glass"), v: `${pick(glassById(i.glass).name)} · ${pick(weightById(i.spec.weight ?? "standard").name)}` },
        { k: t("السائل في المعاينة", "Liquid in preview"), v: pick(liquidById(i.liquid).name) },
        { k: t("القالب", "Mould"), v: `${pick(mouldById(i.spec.mould ?? "catalogue").name)} · ${t("الحد الأدنى", "MOQ")} ${num(mouldById(i.spec.mould ?? "catalogue").moq)}` },
      ],
    });
    groups.push({
      title: t("الإغلاق والزخرفة", "Closure & decoration"),
      rows: [
        { k: t("الغطاء", "Cap"), v: i.cap ? `${pick(i.cap.name)} · ${pick(finishById(i.capFinish).name)}` : t("بدون غطاء", "No cap") },
        { k: t("آلية الغطاء", "Cap mechanism"), v: pick(capById(i.spec.cap).name) },
        { k: t("المضخة", "Pump"), v: pick(pumpById(i.spec.pump).name) },
        { k: t("زخرفة الزجاج", "Glass decoration"), v: pick(decoById(i.spec.deco).name) },
      ],
    });
  }
  if (i.label?.enabled) {
    const l = i.label;
    const p = cleanProduction(l);
    const txt = (id: "brand" | "name" | "details") => l.texts.find((x) => x.id === id);
    const foils = [...l.texts.filter((x) => x.foil !== "none").map((x) => x.foil), ...(l.logo && l.logo.foil !== "none" ? [l.logo.foil] : []), ...(l.border.enabled && l.border.foil !== "none" ? [l.border.foil] : [])];
    groups.push({
      title: t("الملصق الأمامي", "Front label"),
      rows: [
        { k: t("المقاس", "Size"), v: `${num(l.widthMm)} × ${num(l.heightMm)} ${t("مم", "mm")} · ${t("مركزه على ارتفاع", "centred at")} ${mm(l.centerYmm)}` },
        { k: t("الشكل", "Shape"), v: `${pick(shapeById(labelShapeOf(l)).name)}${shapeById(labelShapeOf(l)).die ? ` · ${t("قالب قص بالشكل", "shaped die")}` : ""}` },
        { k: t("الموضع", "Placement"), v: `${{ front: t("الواجهة", "Front"), right: t("اليمين", "Right"), left: t("اليسار", "Left"), back: t("الخلف", "Back"), wrap: t("حول العبوة", "Wrap") }[labelSide(l.offsetMm, i.bottle ? perimeter(labelZone(i.bottle.profile, i.bottle.neckMm).radius, i.bottle.squareness, i.bottle.depthRatio) : 1e9)]}${l.offsetMm ? ` (${num(Math.round(l.offsetMm))} ${t("مم", "mm")})` : ""}${l.rotateDeg ? ` · ${t("ميل", "tilt")} ${num(l.rotateDeg)}°` : ""}` },
        { k: t("طريقة الطباعة", "Print method"), v: `${pick(printMethodById(l.printMethod ?? "digital").name)} · ${num(printMethodById(l.printMethod ?? "digital").leadDays[0])}–${num(printMethodById(l.printMethod ?? "digital").leadDays[1])} ${t("أيام", "days")}${l.printMethod ? "" : ` (${t("افتراضي", "default")})`}` },
        { k: t("الخامة", "Stock"), v: `${pick(MATERIALS[p.material].name)} · ${l.paper === "custom" ? l.customColor : pick(PAPERS[l.paper].name)} · ${l.finish === "matte" ? t("مطفأ", "Matte") : t("لامع", "Gloss")}` },
        { k: t("النصوص", "Text"), v: [txt("brand")?.text, txt("name")?.text, txt("details")?.text].filter(Boolean).join(" / ") || "—" },
        { k: t("الفويل", "Foil"), v: foils.length ? [...new Set(foils)].map((f) => pick(FOILS[f as keyof typeof FOILS].name)).join("، ") : t("بدون", "None") },
        { k: t("الشعار", "Logo"), v: l.logo ? `${t("مرفق", "Attached")} · ${num(l.logo.widthMm)} ${t("مم", "mm")}` : t("بدون", "None") },
        ...(l.artwork ? [{ k: t("تصميم العميل", "Client artwork"), v: `${t("ملف مرفوع يُفرَش", "Uploaded file laid")} ${l.artwork.fit === "contain" ? t("كاملاً داخل الملصق", "fully inside the label") : t("على كامل الملصق", "across the whole label")}${l.artwork.hideTexts ? ` · ${t("نصوص الاستوديو مخفية", "studio text hidden")}` : ""}` }] : []),
        { k: t("التأثيرات", "Effects"), v: p.effects.length ? p.effects.map((e) => pick(EFFECTS[e].name)).join("، ") : t("بدون", "None") },
        { k: t("اللاصق", "Adhesive"), v: pick(ADHESIVES[p.adhesive].name) },
        { k: t("طقم الملصقات", "Label set"), v: p.set.length ? p.set.map((x) => pick(LABEL_SET[x].name)).join("، ") : t("الأمامي فقط", "Front only") },
        ...(p.engrave.enabled ? [{ k: t("نقش على الزجاج", "Glass engraving"), v: `${pick(ENGRAVE_METHODS[p.engrave.method].name)} · ${pick(ENGRAVE_POSITIONS[p.engrave.position])}${p.engrave.text ? ` «${p.engrave.text}»` : ""} · ${t("ارتفاع الحرف", "letter")} ${num(p.engrave.sizeMm ?? 5)} ${t("مم", "mm")}${p.engrave.yMm ? ` · ${t("على ارتفاع", "at")} ${num(p.engrave.yMm)} ${t("مم", "mm")}` : ""}` }] : []),
      ],
    });
  }
  if (i.label?.enabled) {
    const m = i.label.printMethod ?? "digital";
    groups.push({ title: t("متطلبات ملفات الطباعة", "Artwork requirements"), rows: ARTWORK_REQUIREMENTS.filter((r) => !r.methods || r.methods.includes(m)).map((r, n) => ({ k: `${n + 1}`, v: pick(r.text) })) });
  }
  if (i.box) {
    const b = i.box;
    const spec = buildSpec(b);
    const fx = cleanBoxEffects(b.effects);
    const ex = cleanExtras(b.extras);
    groups.push({
      title: t("العلبة", "Box"),
      rows: [
        { k: t("النوع", "Style"), v: pick(BOX_STYLES.find((s) => s.id === b.style)!.name) },
        { k: t("المقاس الداخلي", "Inner size"), v: `${num(b.L)} × ${num(b.W)} × ${num(b.H)} ${t("مم", "mm")}` },
        { k: t("المقاس الخارجي", "Outer size"), v: `${num(Math.round(spec.outer.w))} × ${num(Math.round(spec.outer.d))} × ${num(Math.round(spec.outer.h))} ${t("مم", "mm")}` },
        { k: t("الخامة", "Board"), v: `${b.board === "custom" ? b.customColor : pick(BOARDS[b.board].name)} · ${pick(FINISHES.find((f) => f.id === b.finish)!.name)} · ${t("البطانة", "lining")} ${b.interior}` },
        { k: t("الطباعة", "Print"), v: `${b.brand} / ${b.name} / ${b.details} · ${b.foil === "none" ? t("حبر", "ink") : `${t("فويل", "foil")} ${pick(FOILS[b.foil as keyof typeof FOILS].name)}`}${b.frame ? ` · ${t("إطار", "frame")}` : ""}${b.useLogo ? ` · ${t("شعار", "logo")}` : ""}` },
        { k: t("التأثيرات", "Effects"), v: fx.length ? fx.map((e) => pick(BOX_EFFECTS.find((x) => x.id === e)!.name)).join("، ") : t("بدون", "None") },
        { k: t("الملحقات", "Extras"), v: ex.length ? ex.map((e) => pick(EXTRAS.find((x) => x.id === e)!.name)).join("، ") : t("بدون", "None") },
      ],
    });
    // قالب القص من مكتبة ECMA/FEFCO: النوع والأبعاد والسماكة والخامة من كائن الهيكل نفسه الذي يولّد ملف SVG
    const st = resolveStructure(b);
    if (st) {
      const meta = structureById(st.type)!;
      const sheet = svgSheet(structureSvg(st));
      groups.push({
        title: t("قالب القص (Dieline)", "Dieline"),
        rows: [
          { k: t("الهيكل", "Structure"), v: `${pick(meta.name)} · ${meta.code}${b.structure ? "" : ` · ${t("تلقائي لنوع العلبة", "auto for this style")}`}` },
          { k: t("الأبعاد", "Dimensions"), v: `${paramsText(st, num)} ${t("مم", "mm")}` },
          { k: t("سماكة الخامة", "Board thickness"), v: `${num(st.t, 2)} ${t("مم", "mm")}` },
          { k: t("خامة القالب", "Stock"), v: pick(STOCKS[stockFor(st.type, b)].name) },
          { k: t("فرخ القالب", "Dieline sheet"), v: `${num(Math.round(sheet.w))} × ${num(Math.round(sheet.h))} ${t("مم", "mm")}` },
          { k: t("الملف", "File"), v: t("SVG بطبقات قص/طي/غراء يُرسل مع الطلب", "SVG with cut/fold/glue layers, sent with the request") },
        ],
      });
    }
  }
  // الإجماليات التقديرية لكل عبوة
  const bottleExtra = bottleSpecExtra(i.spec);
  const bottleSetup = bottleSpecSetup(i.spec);
  const lbl = i.label?.enabled ? estimateLabel(i.label, qty) : null;
  const bx = i.box ? estimateBox(i.box, qty, rates, tiers) : null;
  const sar = (n: number) => `${num(n, 2)} ${t("ر.س", "SAR")}`;
  const perUnit = bottleExtra + (lbl?.unit ?? 0) + (bx?.unit ?? 0);
  const setup = bottleSetup + (lbl?.setupTotal ?? 0) + (bx?.setupTotal ?? 0);
  const totals: Row[] = [
    { k: t("الكمية", "Quantity"), v: num(qty) },
    { k: t("إضافات العبوة لكل وحدة", "Bottle options per unit"), v: sar(bottleExtra) },
    ...(lbl ? [{ k: t("الملصقات لكل وحدة", "Labels per unit"), v: sar(lbl.unit) }] : []),
    ...(bx ? [{ k: t("العلبة وملحقاتها لكل وحدة", "Box & extras per unit"), v: sar(bx.unit) }] : []),
    { k: t("التجهيز لمرة (قوالب وكليشات)", "One-off tooling"), v: sar(setup) },
    { k: t("إجمالي التغليف التقديري لكل وحدة", "Estimated packaging per unit"), v: sar(perUnit) },
  ];
  return { groups, totals };
}
