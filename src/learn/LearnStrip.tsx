import { Link } from "react-router-dom";
import { useI18n } from "@/i18n/context";
import { lessonsFor, type Lesson } from "@/data/learn";

// بطاقات دروس مرتبطة بخدمة: تظهر في صفحة الخدمة، في مشروع العميل، وفي صفحات العينات.

export function LessonCard({ l, track, compact = false }: { l: Lesson; track?: string | null; compact?: boolean }) {
  const { t, pick, num } = useI18n();
  return (
    <Link to={`/learn/${l.slug}${track ? `?track=${track}` : ""}`} className={`group block rounded-2xl bg-white border border-paper-200 hover:border-ink-900 transition-colors ${compact ? "p-4" : "p-5"}`} data-testid="lesson-card" data-slug={l.slug}>
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 shrink-0 rounded-xl bg-paper-100 text-ink-900 flex items-center justify-center text-lg" aria-hidden="true"><i className={l.icon}></i></span>
        <div className="min-w-0">
          <h3 className={`text-ink-900 leading-snug ${compact ? "text-sm" : "font-display text-lg"}`}>{pick(l.title)}</h3>
          {!compact && <p className="mt-1.5 text-sm text-paper-600 leading-[1.8]">{pick(l.summary)}</p>}
          <p className="mt-2 text-xs text-paper-500 inline-flex items-center gap-1"><i className="ri-time-line" aria-hidden="true"></i>{t(`${num(l.minutes)} دقائق قراءة`, `${l.minutes} min read`)}</p>
        </div>
      </div>
    </Link>
  );
}

export default function LearnStrip({ track, limit = 3, title, compact = false }: { track?: string | null; limit?: number; title?: string; compact?: boolean }) {
  const { t } = useI18n();
  const list = lessonsFor(track).slice(0, limit);
  if (!list.length) return null;
  return (
    <section aria-labelledby={`learn-strip-${track ?? "all"}`} data-testid="learn-strip">
      <div className="flex items-end justify-between gap-3 mb-4">
        <h2 id={`learn-strip-${track ?? "all"}`} className={compact ? "font-display text-lg text-ink-900" : "font-display text-2xl md:text-3xl text-ink-900"}>{title ?? t("تعلّم قبل أن تقرر", "Learn before you decide")}</h2>
        <Link to={track ? `/learn?track=${track}` : "/learn"} className="text-sm text-paper-600 hover:text-ink-900 underline-offset-4 hover:underline whitespace-nowrap">{t("كل الدروس", "All lessons")}</Link>
      </div>
      <div className={`grid gap-3 ${compact ? "" : "md:grid-cols-3"}`}>{list.map((l) => <LessonCard key={l.slug} l={l} track={track} compact={compact} />)}</div>
    </section>
  );
}
