import { useEffect } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import Navbar from "@/pages/home/components/Navbar";
import FooterSection from "@/pages/home/components/FooterSection";
import Button from "@/components/ui/Button";
import { useI18n } from "@/i18n/context";
import { SERVICE_TRACKS } from "@/data/services";
import { lessonBySlug, lessonsFor, nextLesson } from "@/data/learn";
import { LessonCard } from "@/learn/LearnStrip";

// درس واحد: أقسام قصيرة، خلاصة، ثم أين يطبّق العميل ما تعلّمه، والدرس التالي في خدمته.
export default function LessonPage() {
  const { slug = "" } = useParams();
  const [params] = useSearchParams();
  const { t, pick, num } = useI18n();
  const l = lessonBySlug(slug);
  const raw = (params.get("track") ?? "").toUpperCase();
  const track = l && l.tracks.includes(raw as "A") ? raw : "";
  useEffect(() => {
    if (l) document.title = pick(l.title);
    window.scrollTo(0, 0);
  }, [l, pick]);

  if (!l) {
    return (
      <div className="min-h-screen bg-paper-50">
        <Navbar />
        <main className="max-w-2xl mx-auto px-5 pt-40 pb-24 text-center" data-testid="lesson-missing">
          <h1 className="font-display text-3xl text-ink-900">{t("لم نجد هذا الدرس", "Lesson not found")}</h1>
          <div className="mt-6 flex justify-center"><Button to="/learn">{t("كل الدروس", "All lessons")}</Button></div>
        </main>
        <FooterSection />
      </div>
    );
  }
  const services = SERVICE_TRACKS.filter((s) => l.tracks.includes(s.id));
  const next = nextLesson(l.slug, track || null);
  const pool = lessonsFor(track || null);
  const pos = pool.findIndex((x) => x.slug === l.slug);

  return (
    <div className="min-h-screen bg-paper-50">
      <Navbar />
      <main className="max-w-3xl mx-auto px-5 md:px-8 pt-32 md:pt-40 pb-24">
        <nav aria-label={t("مسار التنقل", "Breadcrumb")} className="text-sm text-paper-500">
          <Link to={track ? `/learn?track=${track}` : "/learn"} className="hover:text-ink-900 underline-offset-4 hover:underline">{t("التعليم", "Learn")}</Link>
          {pos >= 0 && <span> · {t(`الدرس ${num(pos + 1)} من ${num(pool.length)}`, `Lesson ${pos + 1} of ${pool.length}`)}</span>}
        </nav>
        <article data-testid="lesson" data-slug={l.slug}>
          <header className="mt-4">
            <span className="w-12 h-12 rounded-2xl bg-ink-900 text-white flex items-center justify-center text-xl" aria-hidden="true"><i className={l.icon}></i></span>
            <h1 className="mt-5 font-display text-3xl md:text-5xl text-ink-900 leading-[1.2]">{pick(l.title)}</h1>
            <p className="mt-4 text-lg text-paper-600 leading-[1.8]">{pick(l.summary)}</p>
            <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-full bg-paper-100 text-paper-700 px-3 py-1"><i className="ri-time-line" aria-hidden="true"></i>{t(`${num(l.minutes)} دقائق`, `${l.minutes} min`)}</span>
              {services.map((s) => (
                <Link key={s.id} to={`/services/${s.id}`} className="inline-flex items-center gap-1 rounded-full border border-paper-300 bg-white text-ink-900 px-3 py-1 hover:border-ink-900" data-testid="lesson-service"><i className={s.icon} aria-hidden="true"></i>{pick(s.title)}</Link>
              ))}
            </div>
          </header>

          <div className="mt-10 space-y-8">
            {l.sections.map((s, i) => (
              <section key={i} className="rounded-2xl bg-white border border-paper-200 p-5 md:p-7">
                <h2 className="font-display text-xl text-ink-900"><span className="text-paper-400 me-2">{num(i + 1)}</span>{pick(s.h)}</h2>
                {s.body && <p className="mt-3 text-paper-700 leading-[1.9]">{pick(s.body)}</p>}
                {s.points && (
                  <ul className="mt-3 space-y-2.5">
                    {s.points.map((p, k) => (
                      <li key={k} className="flex items-start gap-2.5 text-paper-700 leading-[1.8]"><i className="ri-checkbox-blank-circle-fill text-[6px] mt-3 text-accent2 shrink-0" aria-hidden="true"></i><span>{pick(p)}</span></li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>

          <aside className="mt-8 rounded-2xl bg-ink-900 text-white p-6 md:p-7" data-testid="lesson-takeaway">
            <p className="text-xs text-white/60">{t("الخلاصة", "The takeaway")}</p>
            <p className="mt-2 font-display text-xl md:text-2xl leading-[1.6]">{pick(l.takeaway)}</p>
            <Link to={l.apply.to} className="mt-5 inline-flex items-center gap-2 rounded-full bg-white text-ink-900 px-5 py-2.5 text-sm hover:bg-paper-100" data-testid="lesson-apply">{pick(l.apply.label)}<i className="ri-arrow-left-line rtl:rotate-0 ltr:rotate-180" aria-hidden="true"></i></Link>
          </aside>
        </article>

        {next && (
          <section className="mt-10" aria-labelledby="lesson-next">
            <h2 id="lesson-next" className="text-sm text-paper-500 mb-3">{t("الدرس التالي", "Next lesson")}</h2>
            <LessonCard l={next} track={track || null} />
          </section>
        )}
      </main>
      <FooterSection />
    </div>
  );
}
