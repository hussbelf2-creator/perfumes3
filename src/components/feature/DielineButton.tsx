import { useI18n } from "@/i18n/context";
import { downloadFile, parseStructureField, structureFileName, structureLabel, structureSvg, type BoxStructure } from "@/lib/packaging";

/** زر ينزّل قالب القص SVG المرسل مع الطلب (يُعاد توليده من حقل box_structure أو من كائن الهيكل) */
export default function DielineButton({ structure, field, compact = false }: { structure?: BoxStructure | null; field?: string | null; compact?: boolean }) {
  const { t, pick, num } = useI18n();
  const s = structure ?? parseStructureField(field);
  if (!s) return null;
  const run = () => downloadFile(structureSvg(s), structureFileName(s, "svg"));
  return (
    <button type="button" onClick={run} title={structureLabel(s, pick, t, num)} className={`inline-flex items-center gap-2 rounded-full border border-paper-300 bg-white text-ink-900 hover:border-ink-900 transition-colors ${compact ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"}`} data-testid="dieline-download">
      <i className="ri-scissors-cut-line" aria-hidden="true"></i>
      {t("قالب القص SVG", "Dieline SVG")}
    </button>
  );
}
