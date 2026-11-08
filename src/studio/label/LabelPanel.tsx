import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { estimateLabel } from "../spec";
import { Accordion, OptionCard, OptionGroup, Seg, Swatch, Toggle, type AccordionItem } from "../ui";
import { useI18n } from "@/i18n/context";
import type { PackModel } from "../types";
import { FONTS } from "./fonts";
import { defaultSize, makeTemplate, TEMPLATES, TEMPLATE_GROUPS, type TemplateId } from "./templates";
import { applyCustomTemplate, deleteCustomTemplate, listCustomTemplates, readArtwork, saveCustomTemplate, type CustomTemplate } from "./customTemplates";
import { SHAPES, SHAPE_GROUPS, shapeById, shapePath, type LabelShape } from "./shapes";
import { ADHESIVES, EFFECTS, ENGRAVE_MAX, ENGRAVE_METHODS, ENGRAVE_POSITIONS, FOILS, LABEL_SET, MATERIALS, PAPERS, SIDE_OFFSET, cleanProduction, labelShapeOf, labelSide, type Foil, type FontId, type LabelAdhesive, type LabelDesign, type LabelEffect, type LabelMaterial, type LabelSetItem, type LabelSide, type LabelText, type Paper } from "./types";
import { ARTWORK_REQUIREMENTS, PRINT_METHODS, printMethodById, recommendPrintMethod, type PrintMethodId } from "@/data/printing";
import IdentityCard from "../IdentityCard";
import { applyBrandToLabel, type BrandKit } from "../brand";

const chip = (on: boolean) =>
  `rounded-full px-3 py-1.5 text-xs border transition-colors ${on ? "bg-ink-900 text-white border-ink-900" : "bg-white/70 border-paper-200 text-paper-700 hover:border-ink-900"}`;
const input = "w-full bg-white border border-paper-200 focus:border-ink-900 rounded-xl px-3 py-2 text-sm outline-none";

function Range({ label, value, min, max, step = 0.5, unit = "mm", onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void }) {
  const { num, t } = useI18n();
  const u = unit === "mm" ? t("مم", "mm") : unit;
  return (
    <label className="block">
      <span className="flex justify-between text-[11px] text-paper-500 mb-1">
        <span>{label}</span>
        <span className="font-mono text-ink-900">{num(Math.round(value * 10) / 10)} {u}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={Math.min(max, Math.max(min, value))} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-ink-900" />
    </label>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-2xl bg-white/70 border border-paper-200 p-4 space-y-3">
      <legend className="sr-only">{title}</legend>
      <p className="text-xs text-paper-500" aria-hidden="true">{title}</p>
      {children}
    </fieldset>
  );
}

export function FoilPicker({ value, onChange, label }: { value: Foil; onChange: (f: Foil) => void; label: string }) {
  const { t, pick } = useI18n();
  return (
    <Seg
      small
      label={label}
      value={value}
      onChange={onChange}
      options={[{ id: "none" as Foil, label: t("حبر", "Ink") }, ...(Object.keys(FOILS) as Exclude<Foil, "none">[]).map((f) => ({ id: f as Foil, label: `${t("فويل", "Foil")} ${pick(FOILS[f].name)}`, swatch: FOILS[f].color }))]}
    />
  );
}

/** أيقونة الشكل: الشكل نفسه مرسوماً مصغّراً */
function ShapeIcon({ shape, selected }: { shape: LabelShape; selected: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = 44 * dpr;
    c.height = 34 * dpr;
    const g = c.getContext("2d")!;
    g.scale(dpr, dpr);
    g.clearRect(0, 0, 44, 34);
    shapePath(g, shape, 4, 4, 36, 26, 3);
    g.fillStyle = selected ? "#15101D" : "#e8e2d8";
    g.fill();
    g.strokeStyle = selected ? "#15101D" : "#8a8176";
    g.lineWidth = 1;
    g.stroke();
  }, [shape, selected]);
  return <canvas ref={ref} style={{ width: 44, height: 34 }} aria-hidden="true" />;
}

/** يقرأ الشعار ويصغّره (أقصى ضلع 800 بكسل) مع الحفاظ على الشفافية */
async function readLogo(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = Math.min(1, 800 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** سعر الملصق بخامته وتأثيراته وطقمه ونقشه — يتحدث مع كل اختيار */
function LabelPrice({ design, qty }: { design: LabelDesign; qty: number }) {
  const { t, pick, num } = useI18n();
  const e = useMemo(() => estimateLabel(design, qty), [design, qty]);
  const money = (n: number) => t(`${num(n, 2)} ر.س`, `SAR ${num(n, 2)}`);
  const id = useId();
  return (
    <section aria-labelledby={`${id}-h`} className="rounded-2xl bg-ink-900 text-white p-5" data-testid="label-price">
      <h3 id={`${id}-h`} className="text-sm text-white/60">{t("السعر التقديري للملصقات لكل عبوة", "Estimated labels per bottle")}</h3>
      <p className="mt-1 font-display text-3xl" dir="ltr" style={{ textAlign: "start" }} aria-live="polite" data-testid="label-unit-price">{money(e.unit)}</p>
      <p className="mt-1 text-xs text-white/60">{t(`الإجمالي ${num(e.total)} ر.س لـ ${num(e.qty)} عبوة${e.setupTotal ? ` · تجهيز لمرة ${num(e.setupTotal)} ر.س` : ""}`, `Total SAR ${num(e.total)} for ${num(e.qty)} bottles${e.setupTotal ? ` · one-off setup SAR ${num(e.setupTotal)}` : ""}`)}</p>
      <details className="mt-3 group">
        <summary className="cursor-pointer text-xs text-white/70 hover:text-white list-none inline-flex items-center gap-1"><i className="ri-arrow-down-s-line group-open:rotate-180 transition-transform" aria-hidden="true"></i>{t("التفاصيل", "Breakdown")}</summary>
        <dl className="mt-2 space-y-1 text-xs" data-testid="label-breakdown">
          {e.variable.map((l) => (
            <div key={l.key} className="flex justify-between gap-3"><dt className="text-white/60">{pick(l.label)}</dt><dd className="font-mono" dir="ltr">{money(l.value)}</dd></div>
          ))}
          {e.setup.map((l) => (
            <div key={l.key} className="flex justify-between gap-3"><dt className="text-white/60">{pick(l.label)} ÷ {num(e.qty)}</dt><dd className="font-mono" dir="ltr">{money(l.value / e.qty)}</dd></div>
          ))}
        </dl>
      </details>
      <p className="mt-3 text-[11px] text-white/45 leading-[1.6]">{t("تقديري قبل الضريبة؛ الكمية من تبويب العلبة. العرض الرسمي بعد مراجعة الملفات.", "Estimate before VAT; quantity from the Box tab. The formal quote follows file review.")}</p>
    </section>
  );
}

export interface LabelPanelProps {
  design: LabelDesign;
  onChange: (d: LabelDesign) => void;
  bottle: PackModel;
  onExport: (kind: "pdf" | "png") => Promise<void>;
  qty?: number;
  brand: BrandKit | null;
  onBrand: (b: BrandKit | null) => void;
  designerLink: string;
}

export default function LabelPanel({ design, onChange, bottle, onExport, qty = 1000, brand, onBrand, designerLink }: LabelPanelProps) {
  const { t, pick, num } = useI18n();
  const prod = cleanProduction(design);
  const [busy, setBusy] = useState<"" | "pdf" | "png">("");
  const [logoError, setLogoError] = useState("");
  const [mine, setMine] = useState<CustomTemplate[]>(() => listCustomTemplates());
  const [tplNote, setTplNote] = useState("");
  const fit = defaultSize(bottle);
  const zone = fit.zone;
  const maxW = Math.round(Math.min(110, fit.perimeter * 0.9));
  const set = (patch: Partial<LabelDesign>) => onChange({ ...design, ...patch });
  const setText = (id: LabelText["id"], patch: Partial<LabelText>) => onChange({ ...design, texts: design.texts.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const half = design.heightMm / 2;
  const shape = labelShapeOf(design);
  const side = design.widthMm >= fit.perimeter * 0.9 ? "wrap" : labelSide(design.offsetMm, fit.perimeter);
  const rec = recommendPrintMethod({ qty, material: prod.material, effects: prod.effects });
  const method = design.printMethod ?? rec.id;
  const methodMeta = printMethodById(method);

  const applyTemplate = (id: TemplateId) => {
    const brandTxt = design.texts.find((x) => x.id === "brand")?.text;
    const name = design.texts.find((x) => x.id === "name")?.text;
    const next = makeTemplate(id, bottle, brandTxt || undefined, name || undefined);
    onChange({ ...next, logo: design.logo, offsetMm: design.offsetMm, rotateDeg: design.rotateDeg, material: next.material ?? design.material, effects: design.effects, adhesive: design.adhesive, set: design.set, engrave: design.engrave, printMethod: design.printMethod, artwork: null });
  };

  const exportAs = async (kind: "pdf" | "png") => {
    setBusy(kind);
    try {
      await onExport(kind);
    } finally {
      setBusy("");
    }
  };

  const textLabels: Record<LabelText["id"], string> = { brand: t("اسم البراند", "Brand name"), name: t("اسم العطر", "Fragrance name"), details: t("سطر التفاصيل", "Details line") };
  const sideNames: Record<LabelSide, string> = { front: t("الواجهة", "Front"), right: t("اليمين", "Right"), left: t("اليسار", "Left"), back: t("الخلف", "Back"), wrap: t("حول العبوة", "Wrap-around") };
  const setSide = (s: LabelSide) => {
    if (s === "wrap") return set({ widthMm: Math.round(fit.perimeter * 0.9), offsetMm: 0, rotateDeg: 0 });
    set({ offsetMm: Math.round(fit.perimeter * SIDE_OFFSET[s]), ...(design.widthMm >= fit.perimeter * 0.9 ? { widthMm: Math.round(fit.perimeter * 0.36) } : {}) });
  };
  const brandText = design.texts.find((x) => x.id === "brand")?.text.trim();
  const nameText = design.texts.find((x) => x.id === "name")?.text.trim();

  const items: AccordionItem[] = [
    {
      id: "identity",
      title: t("الهوية", "Identity"),
      summary: brand ? `${brand.name || t("هوية محفوظة", "Saved identity")} · ${brand.primary} / ${brand.secondary}` : t("ارفع شعارك واختر ألوانك أو استعن بمصمم", "Upload your logo and colours, or hire a designer"),
      done: !!brand,
      testId: "acc-identity",
      content: <IdentityCard brand={brand} onChange={onBrand} onApply={(b) => onChange(applyBrandToLabel(design, b))} target="label" designerLink={designerLink} />,
    },
    {
      id: "template",
      testId: "acc-template",
      title: t("القوالب", "Templates"),
      summary: design.artwork ? t("تصميم خاص مرفوع", "Custom artwork uploaded") : t(`${TEMPLATES.length} قالباً جاهزاً في خمس مجموعات، وقوالبك المحفوظة، أو ارفع تصميمك`, `${TEMPLATES.length} ready templates in five groups, your saved ones, or upload yours`),
      done: true,
      content: (
        <>
          {TEMPLATE_GROUPS.map((g) => (
            <div key={g.id}>
              <p className="text-[11px] text-paper-500 mb-1.5">{pick(g.name)}</p>
              <OptionGroup label={pick(g.name)} cols={3}>
                {TEMPLATES.filter((x) => x.group === g.id).map((x) => (
                  <button key={x.id} type="button" role="radio" aria-checked={false} onClick={() => applyTemplate(x.id)} data-testid={`tpl-${x.id}`} className="opt-card opt-card-compact !p-2 flex-col items-center gap-1">
                    <span className="w-full h-7 rounded-md border border-black/10 grid place-items-center" style={{ background: x.swatch[0] }} aria-hidden="true"><span className="text-[9px] font-display" style={{ color: x.swatch[1] }}>Aa</span></span>
                    <span className="text-[10px] leading-tight text-center text-paper-700 w-full truncate">{pick(x.name)}</span>
                  </button>
                ))}
              </OptionGroup>
            </div>
          ))}
          <div className="rounded-xl border border-paper-200 bg-white p-3 space-y-2" data-testid="my-templates">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-ink-900 font-medium">{t("قوالبي", "My templates")}</p>
              <button
                type="button"
                onClick={() => {
                  const name = window.prompt(t("اسم القالب", "Template name"), design.texts.find((x) => x.id === "brand")?.text || t("قالبي", "My template"))?.trim();
                  if (!name) return;
                  setMine(saveCustomTemplate(name, design));
                  setTplNote(t(`حُفظ «${name}» — يظهر لك على أي عبوة تختارها`, `Saved “${name}” — available on any bottle you pick`));
                }}
                className={chip(false)}
                data-testid="save-template"
              >
                <i className="ri-bookmark-line me-1" aria-hidden="true"></i>
                {t("احفظ التصميم الحالي كقالب", "Save current design as a template")}
              </button>
            </div>
            {mine.length ? (
              <ul className="space-y-1">
                {mine.map((tp) => (
                  <li key={tp.id} className="flex items-center gap-2 text-xs">
                    <button type="button" onClick={() => { onChange(applyCustomTemplate(tp, bottle, design)); setTplNote(t(`طُبّق «${tp.name}»`, `Applied “${tp.name}”`)); }} className="flex-1 text-start rounded-lg border border-paper-200 hover:border-ink-900 px-3 py-2 text-ink-900 inline-flex items-center gap-2" data-testid={`my-tpl-${tp.id}`}>
                      <span className="w-4 h-4 rounded-sm border border-black/10 shrink-0" style={{ background: tp.design.paper === "custom" ? tp.design.customColor : PAPERS[tp.design.paper]?.swatch ?? "#fff" }} aria-hidden="true" />
                      <span className="truncate">{tp.name}</span>
                      <span className="ms-auto text-paper-500 font-mono">{num(tp.design.widthMm)}×{num(tp.design.heightMm)}</span>
                    </button>
                    <button type="button" onClick={() => setMine(deleteCustomTemplate(tp.id))} className="text-red-700 px-1" aria-label={t(`حذف «${tp.name}»`, `Delete “${tp.name}”`)}><i className="ri-delete-bin-line" aria-hidden="true"></i></button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-paper-500">{t("لا قوالب محفوظة بعد. صمّم ملصقك ثم احفظه لتعيد استخدامه على عبوات أخرى.", "No saved templates yet. Design your label, then save it to reuse on other bottles.")}</p>
            )}
          </div>
          <div className="rounded-xl border border-dashed border-paper-300 bg-white p-3 space-y-2" data-testid="artwork-upload">
            <p className="text-xs text-ink-900 font-medium">{t("قالب خاص: ارفع تصميمك الجاهز", "Custom template: upload your finished artwork")}</p>
            {design.artwork ? (
              <div className="flex items-center gap-3">
                <img src={design.artwork.dataUrl} alt={t("التصميم المرفوع", "Uploaded artwork")} className="w-16 h-12 object-cover rounded-lg border border-paper-200" />
                <div className="flex-1 space-y-1.5">
                  <Seg small label={t("ملاءمة التصميم", "Artwork fit")} value={design.artwork.fit} onChange={(fit) => set({ artwork: { ...design.artwork!, fit } })} options={[{ id: "cover" as const, label: t("يملأ الملصق", "Fill") }, { id: "contain" as const, label: t("يظهر كاملاً", "Fit inside") }]} />
                  <label className="inline-flex items-center gap-2 text-[11px] text-paper-700">
                    <input type="checkbox" checked={!!design.artwork.hideTexts} onChange={(e) => set({ artwork: { ...design.artwork!, hideTexts: e.target.checked } })} className="w-4 h-4 accent-ink-900" />
                    {t("التصميم يحوي النصوص — أخفِ نصوص الاستوديو", "The artwork includes the text — hide studio text")}
                  </label>
                </div>
                <button type="button" onClick={() => set({ artwork: null })} className="text-xs text-red-700 underline underline-offset-4">{t("إزالة", "Remove")}</button>
              </div>
            ) : (
              <label className="block rounded-lg border border-paper-200 hover:border-ink-900 p-3 text-center text-xs text-paper-600 cursor-pointer">
                <input
                  type="file"
                  accept="image/png,image/svg+xml,image/jpeg,image/webp"
                  className="sr-only"
                  aria-label={t("رفع تصميم الملصق", "Upload label artwork")}
                  data-testid="artwork-input"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    if (f.size > 12 * 1024 * 1024) return setTplNote(t("الملف أكبر من 12 ميغابايت.", "File is larger than 12 MB."));
                    try {
                      set({ artwork: { dataUrl: await readArtwork(f), fit: "cover", hideTexts: true } });
                      setTplNote(t("رُفع التصميم وفُرش على الملصق بمقاسه الحالي؛ عدّل المقاس والشكل من قسم «الشكل والموضع».", "Artwork uploaded and laid on the label at its current size; adjust size and shape in “Shape & placement”."));
                    } catch {
                      setTplNote(t("تعذّرت قراءة الملف.", "Couldn't read the file."));
                    }
                  }}
                />
                <i className="ri-upload-cloud-2-line me-1" aria-hidden="true"></i>
                {t("PNG أو SVG أو JPG بالمقاس الحقيقي مع هامش 3 مم — يُعرض على العبوة فوراً ويُرسل للمطبعة", "PNG, SVG or JPG at real size with 3 mm bleed — shown on the bottle at once and sent to print")}
              </label>
            )}
          </div>
          {tplNote && <p role="status" className="text-[11px] text-accent3-ink">{tplNote}</p>}
        </>
      ),
    },
    {
      id: "text",
      testId: "acc-text",
      title: t("النصوص", "Text"),
      summary: [brandText, nameText].filter(Boolean).join(" · ") || t("اسم الدار واسم العطر وسطر التفاصيل", "Brand, fragrance and details"),
      done: !!brandText && !!nameText,
      content: (
        <>
          {design.texts.map((x) => (
            <div key={x.id} className="rounded-xl border border-paper-200 bg-white p-3 space-y-2">
              <label className="block">
                <span className="block text-[11px] text-paper-500 mb-1">{textLabels[x.id]}</span>
                <input value={x.text} onChange={(e) => setText(x.id, { text: e.target.value })} maxLength={40} dir="auto" className={input} />
              </label>
              <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 items-center">
                <select value={x.font} onChange={(e) => setText(x.id, { font: e.target.value as FontId })} aria-label={`${textLabels[x.id]} — ${t("الخط", "font")}`} className={input}>
                  {(Object.keys(FONTS) as FontId[]).map((f) => <option key={f} value={f}>{pick(FONTS[f].name)}</option>)}
                </select>
                <button type="button" onClick={() => setText(x.id, { weight: x.weight === 700 ? 400 : 700 })} aria-pressed={x.weight === 700} className={`${chip(x.weight === 700)} font-bold`} aria-label={t("عريض", "Bold")}>B</button>
                <input type="color" value={x.color} onChange={(e) => setText(x.id, { color: e.target.value })} aria-label={`${textLabels[x.id]} — ${t("اللون", "colour")}`} className="w-9 h-9 rounded-full border border-paper-200 bg-white p-0.5" disabled={x.foil !== "none"} />
              </div>
              <FoilPicker value={x.foil} onChange={(f) => setText(x.id, { foil: f })} label={`${textLabels[x.id]} — ${t("التشطيب", "finish")}`} />
              <div className="grid grid-cols-2 gap-3">
                <Range label={t("الحجم", "Size")} value={x.sizeMm} min={1.5} max={16} step={0.1} onChange={(v) => setText(x.id, { sizeMm: v })} />
                <Range label={t("الموضع", "Position")} value={Math.round(x.y * 100)} min={5} max={95} step={1} unit="%" onChange={(v) => setText(x.id, { y: v / 100 })} />
              </div>
            </div>
          ))}
        </>
      ),
    },
    {
      id: "logo",
      testId: "acc-logo",
      title: t("الشعار", "Logo"),
      summary: design.logo ? t(`مرفق · ${num(design.logo.widthMm)} مم`, `Attached · ${num(design.logo.widthMm)} mm`) : t("اختياري — PNG شفاف أو SVG", "Optional — transparent PNG or SVG"),
      done: !!design.logo,
      content: design.logo ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <img src={design.logo.dataUrl} alt={t("الشعار المرفوع", "Uploaded logo")} className="w-14 h-14 object-contain rounded-lg bg-[repeating-conic-gradient(#eee_0_25%,#fff_0_50%)] bg-[length:12px_12px]" />
            <button type="button" onClick={() => set({ logo: null })} className="text-xs text-red-700 underline underline-offset-4">{t("إزالة الشعار", "Remove logo")}</button>
          </div>
          <FoilPicker value={design.logo.foil} onChange={(f) => set({ logo: { ...design.logo!, foil: f } })} label={t("تشطيب الشعار", "Logo finish")} />
          <div className="grid grid-cols-2 gap-3">
            <Range label={t("العرض", "Width")} value={design.logo.widthMm} min={4} max={Math.round(design.widthMm * 0.9)} onChange={(v) => set({ logo: { ...design.logo!, widthMm: v } })} />
            <Range label={t("الموضع", "Position")} value={Math.round(design.logo.y * 100)} min={5} max={95} step={1} unit="%" onChange={(v) => set({ logo: { ...design.logo!, y: v / 100 } })} />
          </div>
        </div>
      ) : (
        <>
          <label className="block rounded-xl border-2 border-dashed border-paper-300 hover:border-ink-900 p-4 text-center text-sm text-paper-600 cursor-pointer">
            <input
              type="file"
              accept="image/png,image/svg+xml,image/jpeg,image/webp"
              className="sr-only"
              aria-label={t("رفع الشعار", "Upload logo")}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 5 * 1024 * 1024) return setLogoError(t("الملف أكبر من 5 ميغابايت.", "File is larger than 5 MB."));
                setLogoError("");
                try {
                  const ys = design.texts.map((x) => x.y);
                  const lo = Math.min(...ys), hi = Math.max(...ys);
                  const texts = design.texts.map((x) => ({ ...x, y: hi > lo ? 0.45 + ((x.y - lo) / (hi - lo)) * 0.43 : 0.6 }));
                  onChange({ ...design, texts, logo: { dataUrl: await readLogo(f), widthMm: Math.round(design.widthMm * 0.28), y: 0.2, foil: "none" } });
                } catch {
                  setLogoError(t("تعذّرت قراءة الصورة.", "Couldn't read the image."));
                }
              }}
            />
            <i className="ri-image-add-line me-1" aria-hidden="true"></i>
            {t("ارفع شعارك (PNG شفاف أو SVG يعطي أفضل نتيجة)", "Upload your logo (transparent PNG or SVG works best)")}
          </label>
          {brand?.logo && <button type="button" onClick={() => set({ logo: { dataUrl: brand.logo!, widthMm: Math.round(design.widthMm * 0.28), y: 0.2, foil: brand.foil } })} className={chip(false)}>{t("استخدم شعار الهوية", "Use the identity logo")}</button>}
          {logoError && <p role="alert" className="text-xs text-red-700">{logoError}</p>}
        </>
      ),
    },
    {
      id: "shape",
      title: t("الشكل والموضع", "Shape & placement"),
      summary: `${pick(shapeById(shape).name)} · ${num(design.widthMm)}×${num(design.heightMm)} ${t("مم", "mm")} · ${sideNames[side]}${design.rotateDeg ? ` · ${num(design.rotateDeg)}°` : ""}`,
      done: true,
      testId: "acc-shape",
      content: (
        <>
          <div data-testid="label-shapes" className="space-y-2">
            {SHAPE_GROUPS.map((g) => (
              <div key={g.id}>
                <p className="text-[11px] text-paper-500 mb-1">{pick(g.name)}</p>
                <div role="radiogroup" aria-label={pick(g.name)} className="grid grid-cols-4 gap-1.5">
                  {SHAPES.filter((x) => x.group === g.id).map((x) => (
                    <button key={x.id} type="button" role="radio" aria-checked={shape === x.id} onClick={() => set({ shape: x.id })} title={pick(x.name)} data-testid={`shape-${x.id}`} className={`opt-card opt-card-compact !p-1.5 flex-col items-center gap-0.5 ${shape === x.id ? "is-on" : ""}`}>
                      <ShapeIcon shape={x.id} selected={shape === x.id} />
                      <span className="text-[10px] leading-tight text-center text-paper-700 truncate w-full">{pick(x.name)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Range label={t("العرض", "Width")} value={design.widthMm} min={15} max={maxW} onChange={(v) => set({ widthMm: v })} />
            <Range
              label={t("الارتفاع", "Height")}
              value={design.heightMm}
              min={10}
              max={Math.floor(zone.height)}
              onChange={(v) => set({ heightMm: v, centerYmm: Math.min(zone.top - v / 2, Math.max(zone.bottom + v / 2, design.centerYmm)) })}
            />
          </div>
          <div>
            <p className="text-[11px] text-paper-500 mb-1.5">{t("موضع الملصق على العبوة", "Where the label sits")}</p>
            <Seg label={t("جهة الملصق", "Label side")} value={side} onChange={setSide} options={(["front", "right", "left", "back", "wrap"] as LabelSide[]).map((s) => ({ id: s, label: sideNames[s] }))} />
          </div>
          <Range label={t("الارتفاع عن القاعدة", "Height from base")} value={design.centerYmm} min={zone.bottom + half} max={Math.max(zone.bottom + half, zone.top - half)} onChange={(v) => set({ centerYmm: v })} />
          <div className="grid grid-cols-2 gap-3">
            <Range label={t("إزاحة حول العبوة", "Shift around the bottle")} value={design.offsetMm ?? 0} min={-Math.round(fit.perimeter / 2)} max={Math.round(fit.perimeter / 2)} step={1} onChange={(v) => set({ offsetMm: v })} />
            <Range label={t("الميل", "Tilt")} value={design.rotateDeg ?? 0} min={-30} max={30} step={1} unit="°" onChange={(v) => set({ rotateDeg: v })} />
          </div>
          <p className="text-[11px] text-paper-500">{t(`المساحة المتاحة على الجسم ${Math.round(zone.height)} مم ارتفاعاً، ومحيطه ${Math.round(fit.perimeter)} مم.`, `Available body area: ${Math.round(zone.height)} mm tall, ${Math.round(fit.perimeter)} mm around.`)}</p>
        </>
      ),
    },
    {
      id: "material",
      title: t("الخامة والورق والتشطيب", "Stock, paper & finish"),
      summary: `${pick(MATERIALS[prod.material].name)} · ${design.paper === "custom" ? design.customColor : pick(PAPERS[design.paper].name)} · ${design.finish === "matte" ? t("مطفأ", "Matte") : t("لامع", "Gloss")}${prod.effects.length ? ` · ${prod.effects.map((e) => pick(EFFECTS[e].name)).join("، ")}` : ""}`,
      done: true,
      testId: "acc-material",
      content: (
        <>
          <div data-testid="label-material">
            <p className="text-[11px] text-paper-500 mb-1.5">{t("الخامة — تظهر بملمسها ولمعتها في المعاينة", "Stock — shown with its texture and sheen in the preview")}</p>
            <OptionGroup label={t("الخامة", "Stock")} cols={2}>
              {(Object.keys(MATERIALS) as LabelMaterial[]).map((m) => (
                <OptionCard key={m} compact selected={prod.material === m} onSelect={() => set({ material: m })} title={pick(MATERIALS[m].name)} note={pick(MATERIALS[m].note)} extra={MATERIALS[m].perUnit} />
              ))}
            </OptionGroup>
          </div>
          <div role="radiogroup" aria-label={t("الورق", "Paper")} className="flex flex-wrap gap-1 items-start">
            {(Object.keys(PAPERS) as Exclude<Paper, "custom">[]).map((p) => (
              <Swatch key={p} selected={design.paper === p} onSelect={() => set({ paper: p })} bg={PAPERS[p].swatch} label={pick(PAPERS[p].name)} />
            ))}
            <label className={`opt-swatch cursor-pointer ${design.paper === "custom" ? "is-on" : ""}`}>
              <span className="opt-swatch-chip overflow-hidden grid place-items-center" style={{ background: design.customColor }}>
                <input type="color" value={design.customColor} onChange={(e) => set({ paper: "custom", customColor: e.target.value })} className="w-9 h-9 opacity-0 cursor-pointer" aria-label={t("لون مخصص", "Custom colour")} />
              </span>
              <span className="opt-swatch-label">{t("مخصص", "Custom")}</span>
            </label>
          </div>
          <Seg label={t("التشطيب", "Finish")} value={design.finish} onChange={(finish) => set({ finish })} options={[{ id: "matte" as const, label: t("مطفأ", "Matte") }, { id: "gloss" as const, label: t("لامع", "Gloss") }]} />
          <label className="flex items-center gap-2 text-sm text-ink-900">
            <input type="checkbox" checked={design.border.enabled} onChange={(e) => set({ border: { ...design.border, enabled: e.target.checked } })} className="w-4 h-4 accent-ink-900" />
            {t("إطار داخلي", "Inner frame")}
          </label>
          {design.border.enabled && <FoilPicker value={design.border.foil} onChange={(f) => set({ border: { ...design.border, foil: f } })} label={t("تشطيب الإطار", "Frame finish")} />}
          <div>
            <p className="text-[11px] text-paper-500 mb-1.5">{t("التأثيرات (تُصنَّع وتُسعَّر؛ البروز والقبّة يُعتمدان على عينة)", "Effects (made and priced; embossing and doming are approved on a sample)")}</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("التأثيرات", "Effects")} data-testid="label-effects">
              {(Object.keys(EFFECTS) as LabelEffect[]).map((e) => {
                const on = prod.effects.includes(e);
                return <Toggle key={e} selected={on} title={pick(EFFECTS[e].note)} extra={EFFECTS[e].perUnit} onSelect={() => set({ effects: on ? prod.effects.filter((x) => x !== e) : [...prod.effects, e] })}>{pick(EFFECTS[e].name)}</Toggle>;
              })}
            </div>
          </div>
          <div>
            <p className="text-[11px] text-paper-500 mb-1.5">{t("اللاصق", "Adhesive")}</p>
            <Seg label={t("اللاصق", "Adhesive")} value={prod.adhesive} onChange={(adhesive) => set({ adhesive })} options={(Object.keys(ADHESIVES) as LabelAdhesive[]).map((a) => ({ id: a, label: pick(ADHESIVES[a].name), extra: ADHESIVES[a].perUnit }))} />
          </div>
        </>
      ),
    },
    {
      id: "print",
      title: t("طريقة الطباعة", "Printing method"),
      summary: `${pick(methodMeta.short)}${design.printMethod ? "" : ` (${t("مرشَّحة", "recommended")})`} · ${num(methodMeta.leadDays[0])}–${num(methodMeta.leadDays[1])} ${t("أيام", "days")}`,
      done: true,
      testId: "acc-print",
      content: (
        <>
          <p className="rounded-xl bg-paper-50 border border-paper-200 px-3 py-2 text-xs leading-[1.7] text-paper-700">
            <i className="ri-lightbulb-line me-1 text-ink-900" aria-hidden="true"></i>
            {t(`لكميتك (${num(qty)}) وخامتك نرشّح «${pick(printMethodById(rec.id).short)}»: ${pick(rec.why)}.`, `For your quantity (${num(qty)}) and stock we recommend “${pick(printMethodById(rec.id).short)}”: ${pick(rec.why)}.`)}
          </p>
          <OptionGroup label={t("طريقة الطباعة", "Printing method")} cols={1}>
            {PRINT_METHODS.map((m) => (
              <OptionCard
                key={m.id}
                compact
                selected={method === m.id}
                onSelect={() => set({ printMethod: m.id as PrintMethodId })}
                title={`${pick(m.name)}${m.id === rec.id ? ` · ${t("موصى به", "recommended")}` : ""}`}
                note={`${num(m.minQty)}–${num(m.maxQty)} ${t("ملصق", "labels")} · ${num(m.leadDays[0])}–${num(m.leadDays[1])} ${t("أيام", "days")} · ${pick(m.pros[0])}`}
                icon={m.icon}
                testId={`print-${m.id}`}
              />
            ))}
          </OptionGroup>
          {!methodMeta.materials.includes(prod.material) && (
            <p role="alert" className="rounded-xl bg-accent2-soft text-accent2-ink px-3 py-2 text-xs leading-[1.7]">{t(`«${pick(MATERIALS[prod.material].name)}» لا تُطبع عادةً بـ${pick(methodMeta.short)}؛ غيّر الطريقة أو الخامة.`, `“${pick(MATERIALS[prod.material].name)}” is not usually printed by ${pick(methodMeta.short)}; change the method or the stock.`)}</p>
          )}
          <details className="text-xs">
            <summary className="cursor-pointer text-paper-600">{t("ما نحتاجه منك قبل الطباعة", "What we need from you before printing")}</summary>
            <ul className="mt-2 space-y-1 text-paper-700 leading-[1.7]" data-testid="artwork-reqs">
              {ARTWORK_REQUIREMENTS.filter((r) => !r.methods || r.methods.includes(method)).map((r) => (
                <li key={r.id} className="flex items-start gap-2"><i className="ri-checkbox-circle-line text-accent3 mt-0.5" aria-hidden="true"></i><span>{pick(r.text)}</span></li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-paper-500">{t("لا تملك هذه الملفات؟ المصمم من المنصة يجهّزها لك من هويتك وتصميمك الحالي.", "Don't have these files? A platform designer prepares them from your identity and current design.")}</p>
          </details>
        </>
      ),
    },
    {
      id: "set",
      testId: "acc-set",
      title: t("طقم الملصقات", "Label set"),
      summary: prod.set.length ? prod.set.map((x) => pick(LABEL_SET[x].name)).join("، ") : t("الأمامي فقط — أضف الخلفي النظامي والعنق والختم", "Front only — add the legal back, neck and seal"),
      done: prod.set.includes("back"),
      content: (
        <>
          <p className="text-[11px] text-paper-500">{t("الملصق الأمامي هو ما تصمّمه هنا؛ أضف ما يُطبع معه بالهوية نفسها.", "The front label is what you design here; add what prints with it in the same identity.")}</p>
          <div data-testid="label-set">
            <OptionGroup label={t("طقم الملصقات", "Label set")} cols={2}>
              {(Object.keys(LABEL_SET) as LabelSetItem[]).map((k) => {
                const on = prod.set.includes(k);
                return <OptionCard key={k} multi compact selected={on} onSelect={() => set({ set: on ? prod.set.filter((x) => x !== k) : [...prod.set, k] })} title={pick(LABEL_SET[k].name)} note={pick(LABEL_SET[k].note)} icon={LABEL_SET[k].icon} extra={LABEL_SET[k].perUnit} />;
              })}
            </OptionGroup>
          </div>
        </>
      ),
    },
    {
      id: "engrave",
      title: t("نقش على الزجاج", "Glass engraving"),
      summary: prod.engrave.enabled ? `${pick(ENGRAVE_METHODS[prod.engrave.method].name)} · ${pick(ENGRAVE_POSITIONS[prod.engrave.position])}${prod.engrave.text ? ` «${prod.engrave.text}»` : ""}` : t("اختياري — نص أو اسم محفور يظهر في المعاينة", "Optional — engraved text or name, shown in the preview"),
      done: prod.engrave.enabled && !!prod.engrave.text.trim(),
      testId: "acc-engrave",
      content: (
        <>
          <label className="flex items-center justify-between gap-3 text-sm text-ink-900">
            <span>{t("انقش نصاً أو اسماً على الزجاجة نفسها", "Engrave text or a name on the bottle itself")}</span>
            <input type="checkbox" role="switch" checked={prod.engrave.enabled} onChange={(e) => set({ engrave: { ...prod.engrave, enabled: e.target.checked } })} className="w-5 h-5 accent-ink-900" data-testid="engrave-switch" />
          </label>
          {prod.engrave.enabled && (
            <div className="space-y-3">
              <label className="block">
                <span className="block text-[11px] text-paper-500 mb-1">{t(`النص (حتى ${ENGRAVE_MAX} حرفاً)`, `Text (up to ${ENGRAVE_MAX} characters)`)}</span>
                <input value={prod.engrave.text} maxLength={ENGRAVE_MAX} dir="auto" onChange={(e) => set({ engrave: { ...prod.engrave, text: e.target.value } })} className={input} placeholder={t("مثال: لِسارة · 2026", "e.g. For Sara · 2026")} data-testid="engrave-text" />
              </label>
              <OptionGroup label={t("طريقة النقش", "Method")} cols={3}>
                {(Object.keys(ENGRAVE_METHODS) as (keyof typeof ENGRAVE_METHODS)[]).map((m) => (
                  <OptionCard key={m} compact selected={prod.engrave.method === m} onSelect={() => set({ engrave: { ...prod.engrave, method: m } })} title={pick(ENGRAVE_METHODS[m].name)} extra={ENGRAVE_METHODS[m].perUnit} />
                ))}
              </OptionGroup>
              <Seg label={t("موضع النقش", "Position")} value={prod.engrave.position} onChange={(position) => set({ engrave: { ...prod.engrave, position } })} options={(Object.keys(ENGRAVE_POSITIONS) as (keyof typeof ENGRAVE_POSITIONS)[]).map((pos) => ({ id: pos, label: pick(ENGRAVE_POSITIONS[pos]) }))} />
              <div className="grid grid-cols-2 gap-3">
                <Range label={t("ارتفاع الحرف", "Letter height")} value={prod.engrave.sizeMm ?? 5} min={2} max={14} step={0.5} onChange={(v) => set({ engrave: { ...prod.engrave, sizeMm: v } })} />
                {prod.engrave.position !== "base" && <Range label={t("الارتفاع عن القاعدة", "Height from base")} value={prod.engrave.yMm ?? Math.max(8, Math.round(design.centerYmm - design.heightMm / 2 - 8))} min={Math.round(zone.bottom + 4)} max={Math.round(zone.top - 4)} step={1} onChange={(v) => set({ engrave: { ...prod.engrave, yMm: v } })} />}
              </div>
              <p className="text-[11px] text-paper-500 leading-[1.6]">
                {pick(ENGRAVE_METHODS[prod.engrave.method].note)} ·{" "}
                {prod.engrave.position === "base" ? t("تميل المعاينة لتُريك القاعدة من الأسفل.", "The preview tilts to show the base from below.") : t("يظهر النقش في المعاينة بخط اسم الدار؛ العمق النهائي يُعتمد على عينة.", "Previewed in the brand typeface; the final depth is approved on a sample.")}
              </p>
            </div>
          )}
        </>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <LabelPrice design={design} qty={qty} />
      <Accordion items={items} label={t("خيارات الملصق", "Label options")} initial="text" />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => exportAs("pdf")} disabled={busy !== ""} className="rounded-full bg-ink-900 text-white px-4 py-2.5 text-sm inline-flex items-center gap-2 disabled:opacity-50">
          <i className="ri-file-pdf-2-line" aria-hidden="true"></i>
          {busy === "pdf" ? t("جاري التجهيز…", "Preparing…") : t("ملف الطباعة PDF", "Print-ready PDF")}
        </button>
        <button type="button" onClick={() => exportAs("png")} disabled={busy !== ""} className="rounded-full border border-paper-300 bg-white px-4 py-2.5 text-sm text-ink-900 inline-flex items-center gap-2 disabled:opacity-50">
          <i className="ri-image-line" aria-hidden="true"></i>
          {t("صورة الملصق PNG", "Label PNG")}
        </button>
      </div>
      <p className="text-[11px] text-paper-500 leading-[1.7]">{t("ملف PDF بالمقاس الحقيقي، بهامش قص 3 مم وعلامات القص، وخط القص بشكل الملصق في صفحة مستقلة. يراجعه فريقنا قبل الطباعة.", "Real-size PDF with 3 mm bleed and crop marks, and the shaped cut line on its own page. Our team reviews it before printing.")}</p>
    </div>
  );
}
