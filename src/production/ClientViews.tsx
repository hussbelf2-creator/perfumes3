import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/i18n/context";
import { useContent } from "@/cms/ContentProvider";
import { usePActor } from "@/projects/useProjects";
import type { Project } from "@/projects/types";
import { PHASES, buildPlan, planInputFromPayload, weeks, type Phase } from "./plan";
import { productionRepo } from "./repo";
import { PO_STATUS_LABELS, STEP_META, type PoProgress } from "./types";

// ما يراه العميل من التصنيع: خطة المشروع بمراحلها ومواعيدها، وتقدّم التشغيلة بأربع محطات. بلا مصطلحات مصنع.

/** خطة المشروع: مراحل مبسّطة بتواريخ تقديرية، وما يحكم موعد التسليم، وما ينتظر قرار العميل */
export function ProjectPlan({ project }: { project: Project }) {
  const { t, pick, num, date } = useI18n();
  const cfg = useContent("ops").production;
  const plan = useMemo(() => {
    const input = planInputFromPayload(project.track, project.brief);
    return input ? buildPlan({ ...input, start: new Date(project.createdAt) }, cfg) : null;
  }, [project.track, project.brief, project.createdAt, cfg]);
  if (!plan) return null;
  const w = weeks(plan.total);
  const start = new Date(project.createdAt).getTime();
  const at = (d: number) => date(new Date(start + d * 86_400_000), { day: "numeric", month: "short" });
  const phases = PHASES.map((ph) => ({ ...ph, stages: plan.stages.filter((s) => s.phase === ph.id) })).filter((ph) => ph.stages.length);
  return (
    <details className="group rounded-2xl bg-white border border-paper-200" id="pj-plan" data-testid="project-plan" open={project.stage === "brief"}>
      <summary className="cursor-pointer list-none px-5 py-4">
        <span className="flex items-center justify-between gap-3">
          <span className="font-display text-xl text-ink-900">{t("خطة مشروعك", "Your project plan")}</span>
          <i className="ri-arrow-down-s-line text-xl transition-transform group-open:rotate-180" aria-hidden="true"></i>
        </span>
        <span className="mt-1 block text-sm text-paper-600" data-testid="plan-eta">
          {t(`${num(w[0])} – ${num(w[1])} أسبوعاً · التسليم التقديري بين ${at(plan.total[0])} و${at(plan.total[1])}`, `${w[0]} – ${w[1]} weeks · estimated delivery between ${at(plan.total[0])} and ${at(plan.total[1])}`)}
        </span>
      </summary>
      <div className="px-5 pb-5 space-y-4">
        {plan.driver && (
          <p className="rounded-xl bg-paper-50 border border-paper-200 px-3 py-2.5 text-xs text-ink-900 leading-[1.7]">
            <i className="ri-compass-3-line me-1.5" aria-hidden="true"></i>
            {t(`ما يحكم موعد التسليم: ${pick(plan.driver.name)} (${num(plan.driver.days[0])} – ${num(plan.driver.days[1])} يوماً). وكل يوم يتأخر فيه اعتمادك يؤخر التسليم يوماً.`, `What drives the date: ${pick(plan.driver.name)} (${plan.driver.days[0]} – ${plan.driver.days[1]} days). Each day an approval waits moves delivery by a day.`)}
          </p>
        )}
        <ol className="space-y-4">
          {phases.map((ph) => (
            <li key={ph.id}>
              <p className="text-xs text-paper-500 flex items-center gap-1.5 mb-1.5"><i className={ph.icon} aria-hidden="true"></i>{pick(ph.name)}</p>
              <ul className="space-y-1.5 border-s border-paper-200 ps-3">
                {ph.stages.map((s) => (
                  <li key={s.id} className="text-sm" data-stage={s.id} data-lane={s.lane}>
                    <span className="flex items-baseline justify-between gap-3">
                      <span className={s.lane === "client" ? "text-accent2-ink" : "text-ink-900"}>
                        {s.lane === "client" && <i className="ri-user-follow-line me-1" aria-hidden="true"></i>}
                        {pick(s.name)}
                      </span>
                      <span className="shrink-0 text-[11px] text-paper-500 font-mono" dir="ltr">{at(s.start[1])} → {at(s.end[1])}</span>
                    </span>
                    <span className="block text-[11px] text-paper-500 leading-[1.6]">{s.lane === "client" && s.needs ? `${t("مطلوب منك", "Needs you")}: ${pick(s.needs)}` : pick(s.what)}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
        <p className="text-[11px] text-paper-400 leading-[1.6]">{t("تقدير مبني على طلبك؛ التواريخ النهائية في العقد وتُحدَّث مع كل اعتماد.", "An estimate built from your request; final dates are in the contract and update with each approval.")}</p>
      </div>
    </details>
  );
}

const PHASE_LABEL: Record<Phase, { ar: string; en: string }> = {
  prepare: { ar: "التحضير", en: "Preparation" },
  pack: { ar: "المواد والعينة", en: "Materials & sample" },
  juice: { ar: "التحضير والتعتيق", en: "Compounding & maceration" },
  produce: { ar: "التعبئة والتعليب", en: "Filling & boxing" },
  deliver: { ar: "الفحص والتسليم", en: "QC & delivery" },
};

/** تقدّم التشغيلات: يظهر فقط حين يبدأ المصنع أمر إنتاج لهذا المشروع */
export function ProductionProgress({ projectId }: { projectId: string }) {
  const { t, pick, num, date } = useI18n();
  const actor = usePActor();
  const [list, setList] = useState<PoProgress[] | null>(null);
  useEffect(() => {
    if (!actor) return;
    let live = true;
    productionRepo
      .progress([projectId], actor)
      .then((r) => live && setList(r[projectId] ?? []))
      .catch(() => live && setList([]));
    return () => {
      live = false;
    };
  }, [actor, projectId]);
  if (!list || list.length === 0) return null;
  return (
    <section className="rounded-2xl bg-white border border-paper-200 p-5 scroll-mt-24" id="pj-production" aria-labelledby="pj-production-title" data-testid="production-progress">
      <h2 id="pj-production-title" className="font-display text-xl text-ink-900">{t("التصنيع", "Production")}</h2>
      <div className="mt-4 space-y-5">
        {list.map((o) => {
          const done = o.phases.filter((p) => p.done).length;
          const released = o.status === "released";
          const fill = o.fillFrom ? new Date(o.fillFrom) : null;
          const left = fill ? Math.ceil((fill.getTime() - Date.now()) / 86_400_000) : null;
          return (
            <article key={o.ref} data-po={o.ref} data-status={o.status}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-ink-900">{o.product}</p>
                  <p className="text-[11px] text-paper-500 mt-0.5">{t(`${num(o.qty)} وحدة · تشغيلة`, `${o.qty} units · batch`)} <span className="font-mono" dir="ltr">{o.batchNo}</span></p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${released ? "bg-[#1F7A5C]/10 text-[#1F7A5C]" : o.status === "on_hold" ? "bg-accent2/15 text-accent2-ink" : "bg-paper-100 text-paper-700"}`}>{released ? t("جاهزة للتسليم", "Ready to deliver") : pick(PO_STATUS_LABELS[o.status])}</span>
              </div>
              <div className="mt-3 h-1.5 rounded-full bg-paper-200 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={o.phases.length} aria-valuenow={released ? o.phases.length : done} aria-label={t("تقدّم التصنيع", "Production progress")}>
                <div className="h-full bg-accent3 rounded-full transition-[width] duration-500" style={{ width: `${((released ? o.phases.length : done + 0.5) / o.phases.length) * 100}%` }} />
              </div>
              <ol className="mt-2 grid gap-1 text-[11px]" style={{ gridTemplateColumns: `repeat(${o.phases.length}, minmax(0, 1fr))` }}>
                {o.phases.map((p) => (
                  <li key={p.id} className={p.done ? "text-ink-900" : p.current ? "text-accent2-ink" : "text-paper-400"} data-phase={p.id} data-done={p.done}>
                    <i className={`${p.done ? "ri-checkbox-circle-fill" : p.current ? "ri-loader-2-line" : "ri-checkbox-blank-circle-line"} me-1`} aria-hidden="true"></i>
                    {pick(PHASE_LABEL[p.id])}
                  </li>
                ))}
              </ol>
              {!released && o.step && <p className="mt-3 text-sm text-paper-700">{t("الآن:", "Now:")} {pick(STEP_META[o.step].name)}</p>}
              {fill && left !== null && left > 0 && (
                <p className="mt-1 text-xs text-paper-600 leading-[1.7]" data-testid="client-maceration">
                  <i className="ri-hourglass-line me-1" aria-hidden="true"></i>
                  {t(`عطرك يتعتّق: باقٍ ${num(left)} يوماً، والتعبئة من ${date(fill, { day: "numeric", month: "long" })}. هذه المدة هي ما يعطيه ثباته وعمقه.`, `Your perfume is macerating: ${left} days left, filling from ${date(fill, { day: "numeric", month: "long" })}. This rest is what gives it depth and longevity.`)}
                </p>
              )}
              {released && o.releasedAt && <p className="mt-3 text-sm text-[#1F7A5C]">{t(`اجتازت الفحص النهائي وأُفرج عنها ${date(new Date(o.releasedAt), { day: "numeric", month: "long" })}.`, `Passed final QC and released on ${date(new Date(o.releasedAt), { day: "numeric", month: "long" })}.`)}</p>}
              {!released && o.dueAt && <p className="mt-1 text-[11px] text-paper-500">{t(`الموعد المستهدف ${date(new Date(o.dueAt), { day: "numeric", month: "long" })}`, `Target date ${date(new Date(o.dueAt), { day: "numeric", month: "long" })}`)}</p>}
            </article>
          );
        })}
      </div>
    </section>
  );
}

/** معاينة الخطة أثناء تعبئة «ابدأ مسارك»: تتحدّث مع كل إجابة ليرى العميل أثر اختياراته على الموعد */
export function PlanPreview({ track, answers, fields }: { track: string; answers: Record<string, string[]>; fields?: Record<string, string> }) {
  const { t, pick, num, date } = useI18n();
  const cfg = useContent("ops").production;
  const plan = useMemo(() => {
    const payload: Record<string, string> = { ...(fields ?? {}) };
    for (const [k, v] of Object.entries(answers)) payload[`a_${k}`] = v.join(",");
    const input = planInputFromPayload(track, payload);
    return input ? buildPlan(input, cfg) : null;
  }, [track, answers, fields, cfg]);
  if (!plan) return null;
  const w = weeks(plan.total);
  const phases = PHASES.filter((ph) => plan.stages.some((s) => s.phase === ph.id));
  return (
    <section className="mt-6 rounded-2xl bg-white border border-paper-200 p-5" aria-labelledby="st-plan" data-testid="plan-preview">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="st-plan" className="text-sm text-paper-500">{t("خطتك التقديرية بحسب إجاباتك", "Your estimated plan from your answers")}</h2>
        <p className="font-display text-xl text-ink-900" data-testid="plan-weeks">{t(`${num(w[0])} – ${num(w[1])} أسبوعاً`, `${w[0]} – ${w[1]} weeks`)}</p>
      </div>
      <ol className="mt-4 grid gap-2" style={{ gridTemplateColumns: `repeat(${phases.length}, minmax(0, 1fr))` }}>
        {phases.map((ph, i) => {
          const mine = plan.stages.filter((s) => s.phase === ph.id);
          const end = Math.max(...mine.map((s) => s.end[1]));
          return (
            <li key={ph.id} className="min-w-0">
              <span className="block h-1 rounded-full bg-ink-900" style={{ opacity: 0.25 + (0.75 * (i + 1)) / phases.length }} />
              <span className="mt-2 flex items-center gap-1 text-xs text-ink-900"><i className={`${ph.icon} shrink-0`} aria-hidden="true"></i><span className="truncate">{pick(ph.name)}</span></span>
              <span className="block text-[11px] text-paper-500">{t(`حتى اليوم ${num(end)}`, `by day ${end}`)}</span>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 text-xs text-paper-600 leading-[1.7]">
        {plan.driver && <>{t(`ما يحكم الموعد: ${pick(plan.driver.name)}.`, `What drives the date: ${pick(plan.driver.name)}.`)} </>}
        {t(`لو اعتمدت العرض اليوم فالتسليم التقديري حتى ${date(plan.eta[1], { day: "numeric", month: "long" })}. تعتمد أنت ${num(plan.clientStages.length)} محطات، والباقي علينا.`, `Approve today and delivery is estimated by ${date(plan.eta[1], { day: "numeric", month: "long" })}. You approve ${plan.clientStages.length} checkpoints; we do the rest.`)}
      </p>
    </section>
  );
}
