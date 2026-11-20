import { useI18n } from "@/i18n/context";
import { SAMPLE_LIMITS, SAMPLE_UNITS, SAMPLE_UNIT_LABELS, amountDigits, newSample, percentSum, sampleCode, type KitSample, type SampleIngredient, type SampleUnit } from "./types";

// محرّر العينات للعطّار: لكل عبوة حرف واسم وتركيز ومكوّنات بكمياتها. قرارات العميل تظهر ولا تُعدَّل من هنا.

const field = "w-full rounded-lg border border-paper-300 bg-white px-3 py-2 text-sm text-ink-900 focus:outline-none focus:border-ink-900";

export function DecisionBadge({ s }: { s: Pick<KitSample, "decision"> }) {
  const { t } = useI18n();
  if (!s.decision) return <span className="inline-flex items-center gap-1 rounded-full bg-paper-100 text-paper-600 px-2.5 py-0.5 text-xs"><i className="ri-time-line" aria-hidden="true"></i>{t("بانتظار رأي العميل", "Awaiting the client")}</span>;
  return s.decision === "accepted" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#E3F1EA] text-[#1F6B4F] px-2.5 py-0.5 text-xs" data-decision="accepted"><i className="ri-check-line" aria-hidden="true"></i>{t("مقبولة", "Accepted")}</span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 text-red-700 px-2.5 py-0.5 text-xs" data-decision="rejected"><i className="ri-close-line" aria-hidden="true"></i>{t("مرفوضة", "Rejected")}</span>
  );
}

export function SamplesEditor({ value, onChange, readOnly = false }: { value: KitSample[]; onChange: (s: KitSample[]) => void; readOnly?: boolean }) {
  const { t, pick, num } = useI18n();
  const patch = (i: number, p: Partial<KitSample>) => onChange(value.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const setIng = (i: number, k: number, p: Partial<SampleIngredient>) => patch(i, { ingredients: value[i].ingredients.map((g, j) => (j === k ? { ...g, ...p } : g)) });
  const add = () => onChange([...value, newSample(value.length)]);
  const remove = (i: number) => onChange(value.filter((_, j) => j !== i).map((s, j) => (/^[A-Z]\d*$/.test(s.code) ? { ...s, code: sampleCode(j) } : s)));
  const copyFrom = (i: number) => onChange([...value, { ...newSample(value.length), name: `${value[i].name} · ${t("نسخة", "copy")}`.slice(0, SAMPLE_LIMITS.name), concentration: value[i].concentration, ingredients: value[i].ingredients.map((g) => ({ ...g })) }]);

  return (
    <div className="space-y-3" data-testid="samples-editor">
      {value.length === 0 && <p className="text-sm text-paper-500">{t("لا عينات بعد. أضف كل عبوة باسمها ليقيّمها العميل بالاسم.", "No samples yet. Add each vial by name so the client can rate it by name.")}</p>}
      {value.map((s, i) => {
        const sum = percentSum(s);
        return (
          <div key={s.id} className="rounded-xl border border-paper-200 bg-white p-3.5" data-testid="sample-row" data-sample={s.id}>
            <div className="flex items-start gap-2.5">
              <label className="shrink-0">
                <span className="sr-only">{t("حرف العبوة", "Vial letter")}</span>
                <input value={s.code} onChange={(e) => patch(i, { code: e.target.value.toUpperCase().slice(0, 8) })} disabled={readOnly} dir="ltr" className="w-11 h-11 rounded-lg bg-ink-900 text-white text-center font-mono text-base focus:outline-none focus:ring-2 focus:ring-accent2" aria-label={t("حرف العبوة", "Vial letter")} />
              </label>
              <div className="flex-1 min-w-0 space-y-2">
                <div className="grid sm:grid-cols-5 gap-2">
                  <label className="sm:col-span-3 block">
                    <span className="sr-only">{t("اسم العينة", "Sample name")}</span>
                    <input value={s.name} onChange={(e) => patch(i, { name: e.target.value })} disabled={readOnly} maxLength={SAMPLE_LIMITS.name} required placeholder={t("اسم العينة كما سيقرؤه العميل", "Sample name as the client will read it")} className={field} data-testid="sample-name" />
                  </label>
                  <label className="sm:col-span-2 block">
                    <span className="sr-only">{t("التركيز والحجم", "Concentration and size")}</span>
                    <input value={s.concentration} onChange={(e) => patch(i, { concentration: e.target.value })} disabled={readOnly} maxLength={SAMPLE_LIMITS.concentration} placeholder={t("التركيز والحجم: EDP 18% · 5 مل", "Strength & size: EDP 18% · 5 ml")} className={field} />
                  </label>
                </div>
                <label className="block">
                  <span className="sr-only">{t("وصف للعميل", "Description for the client")}</span>
                  <textarea value={s.notes} onChange={(e) => patch(i, { notes: e.target.value })} disabled={readOnly} rows={1} maxLength={SAMPLE_LIMITS.notes} placeholder={t("وصف قصير للعميل: ما الذي يميّز هذه العينة؟", "Short note for the client: what sets this one apart?")} className={field} />
                </label>
              </div>
            </div>

            <div className="mt-3 ps-[3.375rem]">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <p className="text-xs text-paper-600">{t("المكوّنات والكميات", "Ingredients and amounts")}</p>
                {sum > 0 && <p className={`text-xs ${sum > 100.001 ? "text-red-700" : "text-paper-500"}`} data-testid="sample-sum">{t(`مجموع النسب ${num(sum, amountDigits(sum))}٪`, `Percent total ${sum}%`)}{sum > 100.001 ? t(" · يتجاوز 100", " · over 100") : ""}</p>}
              </div>
              <ul className="space-y-1.5">
                {s.ingredients.map((g, k) => (
                  <li key={k} className="flex items-center gap-1.5" data-testid="ingredient-row">
                    <input value={g.name} onChange={(e) => setIng(i, k, { name: e.target.value })} disabled={readOnly} maxLength={SAMPLE_LIMITS.ingredient} placeholder={t("المكوّن", "Ingredient")} aria-label={t("المكوّن", "Ingredient")} className={`${field} flex-1 min-w-0 !py-1.5`} />
                    <input type="number" min={0} step="any" value={Number.isFinite(g.amount) ? g.amount : 0} onChange={(e) => setIng(i, k, { amount: Math.max(0, Number(e.target.value) || 0) })} disabled={readOnly} aria-label={t("الكمية", "Amount")} dir="ltr" className={`${field} !w-20 !py-1.5 text-center`} />
                    <select value={g.unit} onChange={(e) => setIng(i, k, { unit: e.target.value as SampleUnit })} disabled={readOnly} aria-label={t("الوحدة", "Unit")} className={`${field} !w-[4.5rem] !py-1.5 !px-1.5`}>
                      {SAMPLE_UNITS.map((u) => <option key={u} value={u}>{pick(SAMPLE_UNIT_LABELS[u])}</option>)}
                    </select>
                    {!readOnly && <button type="button" onClick={() => patch(i, { ingredients: s.ingredients.filter((_, j) => j !== k) })} aria-label={t("احذف المكوّن", "Remove ingredient")} className="w-8 h-8 shrink-0 rounded-full text-paper-500 hover:bg-paper-100 hover:text-red-700"><i className="ri-close-line" aria-hidden="true"></i></button>}
                  </li>
                ))}
              </ul>
              {!readOnly && (
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <button type="button" onClick={() => patch(i, { ingredients: [...s.ingredients, { name: "", amount: 0, unit: s.ingredients.at(-1)?.unit ?? "%" }] })} disabled={s.ingredients.length >= SAMPLE_LIMITS.ingredients} className="inline-flex items-center gap-1 text-ink-900 hover:underline underline-offset-4" data-testid="add-ingredient"><i className="ri-add-line" aria-hidden="true"></i>{t("مكوّن", "Ingredient")}</button>
                  <button type="button" onClick={() => copyFrom(i)} disabled={value.length >= SAMPLE_LIMITS.samples} className="inline-flex items-center gap-1 text-paper-600 hover:underline underline-offset-4"><i className="ri-file-copy-line" aria-hidden="true"></i>{t("انسخها كعينة جديدة", "Duplicate as a new sample")}</button>
                  <button type="button" onClick={() => remove(i)} className="inline-flex items-center gap-1 text-red-700 hover:underline underline-offset-4 ms-auto"><i className="ri-delete-bin-line" aria-hidden="true"></i>{t("احذف العينة", "Remove sample")}</button>
                </div>
              )}
              {(s.decision || s.comment) && (
                <div className="mt-3 rounded-lg bg-paper-50 border border-paper-200 p-2.5 text-sm" data-testid="sample-verdict">
                  <DecisionBadge s={s} />
                  {s.comment && <p className="mt-1.5 text-paper-700 leading-[1.7]">«{s.comment}»</p>}
                </div>
              )}
            </div>
          </div>
        );
      })}
      {!readOnly && (
        <button type="button" onClick={add} disabled={value.length >= SAMPLE_LIMITS.samples} className="w-full rounded-xl border border-dashed border-paper-300 py-3 text-sm text-ink-900 hover:border-ink-900 disabled:opacity-50" data-testid="add-sample">
          <i className="ri-add-line" aria-hidden="true"></i> {t("أضف عينة", "Add a sample")}
        </button>
      )}
    </div>
  );
}
