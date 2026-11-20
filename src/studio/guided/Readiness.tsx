import { useI18n } from "@/i18n/context";
import { readiness, type Issue, type Patch } from "../rules";

// بطاقة «فحص التوافق»: ما الذي يمنع التصنيع، وما الذي يُستحسن إصلاحه، مع إصلاح بضغطة لكل ملاحظة

const TONE = {
  error: { cls: "text-red-800", icon: "ri-close-circle-fill text-red-600" },
  warn: { cls: "text-accent2-ink", icon: "ri-error-warning-fill text-accent2" },
  tip: { cls: "text-paper-600", icon: "ri-lightbulb-line text-paper-500" },
} as const;

export default function Readiness({ issues, onFix, onFixAll, compact = false }: { issues: Issue[]; onFix: (p: Patch) => void; onFixAll?: () => void; compact?: boolean }) {
  const { t, pick, num } = useI18n();
  const r = readiness(issues);
  const fixable = issues.filter((i) => i.level !== "tip" && i.fix).length;
  const shown = compact ? issues.filter((i) => i.level !== "tip") : issues;
  const ok = r.errors === 0 && r.warns === 0;
  return (
    <section className={`rounded-2xl border p-4 ${ok ? "border-[#1F6B4F]/30 bg-[#E6F2EC]" : r.errors ? "border-red-200 bg-red-50" : "border-accent2/30 bg-accent2-soft"}`} aria-labelledby="ready-title" data-testid="readiness" data-errors={r.errors} data-warns={r.warns}>
      <div className="flex items-center justify-between gap-3">
        <h3 id="ready-title" className={`text-sm flex items-center gap-2 ${ok ? "text-[#1F6B4F]" : r.errors ? "text-red-800" : "text-accent2-ink"}`}>
          <i className={ok ? "ri-shield-check-fill" : r.errors ? "ri-error-warning-fill" : "ri-information-fill"} aria-hidden="true"></i>
          {ok
            ? t("كل شيء متوافق وجاهز للتصنيع", "Everything fits and is ready to make")
            : r.errors
              ? t(`${num(r.errors)} ${r.errors === 1 ? "مشكلة تمنع" : "مشاكل تمنع"} التصنيع`, `${r.errors} issue${r.errors === 1 ? "" : "s"} blocking production`)
              : t(`${num(r.warns)} ${r.warns === 1 ? "ملاحظة" : "ملاحظات"} قبل التصنيع`, `${r.warns} note${r.warns === 1 ? "" : "s"} before production`)}
        </h3>
        {onFixAll && fixable > 1 && (
          <button type="button" onClick={onFixAll} className="shrink-0 rounded-full bg-ink-900 text-white px-3 py-1.5 text-xs" data-testid="fix-all">
            {t("أصلح الكل", "Fix all")}
          </button>
        )}
      </div>
      {shown.length > 0 && (
        <ul className="mt-3 space-y-2">
          {shown.map((i) => (
            <li key={i.id} className={`flex items-start gap-2 text-xs leading-[1.7] ${TONE[i.level].cls}`} data-issue={i.id} data-level={i.level}>
              <i className={`${TONE[i.level].icon} text-sm mt-0.5`} aria-hidden="true"></i>
              <span className="flex-1">
                {pick(i.text)}
                {i.fix && (
                  <button type="button" onClick={() => onFix(i.fix!.patch)} className="ms-2 underline underline-offset-2 font-medium text-ink-900">
                    {pick(i.fix.label)}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {ok && !compact && <p className="mt-2 text-xs text-[#1F6B4F]/80">{t("العلبة على مقاس العبوة، والملصق داخل جسمها، والغطاء يركب على العنق.", "The box matches the bottle, the label sits on its body, and the cap fits the neck.")}</p>}
    </section>
  );
}
