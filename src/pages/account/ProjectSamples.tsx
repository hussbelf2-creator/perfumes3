import { Link } from "react-router-dom";
import { useI18n } from "@/i18n/context";
import { useMyKits } from "@/kits/useKits";
import type { Project } from "@/projects/types";
import { KitCard, kitNextStep } from "./more";

// عينات المشروع وتركيبته المعتمدة داخل صفحة المشروع: العميل يرى جولات العينات المرسلة لهذا المشروع
// وخطوته عليها، والعينة التي صارت تركيبة الإنتاج.

export function FormulaCard({ p }: { p: Pick<Project, "formula"> }) {
  const { t, date } = useI18n();
  const f = p.formula;
  if (!f) return null;
  return (
    <div className="rounded-2xl bg-ink-900 text-white p-5" data-testid="project-formula">
      <p className="text-xs text-white/60"><i className="ri-award-line" aria-hidden="true"></i> {t("التركيبة المعتمدة للإنتاج", "Formula approved for production")}</p>
      <p className="mt-1.5 font-display text-xl">{f.code && <span className="font-mono text-base me-2 opacity-80">{f.code}</span>}{f.name}</p>
      <p className="mt-1 text-sm text-white/70">
        {[f.concentration, t(`من ${f.ref}`, `from ${f.ref}`), f.by === "client" ? t("اعتمدتَها أنت", "approved by you") : t("ثبّتها الفريق", "set by the team"), f.approvedAt ? date(new Date(f.approvedAt), { day: "numeric", month: "long" }) : ""].filter(Boolean).join(" · ")}
      </p>
    </div>
  );
}

/** عدد شحنات المشروع التي تنتظر خطوة من العميل (لشارة التنقل) */
export function useProjectSamples(projectId: string) {
  const kits = useMyKits();
  const mine = (kits ?? []).filter((k) => k.projectId === projectId);
  return { kits: mine, todo: mine.filter((k) => ["address", "decide"].includes(kitNextStep(k)) || (k.decidedAt && !k.approvedSample && k.samples.some((s) => s.decision === "accepted"))).length };
}

export default function ProjectSamples({ p }: { p: Project }) {
  const { t } = useI18n();
  const { kits } = useProjectSamples(p.id);
  if (!kits.length && !p.formula) return null;
  return (
    <section id="pj-samples" className="scroll-mt-24 space-y-3" aria-labelledby="pj-samples-h" data-testid="project-samples">
      <h2 id="pj-samples-h" className="font-display text-xl text-ink-900">{t("العينات والتركيبة", "Samples & formula")}</h2>
      <FormulaCard p={p} />
      {kits.some((k) => k.decidedAt && !k.approvedSample && k.samples.some((s) => s.decision === "accepted")) && !p.formula && (
        <p className="rounded-2xl bg-white border border-ink-900 px-4 py-3 text-sm text-ink-900" data-testid="formula-todo">
          <i className="ri-award-line" aria-hidden="true"></i> {t("قبلتَ عينة أو أكثر. افتح صفحة العينات واعتمد واحدة تركيبةً نهائية ليبدأ المصنع عليها.", "You accepted one or more samples. Open the samples page and approve one as the final formula so the factory can build on it.")}
        </p>
      )}
      {kits.length > 0 && <div className="grid gap-3">{kits.map((k) => <KitCard key={k.id} k={k} />)}</div>}
      {!kits.length && <p className="text-sm text-paper-600">{t("لا جولات عينات مرتبطة بهذا المشروع.", "No sample rounds linked to this project.")} <Link to="/account/samples" className="underline underline-offset-4 text-ink-900">{t("كل عيناتي", "All my samples")}</Link></p>}
    </section>
  );
}
