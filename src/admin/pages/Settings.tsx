import { useEffect, useMemo, useState } from "react";
import RemindersTab from "./RemindersTab";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useI18n, type Bi } from "@/i18n/context";
import { useCms, useContent } from "@/cms/ContentProvider";
import { cmsRepo } from "@/cms/repo";
import { DEFAULTS, sanitize, type OpsDoc, type QcItem } from "@/cms/schema";
import { buildPlan, weeks, type Concentration } from "@/production/plan";
import { studioRepo } from "@/studio/repo";
import type { PackModel } from "@/studio/types";
import { KITS, KIT_GROUPS } from "@/studio/kits";
import KitThumb from "@/studio/guided/KitThumb";
import { STYLES, STYLE_GROUPS } from "@/studio/box/types";
import { TEMPLATES } from "@/studio/label/templates";
import { useCrm } from "../data/CrmProvider";
import { Btn, Card, PageTitle, fieldCls, inlineFieldCls, numFieldCls } from "../components/ui";

// مركز التحكم: ما يظهر للعملاء في الاستوديو (الأطقم، أشكال العلب، قوالب الملصق)، ومدد خطة التصنيع،
// وقائمة فحص الجودة. يُحفظ وثيقةً واحدة «ops» وتُنشر فوراً للموقع، مع نسخ سابقة في سجل المحتوى.

type Tab = "catalog" | "plan" | "qc" | "reminders" | "hub";
const DAY_GROUPS: { title: Bi; keys: [string, Bi][] }[] = [
  {
    title: { ar: "الاعتمادات (تنتظر العميل)", en: "Approvals (waiting on the client)" },
    keys: [["approve", { ar: "اعتماد العرض والعربون", en: "Quote approval & deposit" }], ["scent_ok", { ar: "اعتماد الرائحة", en: "Scent approval" }], ["artwork_ok", { ar: "اعتماد التصميم", en: "Design approval" }], ["golden_ok", { ar: "توقيع العينة الذهبية", en: "Golden-sample sign-off" }], ["proof_ok", { ar: "اعتماد البروفة", en: "Proof approval" }]],
  },
  {
    title: { ar: "التركيبة", en: "Formula" },
    keys: [["formula_develop", { ar: "تطوير تركيبة جديدة", en: "New formula development" }], ["formula_reference", { ar: "مطابقة عطر مرجعي", en: "Reference match" }], ["stability", { ar: "اختبار الثبات", en: "Stability test" }], ["regulatory", { ar: "الملف النظامي (IFRA، غد)", en: "Regulatory file (IFRA, GHAD)" }], ["compound", { ar: "التحضير والتخفيف", en: "Compounding & dilution" }], ["filter", { ar: "التبريد والترشيح", en: "Chill & filter" }]],
  },
  {
    title: { ar: "التغليف والطباعة", en: "Packaging & print" },
    keys: [["identity", { ar: "الهوية وتصميم العبوة", en: "Identity & pack design" }], ["artwork", { ar: "الأعمال الفنية", en: "Artwork" }], ["bottle_catalogue", { ar: "عبوات من الكتالوج", en: "Catalogue bottles" }], ["bottle_semi", { ar: "قالب غطاء خاص", en: "Custom cap mould" }], ["bottle_private", { ar: "قالب زجاج خاص", en: "Private glass mould" }], ["deco", { ar: "زخرفة الزجاج", en: "Glass decoration" }], ["box_folding", { ar: "علب مطوية", en: "Folding cartons" }], ["box_rigid", { ar: "علب صلبة", en: "Rigid boxes" }], ["box_tube", { ar: "أسطوانات ورقية", en: "Paper tubes" }], ["box_corr", { ar: "كرتون مضلّع", en: "Corrugated" }], ["label_digital", { ar: "ملصق رقمي", en: "Digital label" }], ["label_flexo", { ar: "ملصق فلكسو", en: "Flexo label" }], ["label_offset", { ar: "ملصق أوفست", en: "Offset label" }], ["receive", { ar: "استلام تغليف العميل", en: "Receiving client packaging" }]],
  },
  {
    title: { ar: "الخط والتسليم", en: "Line & delivery" },
    keys: [["golden", { ar: "العينة الذهبية", en: "Golden sample" }], ["qc", { ar: "الفحص النهائي", en: "Final QC" }], ["delivery", { ar: "التوصيل", en: "Delivery" }]],
  },
];
const CONC: [Concentration, Bi][] = [["edt", { ar: "أو دو تواليت (EDT)", en: "Eau de toilette (EDT)" }], ["edp", { ar: "أو دو بارفان (EDP)", en: "Eau de parfum (EDP)" }], ["extrait", { ar: "إكستريه", en: "Extrait" }], ["oil", { ar: "دهن عطري بلا كحول", en: "Alcohol-free oil" }]];

function RangeInput({ value, onChange, label }: { value: [number, number]; onChange: (v: [number, number]) => void; label: string }) {
  const { t } = useI18n();
  return (
    <span className="inline-flex items-center gap-1.5" dir="ltr">
      <input type="number" min={0} max={400} value={value[0]} onChange={(e) => onChange([Math.max(0, Math.round(Number(e.target.value))), value[1]])} className={numFieldCls} aria-label={t(`${label}: الأدنى`, `${label}: min`)} />
      <span className="text-paper-400">–</span>
      <input type="number" min={0} max={400} value={value[1]} onChange={(e) => onChange([value[0], Math.max(0, Math.round(Number(e.target.value)))])} className={numFieldCls} aria-label={t(`${label}: الأقصى`, `${label}: max`)} />
    </span>
  );
}

export default function Settings() {
  const { t, pick, num } = useI18n();
  const { user, can } = useAuth();
  const { run } = useCrm();
  const { refresh } = useCms();
  const published = useContent("ops");
  const [params, setParams] = useSearchParams();
  const tab: Tab = (["catalog", "plan", "qc", "reminders", "hub"] as Tab[]).find((x) => x === params.get("tab")) ?? "catalog";
  const [doc, setDoc] = useState<OpsDoc>(() => structuredClone(published));
  const [models, setModels] = useState<PackModel[]>([]);
  const editable = can("pricing.manage") && can("content.edit");
  // آخر منشور يصل بعد تحميل الصفحة: نبدأ منه ما لم يعدّل المستخدم
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched) setDoc(structuredClone(published));
  }, [published, touched]);
  useEffect(() => {
    void studioRepo.listPublished().then(setModels).catch(() => undefined);
  }, []);
  const dirty = useMemo(() => JSON.stringify(sanitize("ops", doc)) !== JSON.stringify(published), [doc, published]);
  const edit = (next: OpsDoc) => {
    setTouched(true);
    setDoc(next);
  };
  const cat = doc.catalog, prod = doc.production;
  const toggle = (list: keyof OpsDoc["catalog"], id: string) => edit({ ...doc, catalog: { ...cat, [list]: cat[list].includes(id) ? cat[list].filter((x) => x !== id) : [...cat[list], id] } });
  const save = async () => {
    if (!user) return;
    const ok = await run(async () => {
      await cmsRepo.saveDraft("ops", sanitize("ops", doc), user.role, user.id);
      await cmsRepo.publish("ops", user.role, user.id);
    }, t("حُفظت الإعدادات ونُشرت", "Settings saved and published"));
    if (ok) {
      await refresh();
      setTouched(false);
    }
  };
  // أثر التعديل فوراً: مدة مشروع براند كامل نموذجي
  const sample = useMemo(() => buildPlan({ track: "A", qty: 1000, box: "rigid", labelPrint: "digital", concentration: "edp" }, prod), [prod]);
  const sw = weeks(sample.total);
  const tabs: [Tab, string, string][] = [["catalog", t("كتالوج الاستوديو", "Studio catalogue"), "ri-layout-grid-line"], ["plan", t("خطة التصنيع", "Production plan"), "ri-calendar-schedule-line"], ["qc", t("فحص الجودة", "Quality control"), "ri-shield-check-line"], ["reminders", t("التذكيرات", "Reminders"), "ri-notification-3-line"], ["hub", t("كل الإعدادات", "All settings"), "ri-settings-4-line"]];
  const bottles = models.filter((m) => m.kind === "bottle"), caps = models.filter((m) => m.kind === "cap");
  const setQc = (qc: QcItem[]) => edit({ ...doc, production: { ...prod, qc } });

  return (
    <>
      <PageTitle
        title={t("مركز التحكم", "Control centre")}
        sub={t("ما يراه العميل في الاستوديو، ومدد خطة التصنيع التي تُحسب بها مواعيد التسليم، وقائمة فحص الجودة لكل تشغيلة.", "What clients see in the studio, the production-plan durations behind every delivery date, and the QC checklist for each batch.")}
        actions={
          editable ? (
            <div className="flex items-center gap-2">
              {dirty && <button type="button" onClick={() => { setDoc(structuredClone(published)); setTouched(false); }} className="text-sm text-paper-500 underline underline-offset-4">{t("تجاهل", "Discard")}</button>}
              <Btn onClick={() => void save()} disabled={!dirty} data-testid="settings-save">{t("حفظ ونشر", "Save & publish")}</Btn>
            </div>
          ) : undefined
        }
      />
      {!editable && <p className="mb-4 rounded-xl bg-accent2-soft text-accent2-ink px-4 py-3 text-sm">{t("للقراءة فقط: التعديل للمالك والمدير.", "Read-only: editing is for the owner and admins.")}</p>}
      <div className="inline-flex flex-wrap rounded-full bg-paper-100 p-1 mb-4" role="tablist" aria-label={t("أقسام مركز التحكم", "Control centre sections")}>
        {tabs.map(([k, label, icon]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setParams(k === "catalog" ? {} : { tab: k }, { replace: true })} className={`rounded-full px-4 py-2 text-sm inline-flex items-center gap-1.5 ${tab === k ? "bg-white text-ink-900 shadow-sm" : "text-paper-600"}`}>
            <i className={icon} aria-hidden="true"></i>
            {label}
          </button>
        ))}
      </div>

      {tab === "catalog" && (
        <div className="space-y-4" data-testid="settings-catalog">
          <Card title={t(`الأطقم الجاهزة (${num(KITS.length - cat.hiddenKits.length)} ظاهرة من ${num(KITS.length)})`, `Ready kits (${KITS.length - cat.hiddenKits.length} of ${KITS.length} visible)`)}>
            <p className="px-5 pt-1 pb-3 text-xs text-paper-500">{t("أخفِ ما لا تصنّعه. النجمة تضع الطقم في «مختارات» أول ما يفتح العميل الاستوديو (حتى 24). بلا نجوم يظهر أول طقم من كل مجموعة.", "Hide what you don't make. A star puts the kit in “Featured”, the first thing a client sees (up to 24). With no stars, the first kit of each group shows.")}</p>
            <div className="px-5 pb-5 space-y-5">
              {KIT_GROUPS.map((g) => (
                <div key={g.id}>
                  <p className="text-sm text-ink-900 mb-2"><i className={`${g.icon} me-1.5`} aria-hidden="true"></i>{pick(g.name)}</p>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                    {KITS.filter((k) => k.group === g.id).map((k) => {
                      const hidden = cat.hiddenKits.includes(k.id), star = cat.featuredKits.includes(k.id);
                      return (
                        <li key={k.id} className={`min-w-0 flex items-center gap-3 rounded-xl border p-2 ${hidden ? "border-paper-200 bg-paper-50 opacity-60" : "border-paper-200 bg-white"}`} data-kit-row={k.id}>
                          <span className="w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-[#f3f1ec]"><KitThumb kit={k} bottle={bottles.find((b) => b.id === k.bottle) ?? null} cap={caps.find((c) => c.id === k.cap) ?? null} className="w-full h-full" /></span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm text-ink-900 truncate">{pick(k.name)}</span>
                            <span className="block text-[11px] text-paper-500 truncate">{pick(k.note)}</span>
                          </span>
                          <button type="button" disabled={!editable || hidden} onClick={() => toggle("featuredKits", k.id)} aria-pressed={star} aria-label={t(`مميز: ${k.name.ar}`, `Featured: ${k.name.en}`)} className={`text-lg ${star ? "text-gold" : "text-paper-300 hover:text-paper-500"}`}><i className={star ? "ri-star-fill" : "ri-star-line"} aria-hidden="true"></i></button>
                          <input type="checkbox" role="switch" checked={!hidden} disabled={!editable} onChange={() => toggle("hiddenKits", k.id)} aria-label={t(`إظهار ${k.name.ar}`, `Show ${k.name.en}`)} className="w-4 h-4 accent-ink-900" />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </Card>
          <Card title={t(`أشكال العلب (${num(STYLES.length - cat.hiddenStyles.length)} ظاهرة من ${num(STYLES.length)})`, `Box styles (${STYLES.length - cat.hiddenStyles.length} of ${STYLES.length} visible)`)}>
            <div className="p-5 pt-2 space-y-4">
              {STYLE_GROUPS.map((g) => (
                <div key={g.id}>
                  <p className="text-xs text-paper-600 mb-1.5">{pick(g.name)}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {STYLES.filter((s) => s.group === g.id).map((s) => {
                      const hidden = cat.hiddenStyles.includes(s.id);
                      return (
                        <button key={s.id} type="button" disabled={!editable} onClick={() => toggle("hiddenStyles", s.id)} aria-pressed={!hidden} data-style-toggle={s.id} className={`rounded-full border px-3 py-1.5 text-xs inline-flex items-center gap-1.5 ${hidden ? "border-paper-200 bg-paper-50 text-paper-400 line-through" : "border-ink-900 bg-white text-ink-900"}`}>
                          <i className={s.icon} aria-hidden="true"></i>
                          {pick(s.name)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <Card title={t(`قوالب الملصق (${num(TEMPLATES.length - cat.hiddenTemplates.length)} ظاهرة من ${num(TEMPLATES.length)})`, `Label templates (${TEMPLATES.length - cat.hiddenTemplates.length} of ${TEMPLATES.length} visible)`)}>
            <div className="p-5 pt-2 flex flex-wrap gap-1.5">
              {TEMPLATES.map((x) => {
                const hidden = cat.hiddenTemplates.includes(x.id);
                return (
                  <button key={x.id} type="button" disabled={!editable} onClick={() => toggle("hiddenTemplates", x.id)} aria-pressed={!hidden} className={`rounded-full border ps-1.5 pe-3 py-1 text-xs inline-flex items-center gap-1.5 ${hidden ? "border-paper-200 bg-paper-50 text-paper-400 line-through" : "border-ink-900 bg-white text-ink-900"}`}>
                    <span className="w-5 h-5 rounded-full border border-black/10" style={{ background: `linear-gradient(135deg, ${x.swatch[0]} 50%, ${x.swatch[1]} 50%)` }} aria-hidden="true" />
                    {pick(x.name)}
                  </button>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {tab === "plan" && (
        <div className="space-y-4" data-testid="settings-plan">
          <p className="rounded-2xl bg-white border border-paper-200 px-5 py-4 text-sm text-ink-900" data-testid="plan-sample">
            {t(`بهذه الأرقام، براند كامل نموذجي (1,000 عبوة، علبة صلبة) يُسلَّم خلال ${num(sw[0])} – ${num(sw[1])} أسبوعاً، ويحكم موعده: ${sample.driver ? pick(sample.driver.name) : "—"}.`, `With these numbers, a typical full brand (1,000 bottles, rigid box) delivers in ${sw[0]} – ${sw[1]} weeks, driven by: ${sample.driver ? pick(sample.driver.name) : "—"}.`)}
          </p>
          <Card title={t("التعتيق حسب التركيز (أيام)", "Maceration by concentration (days)")}>
            <ul className="px-5 pb-4 divide-y divide-paper-100">
              {CONC.map(([k, label]) => (
                <li key={k} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-ink-900 min-w-0">{pick(label)}</span>
                  {editable ? <RangeInput label={pick(label)} value={prod.maceration[k]} onChange={(v) => edit({ ...doc, production: { ...prod, maceration: { ...prod.maceration, [k]: v } } })} /> : <span dir="ltr">{prod.maceration[k].join(" – ")}</span>}
                </li>
              ))}
              <li className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-ink-900">{t("زيادة للعود والمخلطات الثقيلة", "Extra for oud and heavy mukhallat")}</span>
                <input type="number" min={0} max={120} value={prod.oudExtra} disabled={!editable} onChange={(e) => edit({ ...doc, production: { ...prod, oudExtra: Math.round(Number(e.target.value)) } })} className={numFieldCls} aria-label={t("زيادة العود بالأيام", "Oud extra days")} />
              </li>
            </ul>
          </Card>
          <Card title={t("طاقة الخط (وحدة في اليوم)", "Line capacity (units per day)")}>
            <div className="px-5 pb-4 grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="block text-xs text-paper-500 mb-1.5">{t("التعبئة والكبس", "Filling & crimping")}</span>
                <input type="number" min={50} value={prod.fillPerDay} disabled={!editable} onChange={(e) => edit({ ...doc, production: { ...prod, fillPerDay: Math.round(Number(e.target.value)) } })} className={fieldCls} />
              </label>
              <label className="block text-sm">
                <span className="block text-xs text-paper-500 mb-1.5">{t("اللصق والتعليب", "Labelling & boxing")}</span>
                <input type="number" min={50} value={prod.packPerDay} disabled={!editable} onChange={(e) => edit({ ...doc, production: { ...prod, packPerDay: Math.round(Number(e.target.value)) } })} className={fieldCls} />
              </label>
            </div>
          </Card>
          {DAY_GROUPS.map((g) => (
            <Card key={g.title.en} title={`${pick(g.title)} · ${t("أيام (أدنى – أقصى)", "days (min – max)")}`}>
              <ul className="px-5 pb-4 divide-y divide-paper-100">
                {g.keys.map(([k, label]) => (
                  <li key={k} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm" data-day={k}>
                    <span className="text-ink-900 min-w-0">{pick(label)}</span>
                    {editable ? <RangeInput label={pick(label)} value={prod.days[k] ?? DEFAULTS.ops.production.days[k]} onChange={(v) => edit({ ...doc, production: { ...prod, days: { ...prod.days, [k]: v } } })} /> : <span dir="ltr">{(prod.days[k] ?? [0, 0]).join(" – ")}</span>}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
          {editable && <button type="button" onClick={() => edit({ ...doc, production: { ...structuredClone(DEFAULTS.ops.production), qc: prod.qc, wastagePct: prod.wastagePct, fillTolerancePct: prod.fillTolerancePct } })} className="text-sm text-paper-500 underline underline-offset-4">{t("استعادة المدد الافتراضية", "Restore default durations")}</button>}
        </div>
      )}

      {tab === "qc" && (
        <div className="space-y-4" data-testid="settings-qc">
          <Card title={t("قائمة الفحص النهائي لكل تشغيلة جديدة", "Final-QC checklist for every new batch")}>
            <p className="px-5 pb-3 text-xs text-paper-500 leading-[1.7]">{t("التصنيف يحدد حد القبول: عيب «حرج» واحد يرفض التشغيلة، و«رئيسي» و«ثانوي» يُقبلان حتى حد AQL حسب حجمها.", "The class sets the accept limit: one “critical” defect rejects the batch; “major” and “minor” are accepted up to the AQL number for its size.")}</p>
            <ul className="px-5 pb-4 space-y-2">
              {prod.qc.map((q, i) => (
                <li key={q.id} className="grid grid-cols-12 gap-2 items-center" data-qc-row={q.id}>
                  <input value={q.text.ar} disabled={!editable} onChange={(e) => setQc(prod.qc.map((x, j) => (j === i ? { ...x, text: { ...x.text, ar: e.target.value } } : x)))} maxLength={160} className={`${fieldCls} col-span-12 sm:col-span-5`} aria-label={t("البند بالعربية", "Item in Arabic")} />
                  <input value={q.text.en} disabled={!editable} onChange={(e) => setQc(prod.qc.map((x, j) => (j === i ? { ...x, text: { ...x.text, en: e.target.value } } : x)))} maxLength={160} dir="ltr" className={`${fieldCls} col-span-7 sm:col-span-4`} aria-label={t("البند بالإنجليزية", "Item in English")} />
                  <select value={q.cls} disabled={!editable} onChange={(e) => setQc(prod.qc.map((x, j) => (j === i ? { ...x, cls: e.target.value as QcItem["cls"] } : x)))} className={`${fieldCls} col-span-4 sm:col-span-2`} aria-label={t("التصنيف", "Class")}>
                    <option value="critical">{t("حرج", "Critical")}</option>
                    <option value="major">{t("رئيسي", "Major")}</option>
                    <option value="minor">{t("ثانوي", "Minor")}</option>
                  </select>
                  {editable && <button type="button" onClick={() => setQc(prod.qc.filter((_, j) => j !== i))} disabled={prod.qc.length <= 1} className="col-span-1 text-paper-400 hover:text-red-700 disabled:opacity-30" aria-label={t(`احذف: ${q.text.ar}`, `Remove: ${q.text.en}`)}><i className="ri-delete-bin-line" aria-hidden="true"></i></button>}
                </li>
              ))}
            </ul>
            {editable && prod.qc.length < 40 && (
              <div className="px-5 pb-5"><Btn variant="secondary" onClick={() => setQc([...prod.qc, { id: `q${Date.now().toString(36)}`, text: { ar: "بند جديد", en: "New item" }, cls: "major" }])}>{t("أضف بنداً", "Add an item")}</Btn></div>
            )}
          </Card>
          <Card title={t("التفاوتات الافتراضية", "Default tolerances")}>
            <div className="px-5 pb-4 grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="block text-xs text-paper-500 mb-1.5">{t("هدر المواد الافتراضي %", "Default material wastage %")}</span>
                <input type="number" min={0} max={30} step="0.5" value={prod.wastagePct} disabled={!editable} onChange={(e) => edit({ ...doc, production: { ...prod, wastagePct: Number(e.target.value) } })} className={fieldCls} />
              </label>
              <label className="block text-sm">
                <span className="block text-xs text-paper-500 mb-1.5">{t("تفاوت مستوى التعبئة ±%", "Fill-level tolerance ±%")}</span>
                <input type="number" min={0.1} max={10} step="0.1" value={prod.fillTolerancePct} disabled={!editable} onChange={(e) => edit({ ...doc, production: { ...prod, fillTolerancePct: Number(e.target.value) } })} className={fieldCls} />
              </label>
            </div>
          </Card>
        </div>
      )}

      {tab === "reminders" && <RemindersTab doc={doc} edit={edit} editable={editable} />}

      {tab === "hub" && (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3" data-testid="settings-hub">
          {([
            ["/admin/cms?doc=pricing", "ri-price-tag-3-line", t("قائمة الأسعار", "Price list"), t("الحاسبة، الباقات، العينة، أسعار العلب والملحقات", "Calculator, packages, kit, box and extras rates"), can("pricing.manage")],
            ["/admin/pricing", "ri-coupon-3-line", t("الخصومات والكوبونات", "Discounts & coupons"), t("سقف الخصم، حد الهامش، الكوبونات، الحماية من السبام", "Discount caps, margin floor, coupons, spam guard"), can("pricing.manage")],
            ["/admin/studio", "ri-box-3-line", t("كتالوج العبوات ثلاثي الأبعاد", "3D bottle catalogue"), t("أضف عبواتك وأغطيتك من صورها أو بالذكاء الاصطناعي", "Add your bottles and caps from photos or with AI"), can("studio.manage")],
            ["/admin/creatives", "ri-palette-line", t("المصممون", "Creatives"), t("ملفات المصممين وأعمالهم", "Designer profiles and work"), can("studio.manage")],
            ["/admin/cms?doc=offers", "ri-calendar-schedule-line", t("المكالمة والعينة", "Call & kit"), t("أيام وساعات الحجز، محتوى العينة ومدة خصمها", "Booking days and hours, kit contents and credit window"), can("content.edit")],
            ["/admin/cms", "ri-layout-masonry-line", t("محتوى الموقع", "Site content"), t("الرئيسية، الأسئلة، الصفحات القانونية، بيانات المنشأة والبنك", "Home, FAQ, legal pages, company and bank details"), can("content.edit")],
            ["/admin/inventory", "ri-archive-stack-line", t("المخزون", "Stock"), t("المواد وحدود إعادة الطلب والحركات", "Items, reorder levels and movements"), can("inventory.view")],
            ["/admin/production", "ri-settings-3-line", t("أوامر الإنتاج", "Production orders"), t("التشغيلات وخطواتها وفحصها", "Batches, their steps and QC"), can("projects.view") || can("inventory.view")],
            ["/admin/team", "ri-shield-user-line", t("الفريق والصلاحيات", "Team & roles"), t("من يرى ماذا ومن يعدّل ماذا", "Who sees and edits what"), can("team.view")],
            ["/admin/audit", "ri-file-shield-2-line", t("سجل التدقيق", "Audit log"), t("كل تغيير باسم صاحبه ووقته", "Every change, by whom and when"), can("audit.view")],
          ] as [string, string, string, string, boolean][]).filter((x) => x[4]).map(([to, icon, title, note]) => (
            <Link key={to} to={to} className="rounded-2xl bg-white border border-paper-200 hover:border-ink-900 p-4 flex items-start gap-3 transition-colors">
              <span className="w-10 h-10 shrink-0 rounded-full bg-paper-100 flex items-center justify-center text-ink-900"><i className={`${icon} text-lg`} aria-hidden="true"></i></span>
              <span className="min-w-0">
                <span className="block text-sm text-ink-900">{title}</span>
                <span className="block text-xs text-paper-500 mt-0.5 leading-[1.6]">{note}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
