import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "@/i18n/context";
import { kitsRepo } from "@/kits/repo";
import { amountDigits, sampleTotals, type KitOrder } from "@/kits/types";
import { KitStatusBadge } from "@/kits/components";
import { usePActor } from "@/projects/useProjects";
import type { Project, ProjectFormula } from "@/projects/types";
import { Card, useFormat } from "../components/ui";

// العينات والتركيبة في صفحة المشروع (الفريق): جولات العينات المرسلة لهذا المشروع وقرارات العميل عليها،
// والتركيبة المعتمدة بمكوّناتها (للفريق فقط) التي تُنسخ في أمر الإنتاج.
export default function ProjectSamplesPanel({ project, formula, canKits }: { project: Project; formula: ProjectFormula | null; canKits: boolean }) {
  const { t, num } = useI18n();
  const f = useFormat();
  const actor = usePActor();
  const [rounds, setRounds] = useState<KitOrder[] | null>(null);
  useEffect(() => {
    if (!actor || !canKits) {
      setRounds([]);
      return;
    }
    let live = true;
    void kitsRepo
      .list(actor)
      .then((l) => live && setRounds(l.filter((k) => k.projectId === project.id)))
      .catch(() => live && setRounds([]));
    return () => {
      live = false;
    };
  }, [actor, canKits, project.id, project.updatedAt]);

  return (
    <Card className="p-5 mb-6">
      <div id="pj-samples" className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="font-display text-xl text-ink-900">{t("العينات والتركيبة", "Samples & formula")}</h2>
        <div className="flex flex-wrap gap-2 text-sm">
          {canKits && <Link to={`/admin/kits?new=1&project=${project.id}`} className="inline-flex items-center gap-1.5 rounded-full border border-paper-300 px-4 py-2 hover:border-ink-900" data-testid="project-new-round"><i className="ri-test-tube-line" aria-hidden="true"></i>{t("جولة عينات", "Sample round")}</Link>}
          <Link to={`/admin/production?new=1&project=${project.id}`} className="inline-flex items-center gap-1.5 rounded-full border border-paper-300 px-4 py-2 hover:border-ink-900" data-testid="project-new-po"><i className="ri-settings-3-line" aria-hidden="true"></i>{t("أمر إنتاج", "Production order")}</Link>
        </div>
      </div>

      {project.formula ? (
        <div className="rounded-xl border border-ink-900 p-4" data-testid="project-formula">
          <p className="text-xs text-paper-500"><i className="ri-award-line" aria-hidden="true"></i> {t("التركيبة المعتمدة", "Approved formula")} · {project.formula.by === "client" ? t("اعتمدها العميل", "approved by the client") : t("ثبّتها الفريق", "set by the team")}{project.formula.approvedAt ? ` · ${f.date(project.formula.approvedAt)}` : ""}</p>
          <p className="mt-1 text-ink-900">{project.formula.code && <span className="font-mono me-2">{project.formula.code}</span>}{project.formula.name}{project.formula.concentration && <span className="text-paper-500"> · {project.formula.concentration}</span>} <span className="font-mono text-xs text-paper-500" dir="ltr">{project.formula.ref}</span></p>
          {formula && formula.ingredients.length > 0 && (
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer text-ink-900">{t(`المكوّنات (${num(formula.ingredients.length)}) · للفريق فقط`, `Ingredients (${formula.ingredients.length}) · team only`)}</summary>
              <ul className="mt-2 grid sm:grid-cols-2 gap-x-6 gap-y-1 text-xs" data-testid="project-formula-ingredients">
                {formula.ingredients.map((g, i) => <li key={i} className="flex justify-between gap-3 border-b border-paper-100 py-1"><span className="text-ink-900">{g.name}</span><span className="text-paper-600 whitespace-nowrap" dir="ltr">{num(g.amount, amountDigits(g.amount))} {g.unit}</span></li>)}
              </ul>
            </details>
          )}
          <p className="mt-2 text-xs text-paper-500">{t("تُنسخ في كل أمر إنتاج جديد لهذا المشروع.", "Copied into every new production order for this project.")}</p>
        </div>
      ) : (
        <p className="text-sm text-paper-500" data-testid="project-no-formula">{t("لا تركيبة معتمدة بعد. أرسل جولة عينات؛ حين يعتمد العميل عينة تصير تركيبة المشروع تلقائيًا، أو ثبّتها أنت من صفحة الشحنة.", "No approved formula yet. Send a sample round; when the client approves a sample it becomes the project formula automatically, or set it yourself from the shipment page.")}</p>
      )}

      {rounds && rounds.length > 0 && (
        <ul className="mt-4 divide-y divide-paper-100" data-testid="project-rounds">
          {rounds.map((k) => {
            const n = sampleTotals(k.samples);
            return (
              <li key={k.id} className="py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <Link to={`/admin/kits?order=${k.id}`} className="font-mono text-ink-900 hover:underline underline-offset-4" dir="ltr">{k.ref}</Link>
                <KitStatusBadge status={k.status} />
                <span className="text-paper-600">{k.decidedAt ? <><span className="text-[#1F6B4F]">✓ {num(n.accepted)}</span> · <span className="text-red-700">✗ {num(n.rejected)}</span></> : t(`${num(k.samples.length)} عينات بلا تقييم`, `${k.samples.length} samples unrated`)}</span>
                {k.approvedSample && <span className="inline-flex items-center gap-1 rounded-full bg-ink-900 text-white px-2.5 py-0.5 text-xs"><i className="ri-award-fill" aria-hidden="true"></i>{k.samples.find((x) => x.id === k.approvedSample)?.name}</span>}
                <span className="ms-auto text-xs text-paper-500">{f.ago(k.updatedAt)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
