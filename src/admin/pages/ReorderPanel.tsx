import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useI18n } from "@/i18n/context";
import { projectsRepo, type ProjectsData } from "@/projects/repo";
import { usePActor } from "@/projects/useProjects";
import { ReorderBox } from "@/projects/ReorderBox";
import { reorderSource } from "@/projects/reorder";
import type { Project } from "@/projects/types";
import { useCrm } from "../data/CrmProvider";

// إعادة الطلب في صفحة المشروع (الفريق): رابط للأصل إن كان المشروع إعادة طلب، وزر ينشئ إعادة طلب للعميل.
export default function ReorderPanel({ project, data, manage, reload }: { project: Project; data: ProjectsData; manage: boolean; reload: () => Promise<void> }) {
  const { t, num } = useI18n();
  const { run } = useCrm();
  const actor = usePActor();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const source = reorderSource(data.quotes.filter((q) => q.projectId === project.id), data.contracts.filter((c) => c.projectId === project.id));
  const eligible = manage && !!(source.quote || source.contract);
  const origin = project.reorderOf ? data.projects.find((x) => x.id === project.reorderOf) : null;
  const children = data.projects.filter((x) => x.reorderOf === project.id);
  if (!eligible && !project.reorderOf && !children.length) return null;
  return (
    <div className="mb-6 space-y-3" data-testid="reorder-panel">
      <div className="rounded-2xl bg-white border border-paper-200 px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <i className="ri-repeat-line text-paper-500" aria-hidden="true"></i>
        {project.reorderOf && (
          <span className="text-paper-700" data-testid="reorder-of">
            {t("إعادة طلب لمشروع ", "Reorder of ")}
            {origin ? <Link to={`/admin/projects/${origin.id}`} className="underline underline-offset-4 text-ink-900">«{origin.title}»</Link> : t("سابق", "an earlier project")}
            {project.brief?.reorder_qty ? t(` · الكمية ${num(Number(project.brief.reorder_qty))}`, ` · quantity ${project.brief.reorder_qty}`) : ""}
            {project.brief?.reorder_due ? t(` · التسليم قبل ${project.brief.reorder_due}`, ` · deliver by ${project.brief.reorder_due}`) : ""}
          </span>
        )}
        {children.length > 0 && (
          <span className="text-paper-700" data-testid="reorder-children">
            {t(`أُعيد طلبه ${num(children.length)} مرة: `, `Reordered ${children.length}×: `)}
            {children.map((c, i) => <span key={c.id}>{i > 0 && "، "}<Link to={`/admin/projects/${c.id}`} className="underline underline-offset-4 text-ink-900">{c.title}</Link></span>)}
          </span>
        )}
        {eligible && !open && (
          <button type="button" onClick={() => setOpen(true)} className="ms-auto inline-flex items-center gap-1.5 rounded-full border border-paper-300 px-4 py-1.5 text-ink-900 hover:border-ink-900" data-testid="reorder-open">
            <i className="ri-repeat-line" aria-hidden="true"></i>{t("إعادة طلب للعميل", "Reorder for the client")}
          </button>
        )}
      </div>
      {open && (
        <ReorderBox
          forClient={false}
          quote={source.quote}
          contract={source.contract}
          onCancel={() => setOpen(false)}
          onSubmit={async (i) => {
            if (!actor) return false;
            let id = "";
            const ok = await run(async () => { id = await projectsRepo.reorder(project.id, i, actor); }, t("أُنشئت إعادة الطلب بمسودة عرض وعقد", "Reorder created with a draft quote and contract"));
            if (ok && id) {
              setOpen(false);
              await reload();
              nav(`/admin/projects/${id}`);
            }
            return ok;
          }}
        />
      )}
    </div>
  );
}
