import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useI18n, type Bi } from "@/i18n/context";
import { useContent } from "@/cms/ContentProvider";
import { printMethodById, recommendPrintMethod } from "@/data/printing";
import { buildPlan, weeks } from "@/production/plan";
import { CAP_FINISH, GLASS, LIQUID } from "../materials";
import { ModelPicker, Swatches } from "../pickers";
import type { PackModel } from "../types";
import { KITS, KIT_GROUPS, kitTier, type Kit, type KitGroup } from "../kits";
import { fittingCaps, labelLimits, recommendedStyles, refitLabel, withVolume, type Issue, type Patch } from "../rules";
import { MOULDS, PUMPS, bottleSpecExtra, bottleSpecSetup, estimateLabel, type BottleSpec } from "../spec";
import { BOARDS, STYLES, STYLE_GROUPS, fitFor, styleById, type Board, type BoxDesign, type BoxStyle } from "../box/types";
import { estimateBox } from "../box/pricing";
import { TEMPLATES, makeTemplate, type TemplateId } from "../label/templates";
import { FOILS, PAPERS, cleanProduction, type Foil, type LabelDesign, type Paper } from "../label/types";
import { readLogo } from "../label/logo";
import { Seg, Swatch } from "../ui";
import KitThumb from "./KitThumb";
import Readiness from "./Readiness";

// الاستوديو المبسّط: خمس خطوات بقرارات قليلة في كل واحدة، تبدأ من طقم جاهز وتنتهي بفحص توافق وسعر ومدة.
// الخيارات الدقيقة كلها باقية في «الوضع المتقدم»؛ هنا الأساسي فقط (إفصاح تدريجي).

export type GuideStep = "kit" | "bottle" | "label" | "box" | "review";
export const GUIDE_STEPS: GuideStep[] = ["kit", "bottle", "label", "box", "review"];
export const isGuideStep = (s: unknown): s is GuideStep => GUIDE_STEPS.includes(s as GuideStep);

export interface GuidedProps {
  models: PackModel[];
  bottle: PackModel | null;
  cap: PackModel | null;
  capId: string;
  glass: string;
  finish: string;
  liquid: string;
  spec: BottleSpec;
  label: LabelDesign | null;
  setLabel: (l: LabelDesign | null) => void;
  box: BoxDesign;
  includeBox: boolean;
  setBox: (b: BoxDesign) => void;
  setIncludeBox: (v: boolean) => void;
  fit: { w: number; d: number; h: number } | null;
  qty: number;
  setQty: (n: number) => void;
  setParams: (p: Record<string, string>) => void;
  applyPatch: (p: Patch) => void;
  issues: Issue[];
  onFixAll: () => void;
  step: GuideStep;
  setStep: (s: GuideStep) => void;
  kitId: string | null;
  onKit: (k: Kit) => void;
  onComplete: (() => void) | null;
  onSave: () => void;
  onTechPack: () => void;
  onPro: (tab?: "bottle" | "label" | "box") => void;
  designerLink: string;
  expertLink: string;
  signedIn: boolean;
  saved: { ok: boolean; text: string } | null;
  /** ما أخفته الإدارة من «مركز التحكم» */
  hiddenKits?: string[];
  featuredKits?: string[];
  hiddenStyles?: string[];
  hiddenTemplates?: string[];
}

const QTYS = [500, 1000, 2500, 5000, 10000];

function Field({ title, hint, children, n }: { title: string; hint?: string; children: ReactNode; n?: number }) {
  return (
    <div>
      <p className="flex items-baseline gap-2 mb-2">
        {n !== undefined && <span className="w-5 h-5 shrink-0 rounded-full bg-ink-900 text-white text-[11px] inline-flex items-center justify-center font-mono">{n}</span>}
        <span className="text-sm text-ink-900">{title}</span>
        {hint && <span className="text-[11px] text-paper-500">{hint}</span>}
      </p>
      {children}
    </div>
  );
}

function Tier({ n }: { n: 1 | 2 | 3 }) {
  const { t } = useI18n();
  const label = n === 1 ? t("اقتصادي", "Economy") : n === 2 ? t("متوسط", "Mid") : t("فاخر", "Premium");
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-paper-500" title={label}>
      <span aria-hidden="true" className="tracking-tight">{[1, 2, 3].map((i) => <span key={i} className={i <= n ? "text-ink-900" : "text-paper-300"}>●</span>)}</span>
      {label}
    </span>
  );
}

function KitStep(p: GuidedProps) {
  const { t, pick, num } = useI18n();
  const [group, setGroup] = useState<KitGroup | "featured">("featured");
  const bottles = p.models.filter((m) => m.kind === "bottle");
  const caps = p.models.filter((m) => m.kind === "cap");
  const visible = useMemo(() => KITS.filter((k) => !(p.hiddenKits ?? []).includes(k.id)), [p.hiddenKits]);
  const featured = useMemo(() => {
    const chosen = (p.featuredKits ?? []).map((id) => visible.find((k) => k.id === id)).filter((k): k is Kit => !!k);
    // بلا اختيار من الإدارة: أول طقم من كل مجموعة
    return chosen.length ? chosen : KIT_GROUPS.map((g) => visible.find((k) => k.group === g.id)).filter((k): k is Kit => !!k);
  }, [visible, p.featuredKits]);
  const list = group === "featured" ? featured : visible.filter((k) => k.group === group);
  const chip = (on: boolean) => `shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors ${on ? "border-ink-900 bg-ink-900 text-white" : "border-paper-200 bg-white text-ink-900 hover:border-ink-900"}`;
  return (
    <div className="space-y-4" data-testid="kit-step">
      <div>
        <h2 className="font-display text-2xl text-ink-900">{t("ابدأ من طقم جاهز", "Start from a ready kit")}</h2>
        <p className="mt-1 text-sm text-paper-600 leading-[1.8]">{t(`${num(visible.length)} طقماً منسجماً: عبوة وغطاء وملصق وعلبة على مقاسها. اختر الأقرب لك ثم عدّل الاسم والألوان.`, `${visible.length} matched kits: bottle, cap, label and a box sized to fit. Pick the closest, then change the name and colours.`)}</p>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" role="tablist" aria-label={t("مجموعات الأطقم", "Kit groups")}>
        <button type="button" role="tab" aria-selected={group === "featured"} onClick={() => setGroup("featured")} className={chip(group === "featured")}>{t("مختارات", "Featured")}</button>
        {KIT_GROUPS.filter((g) => visible.some((k) => k.group === g.id)).map((g) => (
          <button key={g.id} type="button" role="tab" aria-selected={group === g.id} onClick={() => setGroup(g.id)} className={chip(group === g.id)}>
            <i className={`${g.icon} me-1`} aria-hidden="true"></i>
            {pick(g.name)}
          </button>
        ))}
      </div>
      {group !== "featured" && <p className="text-xs text-paper-500">{pick(KIT_GROUPS.find((g) => g.id === group)!.note)}</p>}
      <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label={t("الأطقم الجاهزة", "Ready kits")}>
        {list.map((k) => {
          const on = p.kitId === k.id;
          const b = bottles.find((x) => x.id === k.bottle) ?? null;
          const c = caps.find((x) => x.id === k.cap) ?? null;
          return (
            <button key={k.id} type="button" role="radio" aria-checked={on} onClick={() => p.onKit(k)} data-kit={k.id} className={`text-start rounded-2xl border overflow-hidden bg-white transition-colors ${on ? "border-ink-900 ring-1 ring-ink-900" : "border-paper-200 hover:border-paper-400"}`}>
              <span className="block bg-[#f3f1ec]"><KitThumb kit={k} bottle={b} cap={c} className="w-full h-28" /></span>
              <span className="block p-2.5">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm text-ink-900 truncate">{pick(k.name)}</span>
                  {on && <i className="ri-checkbox-circle-fill text-ink-900" aria-hidden="true"></i>}
                </span>
                <span className="mt-0.5 block text-[11px] text-paper-500 leading-[1.5] line-clamp-2 min-h-[2.1rem]">{pick(k.note)}</span>
                <span className="mt-1.5 flex items-center justify-between gap-2">
                  <Tier n={kitTier(k)} />
                  {b?.capacityMl ? <span className="text-[10px] text-paper-500">{t(`${num(b.capacityMl)} مل`, `${b.capacityMl} ml`)}</span> : null}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-paper-500">
        {t("تفضّل البدء من الصفر؟", "Prefer a blank start?")}{" "}
        <button type="button" onClick={() => p.setStep("bottle")} className="underline underline-offset-4 text-ink-900">{t("اختر العبوة بنفسك", "Pick the bottle yourself")}</button>
      </p>
    </div>
  );
}

function BottleStep(p: GuidedProps) {
  const { t, pick, num } = useI18n();
  const [more, setMore] = useState(false);
  const bottles = p.models.filter((m) => m.kind === "bottle");
  const caps = p.models.filter((m) => m.kind === "cap");
  const sizes = [...new Set(bottles.map((b) => b.capacityMl ?? 0).filter(Boolean))].sort((a, b) => a - b);
  const size = p.bottle?.capacityMl ?? sizes[0];
  const shapes = bottles.filter((b) => (b.capacityMl ?? 0) === size);
  const ai = p.bottle?.source === "ai";
  const okCaps = p.bottle ? fittingCaps(p.bottle, caps) : caps;
  const hiddenCaps = caps.length - okCaps.length;
  const chip = (on: boolean) => `rounded-full border px-3.5 py-1.5 text-sm transition-colors ${on ? "border-ink-900 bg-ink-900 text-white" : "border-paper-200 bg-white text-ink-900 hover:border-ink-900"}`;
  return (
    <div className="space-y-5" data-testid="bottle-step">
      <h2 className="font-display text-2xl text-ink-900">{t("العبوة", "The bottle")}</h2>
      <Field n={1} title={t("الحجم", "Size")}>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("حجم العبوة", "Bottle size")}>
          {sizes.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={s === size} onClick={() => p.setParams({ b: bottles.find((b) => b.capacityMl === s)!.id })} className={chip(s === size)}>
              {t(`${num(s)} مل`, `${s} ml`)}
            </button>
          ))}
        </div>
      </Field>
      <Field n={2} title={t("الشكل", "Shape")} hint={shapes.length > 1 ? t(`${num(shapes.length)} أشكال بهذا الحجم`, `${shapes.length} shapes in this size`) : undefined}>
        <ModelPicker items={shapes} value={p.bottle?.id} onChange={(id) => p.setParams({ b: id })} cap={p.cap} label={t("شكل العبوة", "Bottle shape")} />
      </Field>
      {!ai && (
        <>
          <Field n={3} title={t("لون الزجاج", "Glass")}>
            <Swatches items={GLASS} value={p.glass} onChange={(id) => p.setParams({ g: id })} label={t("الزجاج", "Glass")} />
          </Field>
          <Field n={4} title={t("الغطاء", "Cap")} hint={hiddenCaps > 0 ? t(`أخفينا ${num(hiddenCaps)} لا تركب على هذا العنق`, `${hiddenCaps} hidden: they don't fit this neck`) : undefined}>
            <ModelPicker items={okCaps} value={p.capId} onChange={(id) => p.setParams({ c: id })} label={t("الغطاء", "Cap")} allowNone={t("بدون", "None")} />
            {p.cap && (
              <div className="mt-3">
                <Swatches items={CAP_FINISH} value={p.finish} onChange={(id) => p.setParams({ cf: id })} label={t("تشطيب الغطاء", "Cap finish")} />
              </div>
            )}
          </Field>
          <Field n={5} title={t("لون العطر", "Scent colour")}>
            <Swatches items={LIQUID} value={p.liquid} onChange={(id) => p.setParams({ l: id })} label={t("لون العطر", "Scent colour")} />
          </Field>
        </>
      )}
      <div className="rounded-2xl border border-paper-200 bg-white">
        <button type="button" onClick={() => setMore((v) => !v)} aria-expanded={more} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-start">
          <span>
            <span className="block text-sm text-ink-900">{t("خيارات التصنيع (اختياري)", "Manufacturing options (optional)")}</span>
            <span className="block text-[11px] text-paper-500 mt-0.5">{[pick(PUMPS.find((x) => x.id === p.spec.pump)!.name), pick(MOULDS.find((x) => x.id === (p.spec.mould ?? "catalogue"))!.name)].join(" · ")}</span>
          </span>
          <i className={`ri-arrow-${more ? "up" : "down"}-s-line text-lg text-paper-500`} aria-hidden="true"></i>
        </button>
        {more && (
          <div className="px-4 pb-4 space-y-4 border-t border-paper-100 pt-4">
            <div>
              <p className="text-xs text-paper-600 mb-1.5">{t("طريقة الاستخدام", "How it's applied")}</p>
              <Seg label={t("المضخة", "Pump")} small value={p.spec.pump} onChange={(v) => p.setParams({ pm: v === "standard" ? "" : v })} options={PUMPS.map((x) => ({ id: x.id, label: pick(x.name), extra: x.perUnit }))} />
              <p className="mt-1.5 text-[11px] text-paper-500">{pick(PUMPS.find((x) => x.id === p.spec.pump)!.note)}</p>
            </div>
            <div>
              <p className="text-xs text-paper-600 mb-1.5">{t("مصدر الشكل", "Source of the shape")}</p>
              <Seg label={t("القالب", "Mould")} small value={p.spec.mould ?? "catalogue"} onChange={(v) => p.setParams({ md: v === "catalogue" ? "" : v })} options={MOULDS.map((x) => ({ id: x.id, label: pick(x.name) }))} />
              <p className="mt-1.5 text-[11px] text-paper-500">{pick(MOULDS.find((x) => x.id === (p.spec.mould ?? "catalogue"))!.note)}</p>
            </div>
            <button type="button" onClick={() => p.onPro("bottle")} className="text-xs underline underline-offset-4 text-ink-900">{t("كل خيارات التصنيع في الوضع المتقدم", "All manufacturing options in advanced mode")}</button>
          </div>
        )}
      </div>
    </div>
  );
}

function LabelStep(p: GuidedProps) {
  const { t, pick } = useI18n();
  const [all, setAll] = useState(false);
  const [err, setErr] = useState("");
  const b = p.bottle;
  if (!b) return null;
  if (b.source === "ai") return <p className="rounded-2xl bg-white border border-paper-200 p-4 text-sm text-paper-600 leading-[1.8]">{t("هذا النموذج يُعرض بملصقه كما صُوِّر. اختر شكلاً من الكتالوج لتصميم ملصق جديد.", "This model shows its label as photographed. Pick a catalogue shape to design a new label.")}</p>;
  const l = p.label;
  const on = !!l?.enabled;
  const txt = (id: "brand" | "name") => l?.texts.find((x) => x.id === id)?.text ?? "";
  const setText = (id: "brand" | "name", v: string) => {
    if (!l) return;
    p.setLabel({ ...l, texts: l.texts.map((x) => (x.id === id ? { ...x, text: v } : x)) });
    // العلبة تحمل الاسم نفسه دائماً في الوضع المبسّط
    if (p.includeBox) p.setBox({ ...p.box, [id === "brand" ? "brand" : "name"]: v });
  };
  const pickTemplate = (id: TemplateId) => {
    const brand = txt("brand") || "نور", name = txt("name") || "عود الليل";
    const next = refitLabel(withVolume({ ...makeTemplate(id, b, brand, name), logo: l?.logo ?? null }, b.capacityMl), b);
    p.setLabel(next);
  };
  const current = TEMPLATES.find((x) => l && l.shape === makeTemplate(x.id, b).shape && l.paper === makeTemplate(x.id, b).paper && (l.paper !== "custom" || l.customColor === makeTemplate(x.id, b).customColor) && l.texts[0]?.font === makeTemplate(x.id, b).texts[0]?.font)?.id;
  const tpls = TEMPLATES.filter((x) => x.id === current || !(p.hiddenTemplates ?? []).includes(x.id));
  const shown = all ? tpls : tpls.slice(0, 6).some((x) => x.id === current) || !current ? tpls.slice(0, 6) : [...tpls.slice(0, 5), tpls.find((x) => x.id === current)!];
  const lim = labelLimits(b);
  const upload = async (f: File | undefined) => {
    setErr("");
    if (!f || !l) return;
    if (f.size > 5 * 1024 * 1024) return setErr(t("الملف أكبر من 5 ميغابايت.", "The file is larger than 5 MB."));
    try {
      const dataUrl = await readLogo(f);
      // الشعار يحل محل اسم الدار نصاً: يصعد لأعلى الملصق
      p.setLabel({ ...l, logo: { dataUrl, widthMm: Math.round(l.widthMm * 0.3), y: 0.22, foil: "none" } });
    } catch {
      setErr(t("تعذّرت قراءة الصورة.", "Couldn't read the image."));
    }
  };
  const input = "w-full rounded-xl border border-paper-200 bg-white px-3 py-2.5 text-sm text-ink-900 focus:outline-none focus:border-ink-900";
  return (
    <div className="space-y-5" data-testid="label-step">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-2xl text-ink-900">{t("الملصق", "The label")}</h2>
        <label className="inline-flex items-center gap-2 text-sm text-ink-900">
          <input type="checkbox" role="switch" checked={on} onChange={(e) => p.setLabel(l ? { ...l, enabled: e.target.checked } : e.target.checked ? refitLabel(withVolume(makeTemplate("minimal", b), b.capacityMl), b) : null)} className="w-5 h-5 accent-ink-900" />
          {t("ملصق على العبوة", "Label on the bottle")}
        </label>
      </div>
      {!on ? (
        <p className="rounded-2xl bg-white border border-paper-200 p-4 text-sm text-paper-600 leading-[1.8]">{t("بلا ملصق: مناسب إن اخترت طباعة مباشرة على الزجاج أو نقشاً. فعّل الملصق لتصميمه.", "No label: fine if you chose direct print or engraving on the glass. Switch it on to design one.")}</p>
      ) : (
        <>
          <Field n={1} title={t("الاسم", "The name")}>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="sr-only">{t("اسم الدار", "Brand name")}</span>
                <input value={txt("brand")} maxLength={40} onChange={(e) => setText("brand", e.target.value)} placeholder={t("اسم الدار", "Brand name")} className={input} dir="auto" />
              </label>
              <label className="block">
                <span className="sr-only">{t("اسم العطر", "Scent name")}</span>
                <input value={txt("name")} maxLength={40} onChange={(e) => setText("name", e.target.value)} placeholder={t("اسم العطر", "Scent name")} className={input} dir="auto" />
              </label>
            </div>
          </Field>
          <Field n={2} title={t("الشعار", "Logo")} hint={t("اختياري — PNG شفاف أو SVG", "Optional — transparent PNG or SVG")}>
            <div className="flex items-center gap-3">
              <label className="rounded-full border border-paper-300 bg-white px-4 py-2 text-sm text-ink-900 hover:border-ink-900 cursor-pointer inline-flex items-center gap-2">
                <i className="ri-upload-2-line" aria-hidden="true"></i>
                {l?.logo ? t("غيّر الشعار", "Change logo") : t("ارفع شعارك", "Upload your logo")}
                <input type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp" className="sr-only" onChange={(e) => void upload(e.target.files?.[0])} />
              </label>
              {l?.logo && (
                <>
                  <img src={l.logo.dataUrl} alt="" className="h-9 w-9 object-contain rounded-lg border border-paper-200 bg-white" />
                  <button type="button" onClick={() => p.setLabel({ ...l, logo: null })} className="text-xs text-paper-500 underline underline-offset-4">{t("إزالة", "Remove")}</button>
                </>
              )}
            </div>
            {err && <p role="alert" className="mt-2 text-xs text-red-700">{err}</p>}
          </Field>
          <Field n={3} title={t("القالب", "Template")}>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t("قوالب الملصق", "Label templates")}>
              {shown.map((x) => (
                <button key={x.id} type="button" role="radio" aria-checked={current === x.id} onClick={() => pickTemplate(x.id)} data-template={x.id} className={`rounded-xl border p-2 text-center transition-colors ${current === x.id ? "border-ink-900 bg-white" : "border-paper-200 bg-white/60 hover:border-paper-400"}`}>
                  <span className="mx-auto block w-full h-9 rounded-md border border-black/10 relative overflow-hidden" style={{ background: x.swatch[0] }} aria-hidden="true">
                    <span className="absolute inset-x-[22%] top-[36%] h-[3px] rounded" style={{ background: x.swatch[1] }} />
                    <span className="absolute inset-x-[32%] top-[58%] h-[2px] rounded opacity-60" style={{ background: x.swatch[1] }} />
                  </span>
                  <span className="mt-1.5 block text-[11px] text-ink-900 truncate">{pick(x.name)}</span>
                </button>
              ))}
            </div>
            {!all && tpls.length > shown.length && (
              <button type="button" onClick={() => setAll(true)} className="mt-2 text-xs underline underline-offset-4 text-ink-900">{t(`عرض كل القوالب (${tpls.length})`, `Show all templates (${tpls.length})`)}</button>
            )}
          </Field>
          <Field n={4} title={t("لون الورق", "Paper colour")}>
            <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label={t("لون الورق", "Paper colour")}>
              {(Object.keys(PAPERS) as Exclude<Paper, "custom">[]).map((k) => (
                <Swatch key={k} selected={l!.paper === k} onSelect={() => p.setLabel({ ...l!, paper: k })} bg={PAPERS[k].swatch} label={pick(PAPERS[k].name)} />
              ))}
              <label className={`w-[3.4rem] flex flex-col items-center gap-1 text-[10px] ${l!.paper === "custom" ? "text-ink-900" : "text-paper-500"}`}>
                <span className={`w-8 h-8 rounded-full border-2 overflow-hidden ${l!.paper === "custom" ? "border-ink-900" : "border-paper-200"}`} style={{ background: l!.customColor }}>
                  <input type="color" value={l!.customColor} onChange={(e) => p.setLabel({ ...l!, paper: "custom", customColor: e.target.value })} className="w-full h-full opacity-0 cursor-pointer" aria-label={t("لون مخصص", "Custom colour")} />
                </span>
                {t("لونك", "Yours")}
              </label>
            </div>
          </Field>
          <p className="text-[11px] text-paper-500 leading-[1.7]">
            <i className="ri-ruler-line me-1" aria-hidden="true"></i>
            {t(`المقاس ${l!.widthMm}×${l!.heightMm} مم، مضبوط داخل جسم العبوة (الحد ${lim.maxW}×${lim.maxH} مم).`, `Size ${l!.widthMm}×${l!.heightMm} mm, kept on the bottle body (limit ${lim.maxW}×${lim.maxH} mm).`)}{" "}
            <button type="button" onClick={() => p.onPro("label")} className="underline underline-offset-4 text-ink-900">{t("الشكل والموضع والخامة والنقش في الوضع المتقدم", "Shape, position, material and engraving in advanced mode")}</button>
          </p>
        </>
      )}
    </div>
  );
}

function BoxStep(p: GuidedProps) {
  const { t, pick, num } = useI18n();
  const money = (n: number) => t(`${num(n, 2)} ر.س`, `SAR ${num(n, 2)}`);
  const [all, setAll] = useState(false);
  const pricing = useContent("pricing");
  const b = p.bottle;
  const rec = useMemo(() => (b ? recommendedStyles(b, p.cap) : []).filter((s) => !(p.hiddenStyles ?? []).includes(s)), [b, p.cap, p.hiddenStyles]);
  const d = p.box;
  const setStyle = (s: BoxStyle) => p.setBox({ ...d, style: s, ...(p.fit ? fitFor(s, p.fit) : {}), structure: null, autoFit: true });
  const price = (s: BoxStyle) => {
    try {
      return estimateBox({ ...d, style: s, ...(p.fit ? fitFor(s, p.fit) : {}), structure: null }, p.qty, pricing.box, pricing.calc.tiers).unit;
    } catch {
      return null;
    }
  };
  const card = (s: BoxStyle, first: boolean) => {
    const m = styleById(s);
    const on = p.includeBox && d.style === s;
    const u = price(s);
    return (
      <button key={s} type="button" role="radio" aria-checked={on} onClick={() => { p.setIncludeBox(true); setStyle(s); }} data-style={s} className={`text-start rounded-2xl border p-3 transition-colors ${on ? "border-ink-900 bg-white ring-1 ring-ink-900" : "border-paper-200 bg-white/70 hover:border-paper-400"}`}>
        <span className="flex items-start justify-between gap-2">
          <i className={`${m.icon} text-xl text-ink-900`} aria-hidden="true"></i>
          {first && <span className="rounded-full bg-accent3-soft text-accent3-ink px-2 py-0.5 text-[10px]">{t("الأنسب لعبوتك", "Best for your bottle")}</span>}
        </span>
        <span className="mt-1.5 block text-sm text-ink-900 leading-tight">{pick(m.name)}</span>
        <span className="mt-1 block text-[11px] text-paper-500 leading-[1.5] line-clamp-2">{pick(m.note)}</span>
        {u !== null && <span className="mt-1.5 block text-[11px] text-ink-900 font-mono" dir="ltr" style={{ textAlign: "start" }}>≈ {money(u)}</span>}
      </button>
    );
  };
  return (
    <div className="space-y-5" data-testid="box-step">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-2xl text-ink-900">{t("العلبة", "The box")}</h2>
        <label className="inline-flex items-center gap-2 text-sm text-ink-900">
          <input type="checkbox" role="switch" checked={p.includeBox} onChange={(e) => p.setIncludeBox(e.target.checked)} className="w-5 h-5 accent-ink-900" />
          {t("أريد علبة", "I want a box")}
        </label>
      </div>
      {!p.includeBox ? (
        <p className="rounded-2xl bg-white border border-paper-200 p-4 text-sm text-paper-600 leading-[1.8]">{t("بلا علبة: العبوة تُسلَّم في كراتين شحن مقسّمة. فعّل العلبة لاختيار شكلها.", "No box: bottles ship in divided cartons. Switch it on to choose a style.")}</p>
      ) : (
        <>
          <p className="rounded-xl border border-[#1F6B4F]/30 bg-[#E6F2EC] text-[#1F6B4F] px-3 py-2.5 text-xs leading-[1.7] flex items-start gap-2" data-testid="auto-fit-note">
            <i className="ri-ruler-2-line text-base mt-0.5" aria-hidden="true"></i>
            <span>{t(`المقاس يتبع عبوتك تلقائياً: ${num(d.L)}×${num(d.W)}×${num(d.H)} مم من الداخل. غيّر العبوة أو الغطاء وتتغير العلبة معهما.`, `The size follows your bottle: ${d.L}×${d.W}×${d.H} mm inside. Change the bottle or cap and the box follows.`)}</span>
          </p>
          <Field n={1} title={t("الشكل", "Style")} hint={t(`السعر التقريبي للعلبة عند ${num(p.qty)} قطعة`, `Approx. box price at ${p.qty} pcs`)}>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t("شكل العلبة", "Box style")}>
              {rec.map((s, i) => card(s, i === 0))}
              {!rec.includes(d.style) && card(d.style, false)}
            </div>
            <button type="button" onClick={() => setAll((v) => !v)} aria-expanded={all} className="mt-3 text-xs underline underline-offset-4 text-ink-900">
              {all ? t("إخفاء بقية الأشكال", "Hide the other styles") : t(`عرض كل الأشكال (${STYLES.length - (p.hiddenStyles?.length ?? 0)})`, `Show all styles (${STYLES.length - (p.hiddenStyles?.length ?? 0)})`)}
            </button>
            {all && (
              <div className="mt-3 space-y-4" data-testid="all-styles">
                {STYLE_GROUPS.map((g) => {
                  const items = STYLES.filter((s) => s.group === g.id && !rec.includes(s.id) && !(p.hiddenStyles ?? []).includes(s.id));
                  if (!items.length) return null;
                  return (
                    <div key={g.id}>
                      <p className="text-xs text-paper-600 mb-1.5">{pick(g.name)}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {items.map((s) => (
                          <button key={s.id} type="button" onClick={() => setStyle(s.id)} aria-pressed={d.style === s.id} title={pick(s.note)} className={`rounded-full border px-3 py-1.5 text-xs inline-flex items-center gap-1.5 ${d.style === s.id ? "border-ink-900 bg-ink-900 text-white" : "border-paper-200 bg-white text-ink-900 hover:border-ink-900"}`}>
                            <i className={s.icon} aria-hidden="true"></i>
                            {pick(s.name)}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Field>
          <Field n={2} title={t("اللون", "Colour")}>
            <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label={t("لون العلبة", "Box colour")}>
              {(Object.keys(BOARDS) as Exclude<Board, "custom">[]).map((k) => (
                <Swatch key={k} selected={d.board === k} onSelect={() => p.setBox({ ...d, board: k })} bg={BOARDS[k].color} label={pick(BOARDS[k].name)} />
              ))}
              <label className={`w-[3.4rem] flex flex-col items-center gap-1 text-[10px] ${d.board === "custom" ? "text-ink-900" : "text-paper-500"}`}>
                <span className={`w-8 h-8 rounded-full border-2 overflow-hidden ${d.board === "custom" ? "border-ink-900" : "border-paper-200"}`} style={{ background: d.customColor }}>
                  <input type="color" value={d.customColor} onChange={(e) => p.setBox({ ...d, board: "custom", customColor: e.target.value })} className="w-full h-full opacity-0 cursor-pointer" aria-label={t("لون مخصص", "Custom colour")} />
                </span>
                {t("لونك", "Yours")}
              </label>
            </div>
          </Field>
          <Field n={3} title={t("لمسة الفويل", "Foil accent")}>
            <Seg label={t("الفويل", "Foil")} small value={d.foil} onChange={(foil: Foil) => p.setBox({ ...d, foil, frame: foil !== "none" && d.frame })} options={[{ id: "none" as Foil, label: t("بدون", "None") }, ...(Object.keys(FOILS) as Exclude<Foil, "none">[]).map((k) => ({ id: k as Foil, label: pick(FOILS[k].name), swatch: FOILS[k].color }))]} />
          </Field>
          <p className="text-[11px] text-paper-500 leading-[1.7]">
            <button type="button" onClick={() => p.onPro("box")} className="underline underline-offset-4 text-ink-900">{t("المقاس اليدوي، قالب القص، الخامات والملحقات في الوضع المتقدم", "Manual size, dieline, materials and extras in advanced mode")}</button>
          </p>
        </>
      )}
    </div>
  );
}

function ReviewStep(p: GuidedProps) {
  const { t, pick, num, sar, date } = useI18n();
  const money = (n: number) => t(`${num(n, 2)} ر.س`, `SAR ${num(n, 2)}`);
  const [menu, setMenu] = useState(false);
  const pricing = useContent("pricing");
  const label = p.label?.enabled ? p.label : null;
  const est = useMemo(() => {
    const box = p.includeBox ? estimateBox(p.box, p.qty, pricing.box, pricing.calc.tiers) : null;
    const lbl = label ? estimateLabel(label, p.qty) : null;
    const extra = bottleSpecExtra(p.spec), setup = bottleSpecSetup(p.spec);
    const lines: { k: string; label: Bi; unit: number }[] = [
      ...(box ? [{ k: "box", label: { ar: `العلبة: ${styleById(p.box.style).name.ar}`, en: `Box: ${styleById(p.box.style).name.en}` }, unit: box.unit }] : []),
      ...(lbl ? [{ k: "label", label: { ar: "الملصق", en: "Label" }, unit: lbl.unit }] : []),
      ...(extra > 0 ? [{ k: "spec", label: { ar: "خيارات تصنيع العبوة", en: "Bottle manufacturing options" }, unit: extra + setup / p.qty }] : []),
    ];
    const unit = Math.round(lines.reduce((s, l) => s + l.unit, 0) * 100) / 100;
    return { lines, unit, total: Math.round(unit * p.qty) };
  }, [p.includeBox, p.box, p.qty, p.spec, label, pricing]);
  const plan = useMemo(() => {
    const method = label ? label.printMethod ?? recommendPrintMethod({ qty: p.qty, material: cleanProduction(label).material, effects: cleanProduction(label).effects }).id : null;
    return buildPlan({ track: "C", qty: p.qty, mould: p.spec.mould ?? "catalogue", box: p.includeBox ? styleById(p.box.style).family : null, labelPrint: method, deco: p.spec.deco !== "none" });
  }, [p.qty, p.spec, p.includeBox, p.box.style, label]);
  const w = weeks(plan.total);
  const blocked = p.issues.some((i) => i.level === "error");
  const method = label ? printMethodById(label.printMethod ?? recommendPrintMethod({ qty: p.qty, material: cleanProduction(label).material, effects: cleanProduction(label).effects }).id) : null;
  return (
    <div className="space-y-4" data-testid="review-step">
      <h2 className="font-display text-2xl text-ink-900">{t("المراجعة والطلب", "Review & order")}</h2>
      <Readiness issues={p.issues} onFix={p.applyPatch} onFixAll={p.onFixAll} />
      <section className="rounded-2xl bg-white border border-paper-200 p-4" aria-labelledby="rv-qty">
        <p id="rv-qty" className="text-sm text-ink-900 mb-2">{t("الكمية", "Quantity")}</p>
        <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={t("الكمية", "Quantity")}>
          {QTYS.map((q) => (
            <button key={q} type="button" role="radio" aria-checked={p.qty === q} onClick={() => p.setQty(q)} className={`rounded-full border px-3 py-1.5 text-sm font-mono ${p.qty === q ? "border-ink-900 bg-ink-900 text-white" : "border-paper-200 text-ink-900 hover:border-ink-900"}`}>{num(q)}</button>
          ))}
          <label className="inline-flex items-center gap-1.5 text-xs text-paper-500">
            <span className="sr-only">{t("كمية أخرى", "Another quantity")}</span>
            <input type="number" min={100} max={500000} step={100} value={p.qty} onChange={(e) => p.setQty(Math.min(500000, Math.max(100, Math.round(Number(e.target.value) || 100))))} className="w-24 rounded-full border border-paper-200 bg-white px-3 py-1.5 text-sm font-mono text-ink-900" aria-label={t("كمية أخرى", "Another quantity")} />
          </label>
        </div>
      </section>
      <section className="rounded-2xl bg-white border border-paper-200 overflow-hidden" aria-labelledby="rv-price" data-testid="review-price">
        <div className="grid grid-cols-2 gap-px bg-paper-200">
          <div className="bg-white p-4">
            <p id="rv-price" className="text-xs text-paper-500">{t("التغليف والطباعة لكل وحدة", "Packaging & print per unit")}</p>
            <p className="mt-1 font-display text-2xl text-ink-900" data-testid="unit-price">{money(est.unit)}</p>
            <p className="text-[11px] text-paper-500">{t(`الإجمالي ≈ ${sar(est.total)} قبل الضريبة`, `Total ≈ ${sar(est.total)} before VAT`)}</p>
          </div>
          <div className="bg-white p-4">
            <p className="text-xs text-paper-500">{t("المدة من اعتماد العرض", "Lead time from approval")}</p>
            <p className="mt-1 font-display text-2xl text-ink-900" data-testid="lead-time">{w[0] === w[1] ? t(`${num(w[0])} أسابيع`, `${w[0]} weeks`) : t(`${num(w[0])} – ${num(w[1])} أسابيع`, `${w[0]} – ${w[1]} weeks`)}</p>
            <p className="text-[11px] text-paper-500">{t(`التسليم المتوقع حتى ${date(plan.eta[1], { day: "numeric", month: "long" })}`, `Expected by ${date(plan.eta[1], { day: "numeric", month: "long" })}`)}</p>
          </div>
        </div>
        <ul className="px-4 py-3 space-y-1 text-xs text-paper-600 border-t border-paper-200">
          {est.lines.map((l) => (
            <li key={l.k} className="flex justify-between gap-3"><span>{pick(l.label)}</span><span className="font-mono text-ink-900" dir="ltr">{money(l.unit)}</span></li>
          ))}
          {method && <li className="flex justify-between gap-3"><span>{t("طباعة الملصق", "Label print")}</span><span className="text-ink-900">{pick(method.short)}</span></li>}
          {plan.driver && <li className="flex justify-between gap-3"><span>{t("ما يحدد الموعد", "What drives the date")}</span><span className="text-ink-900">{pick(plan.driver.name)}</span></li>}
        </ul>
        <p className="px-4 pb-3 text-[11px] text-paper-400 leading-[1.6]">{t("تقدير أولي لا يشمل العطر والتعبئة. العرض الرسمي يصلك خلال يوم عمل.", "A first estimate, excluding the fragrance and filling. The formal quote arrives within one business day.")} <Link to="/pricing" className="underline underline-offset-2">{t("احسب تكلفة العطر كاملاً", "Estimate the whole perfume")}</Link></p>
      </section>
      <div className="rounded-[1.5rem] bg-ink-900 text-white p-5">
        <div className="flex flex-wrap items-center gap-2">
          {p.onComplete && (
            <button type="button" onClick={p.onComplete} disabled={blocked} className="rounded-full bg-white text-ink-900 px-5 py-3 text-sm inline-flex items-center gap-2 disabled:opacity-50" data-testid="send-request">
              {t("أرسل الطلب بهذا التصميم", "Send the request with this design")}
              <i className="ri-arrow-left-line rtl:rotate-0 ltr:rotate-180" aria-hidden="true"></i>
            </button>
          )}
          <button type="button" onClick={p.onSave} className="rounded-full border border-white/30 px-4 py-3 text-sm inline-flex items-center gap-2 hover:bg-white/10">
            <i className="ri-bookmark-line" aria-hidden="true"></i>
            {p.signedIn ? t("احفظ في حسابي", "Save to my account") : t("سجّل الدخول للحفظ", "Sign in to save")}
          </button>
          <div className="relative">
            <button type="button" onClick={() => setMenu((v) => !v)} aria-expanded={menu} aria-haspopup="menu" className="rounded-full border border-white/30 px-4 py-3 text-sm inline-flex items-center gap-1 hover:bg-white/10">
              {t("المزيد", "More")}
              <i className="ri-arrow-down-s-line" aria-hidden="true"></i>
            </button>
            {menu && (
              <div role="menu" className="absolute z-20 bottom-full mb-2 end-0 w-60 rounded-2xl bg-white text-ink-900 border border-paper-200 shadow-xl p-1.5 text-sm">
                <button type="button" role="menuitem" onClick={() => { setMenu(false); p.onTechPack(); }} className="w-full text-start rounded-xl px-3 py-2 hover:bg-paper-50 flex items-center gap-2"><i className="ri-file-list-3-line" aria-hidden="true"></i>{t("ورقة المواصفات", "Spec sheet")}</button>
                <Link role="menuitem" to={p.designerLink} className="rounded-xl px-3 py-2 hover:bg-paper-50 flex items-center gap-2"><i className="ri-palette-line" aria-hidden="true"></i>{t("أكملها مع مصمم", "Finish it with a designer")}</Link>
                <Link role="menuitem" to={p.expertLink} className="rounded-xl px-3 py-2 hover:bg-paper-50 flex items-center gap-2"><i className="ri-phone-line" aria-hidden="true"></i>{t("ناقشها مع خبير", "Discuss it with an expert")}</Link>
                <button type="button" role="menuitem" onClick={() => { setMenu(false); p.onPro(); }} className="w-full text-start rounded-xl px-3 py-2 hover:bg-paper-50 flex items-center gap-2"><i className="ri-equalizer-line" aria-hidden="true"></i>{t("الوضع المتقدم", "Advanced mode")}</button>
              </div>
            )}
          </div>
        </div>
        {blocked && <p className="mt-3 text-xs text-red-300">{t("أصلح المشاكل أعلاه أولاً: هذا التصميم لا يُصنَّع كما هو.", "Fix the issues above first: this design can't be made as is.")}</p>}
        {p.saved && (
          <p role={p.saved.ok ? "status" : "alert"} className={`mt-3 text-sm ${p.saved.ok ? "text-white" : "text-red-300"}`}>
            {p.saved.text}
            {p.saved.ok && <Link to="/account/designs" className="ms-2 underline underline-offset-4">{t("تصاميمي", "My designs")}</Link>}
          </p>
        )}
        <p className="mt-3 text-xs text-white/50 leading-[1.7]">{t("بعد الإرسال يتصل بك مدير مشروع خلال يوم عمل، وتُؤكَّد الخامات بعينة فعلية قبل الإنتاج.", "After sending, a project manager calls within one business day, and materials are confirmed with a physical sample before production.")}</p>
      </div>
    </div>
  );
}

export default function GuidedPanel(p: GuidedProps) {
  const { t, num } = useI18n();
  const labels: Record<GuideStep, string> = { kit: t("الطقم", "Kit"), bottle: t("العبوة", "Bottle"), label: t("الملصق", "Label"), box: t("العلبة", "Box"), review: t("المراجعة", "Review") };
  const at = GUIDE_STEPS.indexOf(p.step);
  const prev = GUIDE_STEPS[at - 1], next = GUIDE_STEPS[at + 1];
  const errorsAt = (s: GuideStep) => p.issues.filter((i) => i.level === "error" && (s === "bottle" ? i.area === "bottle" : s === "label" ? i.area === "label" : s === "box" ? i.area === "box" : false)).length;
  return (
    <div className="space-y-5" data-testid="guided">
      <nav aria-label={t("خطوات التصميم", "Design steps")}>
        <ol className="flex items-center gap-1">
          {GUIDE_STEPS.map((s, i) => {
            const on = s === p.step, done = i < at, bad = errorsAt(s) > 0;
            return (
              <li key={s} className="flex-1 min-w-0">
                <button type="button" onClick={() => p.setStep(s)} aria-current={on ? "step" : undefined} data-step={s} className="w-full group text-start">
                  <span className={`block h-1 rounded-full transition-colors ${on ? "bg-ink-900" : done ? "bg-accent3" : "bg-paper-200"}`} />
                  <span className={`mt-1.5 flex items-center gap-1 text-[11px] sm:text-xs ${on ? "text-ink-900" : "text-paper-500 group-hover:text-ink-900"}`}>
                    <span className="font-mono">{num(i + 1)}</span>
                    <span className="truncate">{labels[s]}</span>
                    {bad && <i className="ri-error-warning-fill text-red-600" aria-label={t("فيها مشكلة", "Has an issue")}></i>}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
      {p.step === "kit" && <KitStep {...p} />}
      {p.step === "bottle" && <BottleStep {...p} />}
      {p.step === "label" && <LabelStep {...p} />}
      {p.step === "box" && <BoxStep {...p} />}
      {p.step === "review" && <ReviewStep {...p} />}
      {p.step !== "review" && p.step !== "kit" && p.issues.some((i) => i.level !== "tip" && ((p.step === "bottle" && i.area === "bottle") || (p.step === "label" && i.area === "label") || (p.step === "box" && i.area === "box"))) && (
        <Readiness compact issues={p.issues.filter((i) => (p.step === "bottle" && i.area === "bottle") || (p.step === "label" && i.area === "label") || (p.step === "box" && i.area === "box"))} onFix={p.applyPatch} />
      )}
      {next ? (
        <div className="sticky bottom-3 z-10 flex items-center justify-between gap-3 rounded-full bg-white/95 backdrop-blur border border-paper-200 shadow-sm p-1.5">
          {prev ? (
            <button type="button" onClick={() => p.setStep(prev)} className="rounded-full px-4 py-2.5 text-sm text-paper-600 hover:text-ink-900 inline-flex items-center gap-1" data-testid="guide-prev">
              <i className="ri-arrow-right-line rtl:rotate-0 ltr:rotate-180" aria-hidden="true"></i>
              {labels[prev]}
            </button>
          ) : (
            <span className="px-4 text-xs text-paper-500">{p.kitId ? t("طُبّق الطقم: يظهر في المعاينة", "Kit applied: see the preview") : t("اختر طقماً لتراه في المعاينة", "Pick a kit to preview it")}</span>
          )}
          <button type="button" onClick={() => p.setStep(next)} className="rounded-full bg-ink-900 text-white px-5 py-2.5 text-sm inline-flex items-center gap-2" data-testid="guide-next">
            {t(`التالي: ${labels[next]}`, `Next: ${labels[next]}`)}
            <i className="ri-arrow-left-line rtl:rotate-0 ltr:rotate-180" aria-hidden="true"></i>
          </button>
        </div>
      ) : (
        prev && (
          <button type="button" onClick={() => p.setStep(prev)} className="text-sm text-paper-600 hover:text-ink-900 inline-flex items-center gap-1" data-testid="guide-prev">
            <i className="ri-arrow-right-line rtl:rotate-0 ltr:rotate-180" aria-hidden="true"></i>
            {t(`عُد إلى ${labels[prev]}`, `Back to ${labels[prev]}`)}
          </button>
        )
      )}
    </div>
  );
}
