import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n/context";
import { useContent } from "@/cms/ContentProvider";
import { inventoryRepo } from "@/inventory/repo";
import { available, type InventoryItem } from "@/inventory/types";
import { projectsRepo } from "@/projects/repo";
import { usePActor } from "@/projects/useProjects";
import type { Project } from "@/projects/types";
import { productionRepo } from "@/production/repo";
import { pendingIssues, yieldPct, type PoPatch } from "@/production/logic";
import type { Concentration } from "@/production/plan";
import { PO_STATUS_LABELS, STEP_META, aqlPlan, bomRequired, currentStep, fillFrom, formulaBatch, qcVerdict, stepBlock, stepsDone, type BomLine, type NewOrder, type PoKind, type PoStatus, type ProductionOrder, type QcClass, type StepId } from "@/production/types";
import { validationText } from "@/creatives/messages";
import { useCrm } from "../data/CrmProvider";
import { ValidationError } from "../data/types";
import { Btn, Card, Drawer, Empty, PageTitle, Stat, download, fieldCls, inlineFieldCls, toCsv, useFormat, numFieldCls } from "../components/ui";

// أوامر الإنتاج: كل تشغيلة من استلام المواد إلى الإفراج، بخطوات موقّعة، مواد تُصرف من المخزون،
// ساعة تعتيق لا تُتجاوز إلا بانحراف موثّق، وفحص نهائي بعيّنة AQL. العميل يرى تقدّماً مبسّطاً منها في حسابه.

const STATUS_CLS: Record<PoStatus, string> = {
  planned: "bg-paper-100 text-paper-700",
  in_progress: "bg-ink-900 text-white",
  on_hold: "bg-accent2/15 text-accent2-ink",
  released: "bg-[#1F7A5C]/10 text-[#1F7A5C]",
  cancelled: "bg-red-50 text-red-700",
};
const CONC: Record<Concentration, string> = { edt: "EDT", edp: "EDP", extrait: "Extrait", oil: "Oil / دهن" };
const CLS_LABEL: Record<QcClass, { ar: string; en: string; cls: string }> = {
  critical: { ar: "حرج", en: "Critical", cls: "bg-red-50 text-red-700" },
  major: { ar: "رئيسي", en: "Major", cls: "bg-accent2/15 text-accent2-ink" },
  minor: { ar: "ثانوي", en: "Minor", cls: "bg-paper-100 text-paper-600" },
};

function StatusBadge({ s }: { s: PoStatus }) {
  const { pick } = useI18n();
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs whitespace-nowrap ${STATUS_CLS[s]}`} data-status={s}>{pick(PO_STATUS_LABELS[s])}</span>;
}

function NewForm({ projects, initialProject = "", onCreate }: { projects: Project[]; initialProject?: string; onCreate: (i: NewOrder) => Promise<boolean> }) {
  const needsFormula = (p?: Project) => !!p && ["A", "B", "E"].includes(p.track ?? "");
  const { t } = useI18n();
  const first = projects.find((x) => x.id === initialProject);
  const [project, setProject] = useState(first?.id ?? "");
  const [kind, setKind] = useState<PoKind>("perfume");
  const [product, setProduct] = useState(first?.title ?? "");
  const [qty, setQty] = useState(1000);
  const [fillMl, setFillMl] = useState(50);
  const [conc, setConc] = useState<Concentration>("edp");
  const [oud, setOud] = useState(false);
  const [due, setDue] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const p = projects.find((x) => x.id === project);
    await onCreate({ projectId: p?.id ?? null, projectTitle: p?.title ?? "", kind, product, qty, fillMl: kind === "perfume" ? fillMl : 0, concentration: conc, oud, dueAt: due || null });
  };
  return (
    <form onSubmit={submit} className="p-5 md:p-6 space-y-4" data-testid="po-new">
      <label className="block">
        <span className="block text-xs text-paper-500 mb-1.5">{t("المشروع (يرى العميل تقدّم التشغيلة في حسابه)", "Project (the client sees the batch progress in their account)")}</span>
        <select value={project} onChange={(e) => { setProject(e.target.value); const p = projects.find((x) => x.id === e.target.value); if (p && !product) setProduct(p.title); }} className={fieldCls}>
          <option value="">{t("بلا مشروع (تشغيلة داخلية)", "No project (internal batch)")}</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
        {(() => {
          const p = projects.find((x) => x.id === project);
          if (!p || kind !== "perfume") return null;
          return p.formula ? (
            <span className="mt-1.5 block text-xs text-[#1F6B4F]" data-testid="po-new-formula"><i className="ri-flask-line" aria-hidden="true"></i> {t(`التركيبة المعتمدة: ${p.formula.code ? `${p.formula.code} · ` : ""}${p.formula.name} (${p.formula.ref}). تُنسخ في الأمر تلقائيًا.`, `Approved formula: ${p.formula.code ? `${p.formula.code} · ` : ""}${p.formula.name} (${p.formula.ref}). Copied into the order automatically.`)}</span>
          ) : needsFormula(p) ? (
            <span className="mt-1.5 block text-xs text-[#9A4B12]" data-testid="po-new-noformula"><i className="ri-error-warning-line" aria-hidden="true"></i> {t("لا تركيبة معتمدة لهذا المشروع بعد. اعتمد عينة من «شحنات العينات» أولًا ليحملها الأمر.", "No approved formula for this project yet. Approve a sample under Sample shipments first so the order carries it.")}</span>
          ) : null;
        })()}
      </label>
      <fieldset>
        <legend className="block text-xs text-paper-500 mb-1.5">{t("نوع الأمر", "Order type")}</legend>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t("نوع الأمر", "Order type")}>
          {([["perfume", t("عطر معبأ", "Filled perfume"), t("تحضير وتعتيق وتعبئة وتعليب", "Compound, macerate, fill and box")], ["packaging", t("تغليف فقط", "Packaging only"), t("تجميع وتعبئة بلا عطر", "Assembly and packing, no juice")]] as const).map(([k, title, note]) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={`text-start rounded-xl border p-3 ${kind === k ? "border-ink-900 bg-white" : "border-paper-200 bg-white/60"}`}>
              <span className="block text-sm text-ink-900">{title}</span>
              <span className="block text-[11px] text-paper-500 mt-0.5">{note}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <label className="block">
        <span className="block text-xs text-paper-500 mb-1.5">{t("المنتج", "Product")}</span>
        <input value={product} onChange={(e) => setProduct(e.target.value)} required maxLength={120} placeholder={t("مثال: مسك الليل EDP 50 مل", "e.g. Musk Night EDP 50 ml")} className={fieldCls} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-xs text-paper-500 mb-1.5">{t("الكمية (وحدة)", "Quantity (units)")}</span>
          <input type="number" min={1} step={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} required className={fieldCls} />
        </label>
        <label className="block">
          <span className="block text-xs text-paper-500 mb-1.5">{t("التسليم المطلوب", "Due date")}</span>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={fieldCls} />
        </label>
        {kind === "perfume" && (
          <>
            <label className="block">
              <span className="block text-xs text-paper-500 mb-1.5">{t("حجم التعبئة (مل)", "Fill volume (ml)")}</span>
              <input type="number" min={1} max={1000} value={fillMl} onChange={(e) => setFillMl(Number(e.target.value))} required className={fieldCls} />
            </label>
            <label className="block">
              <span className="block text-xs text-paper-500 mb-1.5">{t("التركيز (يحدد أيام التعتيق)", "Concentration (sets maceration days)")}</span>
              <select value={conc} onChange={(e) => setConc(e.target.value as Concentration)} className={fieldCls}>
                {(Object.keys(CONC) as Concentration[]).map((c) => <option key={c} value={c}>{CONC[c]}</option>)}
              </select>
            </label>
            <label className="col-span-2 flex items-center gap-2 text-sm text-ink-900">
              <input type="checkbox" checked={oud} onChange={(e) => setOud(e.target.checked)} className="w-4 h-4 accent-ink-900" />
              {t("عود أو مخلّط ثقيل (تعتيق أطول)", "Oud or heavy mukhallat (longer maceration)")}
            </label>
          </>
        )}
      </div>
      <Btn type="submit">{t("أنشئ أمر الإنتاج", "Create production order")}</Btn>
    </form>
  );
}

function Section({ title, hint, children, id }: { title: string; hint?: string; children: React.ReactNode; id: string }) {
  return (
    <section className="rounded-2xl bg-white border border-paper-200 p-4" aria-labelledby={`po-${id}`} data-testid={`po-${id}`}>
      <h3 id={`po-${id}`} className="text-sm text-ink-900">{title}</h3>
      {hint && <p className="text-[11px] text-paper-500 mt-0.5 leading-[1.6]">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Detail({ o, items, manage, act }: { o: ProductionOrder; items: InventoryItem[]; manage: boolean; act: (fn: () => Promise<unknown>, ok?: string) => Promise<boolean> }) {
  const { t, pick, num, date } = useI18n();
  const f = useFormat();
  const actor = usePActor()!;
  const closed = o.status === "released" || o.status === "cancelled";
  const editable = manage && !closed;
  const [deviation, setDeviation] = useState(o.deviation);
  const [line, setLine] = useState({ itemId: "", name: "", perUnit: 1, wastagePct: 3, source: "factory" as BomLine["source"] });
  const save = (p: PoPatch, ok?: string) => act(() => productionRepo.save(o.id, p, actor), ok);
  const cur = currentStep(o);
  const from = fillFrom(o);
  const daysLeft = from ? Math.ceil((from.getTime() - Date.now()) / 86_400_000) : null;
  const verdict = qcVerdict(o);
  const plan = aqlPlan(o.qty);
  const pending = pendingIssues(o);
  const y = yieldPct(o);
  const byItem = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const addLine = (e: FormEvent) => {
    e.preventDefault();
    const it = byItem.get(line.itemId);
    const name = it?.name ?? line.name;
    if (!name.trim()) return;
    void save({ bom: [...o.bom, { id: `l${Date.now().toString(36)}`, itemId: it?.id ?? null, name, perUnit: line.perUnit, wastagePct: line.wastagePct, issued: 0, source: line.source }] }, t("أُضيفت المادة", "Material added")).then((ok) => ok && setLine({ itemId: "", name: "", perUnit: 1, wastagePct: 3, source: "factory" }));
  };
  return (
    <div className="p-5 md:p-6 space-y-4" data-testid="po-detail">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-lg text-ink-900" dir="ltr" style={{ textAlign: "start" }}>{o.ref}</p>
          <p className="text-sm text-ink-900 mt-0.5">{o.product}</p>
          <p className="text-xs text-paper-500 mt-1">
            {t(`${num(o.qty)} وحدة`, `${o.qty} units`)}{o.kind === "perfume" ? ` · ${num(o.fillMl)} ${t("مل", "ml")} · ${CONC[o.concentration]}` : ` · ${t("تغليف فقط", "packaging only")}`}
            {o.projectId && <> · <Link to={`/admin/projects/${o.projectId}`} className="underline underline-offset-4">{o.projectTitle || t("المشروع", "Project")}</Link></>}
          </p>
        </div>
        <StatusBadge s={o.status} />
      </div>
      <dl className="grid grid-cols-3 gap-px bg-paper-200 rounded-2xl overflow-hidden text-center">
        <div className="bg-white p-3"><dt className="text-[11px] text-paper-500">{t("رقم التشغيلة", "Batch no.")}</dt><dd className="mt-0.5 font-mono text-sm text-ink-900" dir="ltr" data-testid="po-batch">{o.batchNo}</dd></div>
        <div className="bg-white p-3"><dt className="text-[11px] text-paper-500">{t("الخطوات", "Steps")}</dt><dd className="mt-0.5 text-sm text-ink-900">{num(stepsDone(o))} / {num(o.steps.length)}</dd></div>
        <div className="bg-white p-3"><dt className="text-[11px] text-paper-500">{t("التسليم", "Due")}</dt><dd className="mt-0.5 text-sm text-ink-900">{o.dueAt ? f.date(o.dueAt) : "—"}</dd></div>
      </dl>

      {o.kind === "perfume" && (
        <Section id="formula" title={t("التركيبة المعتمدة", "Approved formula")} hint={o.formula ? t(`من العينة ${o.formula.kitRef}، اعتمدها ${o.formula.approvedBy === "client" ? "العميل" : "الفريق"} ${f.date(o.formula.approvedAt)}. لقطة ثابتة لا تتغير بتغيّر المشروع.`, `From sample ${o.formula.kitRef}, approved by the ${o.formula.approvedBy === "client" ? "client" : "team"} on ${f.date(o.formula.approvedAt)}. A fixed snapshot.`) : undefined}>
          {o.formula ? (
            <>
              <p className="text-sm text-ink-900">{o.formula.code && <span className="font-mono me-2">{o.formula.code}</span>}{o.formula.name}{o.formula.concentration && <span className="text-paper-500"> · {o.formula.concentration}</span>}</p>
              {o.formula.ingredients.length > 0 ? (
                <table className="mt-2 w-full text-xs" data-testid="po-formula-table">
                  <thead>
                    <tr className="text-paper-500 border-b border-paper-200">
                      <th scope="col" className="text-start font-normal py-1.5">{t("المكوّن", "Ingredient")}</th>
                      <th scope="col" className="text-end font-normal py-1.5">{t("في التركيبة", "In formula")}</th>
                      <th scope="col" className="text-end font-normal py-1.5">{t("للتشغيلة", "For the batch")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formulaBatch(o.formula, o.qty, o.fillMl).map((g, i) => (
                      <tr key={i} className="border-b border-paper-100 last:border-0">
                        <td className="py-1.5 text-ink-900">{g.name}</td>
                        <td className="py-1.5 text-end text-ink-900 whitespace-nowrap" dir="ltr">{num(g.amount, 3).replace(/\.?0+$/, "")} {g.unit}</td>
                        <td className="py-1.5 text-end text-ink-900 whitespace-nowrap">{g.batchMl === null ? "—" : g.batchMl >= 1000 ? `${num(g.batchMl / 1000, 2)} ${t("لتر", "L")}` : `${num(g.batchMl, 1)} ${t("مل", "ml")}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="mt-2 text-xs text-paper-500">{t("العينة المعتمدة بلا مكوّنات مسجّلة.", "The approved sample has no recorded ingredients.")}</p>
              )}
              <p className="mt-2 text-[11px] text-paper-500">{t(`كمية التشغيلة = النسبة × ${num(o.qty)} عبوة × ${num(o.fillMl)} مل، بلا هدر. أضف نسبة الهدر عند التحضير.`, `Batch amount = percentage × ${o.qty} units × ${o.fillMl} ml, before wastage.`)}</p>
            </>
          ) : (
            <p className="text-xs text-[#9A4B12]" data-testid="po-no-formula"><i className="ri-error-warning-line" aria-hidden="true"></i> {o.projectId ? t("لا تركيبة معتمدة لهذا المشروع ساعة إنشاء الأمر. اعتمد عينة من «شحنات العينات» ثم أنشئ أمرًا جديدًا، أو سجّل مرجع التركيبة يدويًا في «الامتثال».", "No approved formula for this project when the order was created. Approve a sample under Sample shipments and create a new order, or record the formula reference under Compliance.") : t("تشغيلة داخلية بلا مشروع: سجّل مرجع التركيبة في «الامتثال».", "Internal batch without a project: record the formula reference under Compliance.")}</p>
          )}
        </Section>
      )}

      <Section id="steps" title={t("خطوات التشغيلة", "Batch steps")} hint={t("كل خطوة تُسجَّل بوقتها وصاحبها. يُتراجع عن آخر خطوة فقط.", "Each step is logged with its time and operator. Only the last step can be undone.")}>
        <ol className="space-y-2">
          {o.steps.map((s, i) => {
            const meta = STEP_META[s.id];
            const block = !s.done ? stepBlock(o, s.id) : null;
            const isCur = s.id === cur;
            const lastDone = s.done && !o.steps.slice(i + 1).some((x) => x.done);
            return (
              <li key={s.id} className={`rounded-xl border p-3 ${s.done ? "border-paper-200 bg-paper-50" : isCur ? "border-ink-900 bg-white" : "border-paper-200 bg-white"}`} data-step={s.id} data-done={s.done}>
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-sm ${s.done ? "bg-accent3 text-white" : isCur ? "bg-ink-900 text-white" : "border border-paper-300 text-paper-500"}`} aria-hidden="true"><i className={s.done ? "ri-check-line" : meta.icon}></i></span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${s.done ? "text-paper-600" : "text-ink-900"}`}>{pick(meta.name)}</p>
                    <p className="text-[11px] text-paper-500 leading-[1.6]">{s.done && s.doneAt ? `${f.riyadh(s.doneAt)}${s.by ? ` · ${s.by}` : ""}${s.note ? ` · ${s.note}` : ""}` : pick(meta.what)}</p>
                    {s.id === "maceration" && from && !s.done && (
                      <p className={`mt-1 text-xs ${daysLeft! > 0 ? "text-accent2-ink" : "text-[#1F7A5C]"}`} data-testid="po-maceration">
                        <i className="ri-hourglass-line me-1" aria-hidden="true"></i>
                        {daysLeft! > 0 ? t(`باقٍ ${num(daysLeft!)} يوماً · أبكر تعبئة ${date(from, { day: "numeric", month: "long" })}`, `${daysLeft} days left · earliest fill ${date(from, { day: "numeric", month: "long" })}`) : t("اكتمل التعتيق: جاهز للترشيح والتعبئة", "Maceration complete: ready to filter and fill")}
                      </p>
                    )}
                    {isCur && block && block !== "step_order" && <p className="mt-1 text-xs text-accent2-ink" data-block={block}>{validationText(block, t)}</p>}
                  </div>
                  {editable && !s.done && isCur && (
                    <Btn onClick={() => void act(() => productionRepo.step(o.id, s.id, true, actor), s.id === "release" ? t("أُفرج عن التشغيلة", "Batch released") : t("سُجّلت الخطوة", "Step recorded"))} disabled={!!block} variant={s.id === "release" ? "primary" : "secondary"}>
                      {s.id === "release" ? t("أفرج", "Release") : t("أنجزت", "Done")}
                    </Btn>
                  )}
                  {editable && lastDone && (
                    <button type="button" onClick={() => void act(() => productionRepo.step(o.id, s.id as StepId, false, actor), t("أُلغيت الخطوة", "Step undone"))} className="text-xs text-paper-500 underline underline-offset-4">{t("تراجع", "Undo")}</button>
                  )}
                </div>
                {s.id === "golden" && !s.done && editable && (
                  <label className="mt-2 flex items-center gap-2 text-xs text-ink-900 ps-10">
                    <input type="checkbox" checked={!!o.goldenAt} onChange={(e) => void save({ goldenAt: e.target.checked ? new Date().toISOString() : null })} className="w-4 h-4 accent-ink-900" />
                    {t("وقّع العميل على العينة الذهبية", "The client signed the golden sample")}
                  </label>
                )}
                {s.id === "maceration" && !s.done && editable && from && daysLeft! > 0 && (
                  <form className="mt-2 ps-10 flex gap-2" onSubmit={(e) => { e.preventDefault(); void save({ deviation }, t("سُجّل الانحراف", "Deviation logged")); }}>
                    <input value={deviation} onChange={(e) => setDeviation(e.target.value)} maxLength={500} placeholder={t("انحراف موثّق: سبب التعبئة قبل اكتمال التعتيق ومن وافق", "Logged deviation: why fill early and who approved")} className={`${fieldCls} text-xs`} />
                    <Btn type="submit" variant="ghost" disabled={deviation === o.deviation}>{t("سجّل", "Log")}</Btn>
                  </form>
                )}
              </li>
            );
          })}
        </ol>
      </Section>

      <Section id="bom" title={t("المواد (BOM)", "Materials (BOM)")} hint={t("المطلوب = استهلاك الوحدة × الكمية × (1 + الهدر). الصرف يخصم من المخزون ويحمّل تكلفته على المشروع.", "Required = per-unit × quantity × (1 + wastage). Issuing deducts stock and charges the project.")}>
        {o.bom.length === 0 ? (
          <p className="text-xs text-paper-500">{t("لا مواد بعد. أضف العبوة والغطاء والمضخة والعلبة والملصق والزيت.", "No materials yet. Add the bottle, cap, pump, box, label and oil.")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-paper-500 border-b border-paper-100"><th scope="col" className="text-start font-normal py-1.5">{t("المادة", "Material")}</th><th scope="col" className="text-end font-normal py-1.5">{t("المطلوب", "Required")}</th><th scope="col" className="text-end font-normal py-1.5">{t("صُرف", "Issued")}</th><th scope="col" className="text-end font-normal py-1.5">{t("المتاح", "Available")}</th><th scope="col"></th></tr></thead>
              <tbody className="divide-y divide-paper-100">
                {o.bom.map((l) => {
                  const need = bomRequired(l, o.qty);
                  const it = l.itemId ? byItem.get(l.itemId) : undefined;
                  const short = it ? available(it) < need - l.issued : false;
                  return (
                    <tr key={l.id} data-bom={l.id}>
                      <td className="py-2 text-ink-900">{l.name}<span className="block text-[10px] text-paper-500">{l.source === "client" ? t("يوردها العميل", "Client-supplied") : `${num(l.perUnit, 4)} × ${num(o.qty)} + ${num(l.wastagePct)}%`}</span></td>
                      <td className="py-2 text-end font-mono">{num(need, 2)}</td>
                      <td className={`py-2 text-end font-mono ${l.issued >= need ? "text-[#1F7A5C]" : ""}`}>{l.source === "client" ? "—" : num(l.issued, 2)}</td>
                      <td className={`py-2 text-end font-mono ${short ? "text-red-700" : "text-paper-600"}`}>{it ? num(available(it), 2) : "—"}</td>
                      <td className="py-2 text-end">{editable && l.issued === 0 && <button type="button" onClick={() => void save({ bom: o.bom.filter((x) => x.id !== l.id) })} className="text-paper-400 hover:text-red-700" aria-label={t(`احذف ${l.name}`, `Remove ${l.name}`)}><i className="ri-close-line" aria-hidden="true"></i></button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {editable && (
          <>
            <form onSubmit={addLine} className="mt-3 grid grid-cols-12 gap-2 items-end">
              <label className="col-span-12 sm:col-span-5 block">
                <span className="block text-[11px] text-paper-500 mb-1">{t("من المخزون", "From stock")}</span>
                <select value={line.itemId} onChange={(e) => setLine({ ...line, itemId: e.target.value })} className={fieldCls} aria-label={t("مادة من المخزون", "Stock item")}>
                  <option value="">{t("مادة يوردها العميل (اكتب اسمها)", "Client-supplied (type its name)")}</option>
                  {items.map((i) => <option key={i.id} value={i.id}>{i.name} · {i.sku}</option>)}
                </select>
              </label>
              {!line.itemId && (
                <label className="col-span-12 sm:col-span-7 block">
                  <span className="block text-[11px] text-paper-500 mb-1">{t("اسم المادة", "Material name")}</span>
                  <input value={line.name} onChange={(e) => setLine({ ...line, name: e.target.value, source: "client" })} maxLength={120} className={fieldCls} />
                </label>
              )}
              <label className="col-span-4 sm:col-span-3 block">
                <span className="block text-[11px] text-paper-500 mb-1">{t("لكل وحدة", "Per unit")}</span>
                <input type="number" min={0.0001} step="any" value={line.perUnit} onChange={(e) => setLine({ ...line, perUnit: Number(e.target.value) })} required className={fieldCls} />
              </label>
              <label className="col-span-4 sm:col-span-2 block">
                <span className="block text-[11px] text-paper-500 mb-1">{t("هدر %", "Waste %")}</span>
                <input type="number" min={0} max={50} step="0.5" value={line.wastagePct} onChange={(e) => setLine({ ...line, wastagePct: Number(e.target.value) })} className={fieldCls} />
              </label>
              <div className="col-span-4 sm:col-span-2"><Btn type="submit" variant="secondary">{t("أضف", "Add")}</Btn></div>
            </form>
            {pending.length > 0 && (
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-xs text-paper-600">{t(`${num(pending.length)} مواد لم تُصرف بعد`, `${pending.length} materials not issued yet`)}</p>
                <Btn onClick={() => void act(async () => { const r = await productionRepo.issue(o.id, actor); if (r.errors.length) throw new ValidationError(r.errors[0]); }, t("صُرفت المواد من المخزون", "Materials issued from stock"))} data-testid="po-issue">{t("اصرف من المخزون", "Issue from stock")}</Btn>
              </div>
            )}
          </>
        )}
      </Section>

      <Section id="qc" title={t("الفحص النهائي (AQL)", "Final QC (AQL)")} hint={t(`ISO 2859-1 مستوى II: افحص ${num(plan.sample)} وحدة عشوائية. المقبول: حرج 0، رئيسي ${num(plan.accept.major)}، ثانوي ${num(plan.accept.minor)}.`, `ISO 2859-1 level II: inspect ${plan.sample} random units. Accept: critical 0, major ${plan.accept.major}, minor ${plan.accept.minor}.`)}>
        <ul className="space-y-1.5">
          {o.qc.map((q) => (
            <li key={q.id} className="flex items-center gap-2 text-xs" data-qc={q.id}>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${CLS_LABEL[q.cls].cls}`}>{pick(CLS_LABEL[q.cls])}</span>
              <span className="flex-1 text-ink-900">{pick(q.text)}</span>
              <label className="inline-flex items-center gap-1 text-paper-500">
                <span className="sr-only">{t(`عدد عيوب: ${q.text.ar}`, `Defects: ${q.text.en}`)}</span>
                <input type="number" min={0} step={1} value={q.defects ?? ""} disabled={!editable} placeholder="—" onChange={(e) => void save({ qc: [{ ...q, defects: e.target.value === "" ? null : Math.max(0, Math.round(Number(e.target.value))) }] })} className={numFieldCls} aria-label={t(`عدد عيوب: ${q.text.ar}`, `Defects: ${q.text.en}`)} />
              </label>
            </li>
          ))}
        </ul>
        <p className={`mt-3 text-xs rounded-xl px-3 py-2 ${verdict.pass === true ? "bg-[#E6F2EC] text-[#1F6B4F]" : verdict.pass === false ? "bg-red-50 text-red-800" : "bg-paper-50 text-paper-600"}`} data-testid="po-verdict" data-pass={String(verdict.pass)}>
          {verdict.pass === true ? t("مقبولة: العيوب ضمن حدود AQL", "Accepted: defects within AQL limits") : verdict.pass === false ? t(`مرفوضة: حرج ${num(verdict.defects.critical)}، رئيسي ${num(verdict.defects.major)}/${num(plan.accept.major)}، ثانوي ${num(verdict.defects.minor)}/${num(plan.accept.minor)}`, `Rejected: critical ${verdict.defects.critical}, major ${verdict.defects.major}/${plan.accept.major}, minor ${verdict.defects.minor}/${plan.accept.minor}`) : t(`فُحص ${num(verdict.checked)} من ${num(verdict.total)} بنود`, `${verdict.checked} of ${verdict.total} items checked`)}
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2 items-end">
          <label className="block">
            <span className="block text-[11px] text-paper-500 mb-1">{t("وحدات صالحة", "Good units")}</span>
            <input type="number" min={0} value={o.goodUnits ?? ""} disabled={!editable} onChange={(e) => void save({ goodUnits: e.target.value === "" ? null : Number(e.target.value) })} className={fieldCls} aria-label={t("وحدات صالحة", "Good units")} />
          </label>
          <label className="block">
            <span className="block text-[11px] text-paper-500 mb-1">{t("مرفوضة", "Rejects")}</span>
            <input type="number" min={0} value={o.rejects ?? ""} disabled={!editable} onChange={(e) => void save({ rejects: e.target.value === "" ? null : Number(e.target.value) })} className={fieldCls} aria-label={t("وحدات مرفوضة", "Rejected units")} />
          </label>
          <p className="text-xs text-paper-600 pb-2.5">{y !== null ? t(`العائد ${num(y, 1)}%`, `Yield ${y}%`) : t("العائد —", "Yield —")}</p>
        </div>
      </Section>

      <Section id="docs" title={t("الامتثال", "Compliance")} hint={t("ما يلزم المنتج قبل البيع في السعودية والخليج.", "What the product needs before sale in KSA and the GCC.")}>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-[11px] text-paper-500 mb-1">{t("شهادة IFRA (رقم التعديل)", "IFRA certificate (amendment)")}</span>
            <input defaultValue={o.docs.ifra} disabled={!editable} onBlur={(e) => e.target.value !== o.docs.ifra && void save({ docs: { ...o.docs, ifra: e.target.value } })} placeholder="51" className={fieldCls} dir="ltr" />
          </label>
          <label className="block">
            <span className="block text-[11px] text-paper-500 mb-1">{t("رقم الإدراج في «غد» (SFDA)", "SFDA GHAD listing no.")}</span>
            <input defaultValue={o.docs.ghad} disabled={!editable} onBlur={(e) => e.target.value !== o.docs.ghad && void save({ docs: { ...o.docs, ghad: e.target.value } })} className={fieldCls} dir="ltr" />
          </label>
          <label className="flex items-center gap-2 text-xs text-ink-900"><input type="checkbox" checked={o.docs.sds} disabled={!editable} onChange={(e) => void save({ docs: { ...o.docs, sds: e.target.checked } })} className="w-4 h-4 accent-ink-900" />{t("صحيفة بيانات السلامة (SDS)", "Safety data sheet (SDS)")}</label>
          <label className="flex items-center gap-2 text-xs text-ink-900"><input type="checkbox" checked={o.docs.allergens} disabled={!editable} onChange={(e) => void save({ docs: { ...o.docs, allergens: e.target.checked } })} className="w-4 h-4 accent-ink-900" />{t("إقرار مسببات الحساسية", "Allergen declaration")}</label>
          <label className="col-span-2 block">
            <span className="block text-[11px] text-paper-500 mb-1">{t("مرجع التركيبة", "Formula reference")}</span>
            <input defaultValue={o.formulaRef} disabled={!editable} onBlur={(e) => e.target.value !== o.formulaRef && void save({ formulaRef: e.target.value })} maxLength={60} className={fieldCls} dir="ltr" />
          </label>
        </div>
      </Section>

      <Section id="note" title={t("ملاحظة داخلية", "Internal note")}>
        <textarea defaultValue={o.note} rows={2} maxLength={1000} disabled={!manage || o.status === "cancelled"} onBlur={(e) => e.target.value !== o.note && void save({ note: e.target.value }, t("حُفظت الملاحظة", "Note saved"))} className={fieldCls} aria-label={t("ملاحظة داخلية", "Internal note")} />
        {o.releasedAt && <p className="mt-2 text-xs text-[#1F7A5C]">{t(`أُفرج عنها ${f.riyadh(o.releasedAt)}${o.releasedBy ? ` · ${o.releasedBy}` : ""}`, `Released ${f.riyadh(o.releasedAt)}${o.releasedBy ? ` · ${o.releasedBy}` : ""}`)}</p>}
        {editable && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Btn variant="secondary" onClick={() => void save({ hold: o.status !== "on_hold" }, o.status === "on_hold" ? t("استؤنف الأمر", "Order resumed") : t("أُوقف الأمر", "Order on hold"))}>{o.status === "on_hold" ? t("استأنف", "Resume") : t("أوقف مؤقتاً", "Put on hold")}</Btn>
            <Btn variant="danger" onClick={() => window.confirm(t("إلغاء أمر الإنتاج؟ لا يُستعاد.", "Cancel this production order? This can't be undone.")) && void act(() => productionRepo.cancel(o.id, actor), t("أُلغي الأمر", "Order cancelled"))}>{t("ألغِ الأمر", "Cancel order")}</Btn>
          </div>
        )}
      </Section>
    </div>
  );
}

export default function Production() {
  const { t, pick, num } = useI18n();
  const { can } = useAuth();
  const { run } = useCrm();
  const actor = usePActor();
  const f = useFormat();
  const ops = useContent("ops");
  const [params, setParams] = useSearchParams();
  const [orders, setOrders] = useState<ProductionOrder[] | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [status, setStatus] = useState("open");
  const [q, setQ] = useState("");
  const manage = can("projects.manage") || can("inventory.manage");

  const reload = useCallback(async () => {
    if (!actor) return;
    setOrders(await productionRepo.list(actor));
    void inventoryRepo.load(actor).then((d) => setItems(d.items.filter((i) => i.active))).catch(() => undefined);
  }, [actor]);
  useEffect(() => {
    void reload();
    if (actor) void projectsRepo.load(actor).then((d) => setProjects(d.projects.filter((p) => p.status !== "done"))).catch(() => undefined);
  }, [actor, reload]);

  const set = (k: string, v: string | null) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v);
    else n.delete(k);
    setParams(n, { replace: true });
  };
  const open = orders?.find((o) => o.id === params.get("order")) ?? null;
  const adding = params.get("new") === "1";
  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    const done = await run(fn, ok);
    await reload();
    return done;
  };
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (orders ?? []).filter((o) => (status === "all" ? true : status === "open" ? o.status !== "released" && o.status !== "cancelled" : o.status === status)).filter((o) => !needle || [o.ref, o.batchNo, o.product, o.projectTitle].some((v) => v.toLowerCase().includes(needle)));
  }, [orders, status, q]);
  if (!orders) return <div className="h-48 rounded-2xl shimmer bg-paper-100" />;

  const live = orders.filter((o) => o.status === "in_progress" || o.status === "planned" || o.status === "on_hold");
  const macerating = orders.filter((o) => o.status === "in_progress" && currentStep(o) === "maceration");
  const month = new Date().toISOString().slice(0, 7);
  const released = orders.filter((o) => o.status === "released" && (o.releasedAt ?? "").startsWith(month));
  const late = live.filter((o) => o.dueAt && o.dueAt < new Date().toISOString().slice(0, 10));

  return (
    <>
      <PageTitle
        title={t("أوامر الإنتاج", "Production orders")}
        sub={t("كل تشغيلة من استلام المواد إلى الإفراج: خطوات موقّعة، مواد تُصرف من المخزون، تعتيق له ساعة، وفحص نهائي بعيّنة AQL. العميل يرى تقدّمها في حسابه.", "Every batch from materials to release: signed steps, stock issues, a maceration clock and AQL final inspection. The client follows its progress in their account.")}
        actions={
          <div className="flex gap-2">
            <Btn variant="secondary" onClick={() => download(`production-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([["ref", "batch_no", "product", "qty", "status", "step", "project", "due", "good_units", "rejects", "released_at"], ...rows.map((o) => [o.ref, o.batchNo, o.product, o.qty, o.status, currentStep(o) ?? "", o.projectTitle, o.dueAt ?? "", o.goodUnits ?? "", o.rejects ?? "", o.releasedAt ?? ""])]))}>
              <i className="ri-download-2-line" aria-hidden="true"></i>
              {t("تصدير CSV", "Export CSV")}
            </Btn>
            {manage && <Btn onClick={() => set("new", "1")}>{t("أمر إنتاج جديد", "New production order")}</Btn>}
          </div>
        }
      />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4 mb-4">
        <Stat icon="ri-settings-3-line" label={t("تشغيلات جارية", "Live batches")} value={num(live.length)} />
        <Stat icon="ri-hourglass-line" label={t("في التعتيق", "Macerating")} value={num(macerating.length)} hint={macerating.length ? t("لا تُعبّأ قبل موعدها", "Don't fill before their date") : undefined} />
        <Stat icon="ri-alarm-warning-line" label={t("متأخرة عن موعدها", "Past due")} value={num(late.length)} tone={late.length ? "warn" : "plain"} />
        <Stat icon="ri-checkbox-circle-line" label={t("أُفرج عنها هذا الشهر", "Released this month")} value={num(released.length)} tone="good" />
      </div>
      <Card>
        <div className="p-4 border-b border-paper-100 flex flex-wrap items-center gap-3">
          <label className="relative flex-1 min-w-48">
            <i className="ri-search-line absolute top-1/2 -translate-y-1/2 start-3 text-paper-400" aria-hidden="true"></i>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("المرجع، رقم التشغيلة، المنتج…", "Ref, batch no., product…")} aria-label={t("بحث", "Search")} className={`${fieldCls} ps-9`} />
          </label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={inlineFieldCls} aria-label={t("الحالة", "Status")}>
            <option value="open">{t("الجارية", "Open")}</option>
            <option value="all">{t("الكل", "All")}</option>
            {(Object.keys(PO_STATUS_LABELS) as PoStatus[]).map((s) => <option key={s} value={s}>{pick(PO_STATUS_LABELS[s])}</option>)}
          </select>
        </div>
        {rows.length === 0 ? (
          <Empty icon="ri-settings-3-line" title={t("لا أوامر إنتاج هنا", "No production orders here")} hint={t("أنشئ أمراً من مشروع دُفع عربونه، وأضف مواده، ثم سجّل خطواته.", "Create an order from a project with a paid deposit, add its materials, then record the steps.")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="po-table">
              <thead>
                <tr className="text-xs text-paper-500 border-b border-paper-100">
                  <th scope="col" className="text-start font-normal px-5 py-3">{t("المرجع", "Ref")}</th>
                  <th scope="col" className="text-start font-normal px-3 py-3">{t("المنتج", "Product")}</th>
                  <th scope="col" className="text-start font-normal px-3 py-3 hidden md:table-cell">{t("التشغيلة", "Batch")}</th>
                  <th scope="col" className="text-start font-normal px-3 py-3">{t("الخطوة الحالية", "Current step")}</th>
                  <th scope="col" className="text-start font-normal px-3 py-3 hidden sm:table-cell">{t("الحالة", "Status")}</th>
                  <th scope="col" className="text-end font-normal px-5 py-3 hidden lg:table-cell">{t("التسليم", "Due")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-paper-100">
                {rows.map((o) => {
                  const cur = currentStep(o);
                  const pct = Math.round((stepsDone(o) / o.steps.length) * 100);
                  return (
                    <tr key={o.id} className="hover:bg-paper-50 cursor-pointer" onClick={() => set("order", o.id)}>
                      <td className="px-5 py-3"><button type="button" className="font-mono text-ink-900 hover:underline underline-offset-4" dir="ltr">{o.ref}</button></td>
                      <td className="px-3 py-3"><span className="block text-ink-900">{o.product}</span><span className="block text-xs text-paper-500">{t(`${num(o.qty)} وحدة`, `${o.qty} units`)}{o.projectTitle ? ` · ${o.projectTitle}` : ""}</span></td>
                      <td className="px-3 py-3 hidden md:table-cell font-mono text-xs text-paper-600" dir="ltr" style={{ textAlign: "start" }}>{o.batchNo}</td>
                      <td className="px-3 py-3 min-w-40">
                        <span className="block text-xs text-ink-900">{cur ? pick(STEP_META[cur].name) : t("اكتملت", "Complete")}</span>
                        <span className="mt-1 block h-1 rounded-full bg-paper-200 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><span className="block h-full bg-accent3 rounded-full" style={{ width: `${pct}%` }} /></span>
                      </td>
                      <td className="px-3 py-3 hidden sm:table-cell"><StatusBadge s={o.status} /></td>
                      <td className="px-5 py-3 text-end text-paper-600 whitespace-nowrap hidden lg:table-cell">{o.dueAt ? f.date(o.dueAt) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Drawer open={adding} onClose={() => set("new", null)} title={t("أمر إنتاج جديد", "New production order")}>
        <NewForm key={projects.length} projects={projects} initialProject={params.get("project") ?? ""} onCreate={async (i) => {
          if (!actor) return false;
          let id = "";
          const ok = await run(async () => { id = (await productionRepo.create(i, ops.production, actor)).id; }, t("أُنشئ أمر الإنتاج", "Production order created"));
          if (ok) {
            await reload();
            const n = new URLSearchParams(params);
            n.delete("new");
            n.set("order", id);
            setParams(n, { replace: true });
          }
          return ok;
        }} />
      </Drawer>
      <Drawer open={!!open} onClose={() => set("order", null)} title={open?.ref ?? ""}>
        {open && <Detail key={open.id} o={open} items={items} manage={manage} act={act} />}
      </Drawer>
    </>
  );
}
