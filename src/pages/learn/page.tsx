import { useSearchParams } from "react-router-dom";
import Navbar from "@/pages/home/components/Navbar";
import FooterSection from "@/pages/home/components/FooterSection";
import PageHeader from "@/components/base/PageHeader";
import Button from "@/components/ui/Button";
import { useI18n } from "@/i18n/context";
import { SERVICE_TRACKS } from "@/data/services";
import { LESSONS, lessonsFor } from "@/data/learn";
import { LessonCard } from "@/learn/LearnStrip";

// قسم التعليم: دروس قصيرة يختارها العميل حسب خدمته، ليعرف ما سيقرره قبل أن يُسأل عنه.
export default function LearnPage() {
  const { t, pick, num } = useI18n();
  const [params, setParams] = useSearchParams();
  const raw = (params.get("track") ?? "").toUpperCase();
  const track = SERVICE_TRACKS.some((s) => s.id === raw) ? raw : "";
  const list = lessonsFor(track || null);
  const service = SERVICE_TRACKS.find((s) => s.id === track);
  const pickTrack = (id: string) => setParams(id ? { track: id } : {}, { replace: true });
  const chip = (on: boolean) => `rounded-full border px-4 py-2 text-sm transition-colors ${on ? "border-ink-900 bg-ink-900 text-white" : "border-paper-300 bg-white text-ink-900 hover:border-ink-900"}`;

  return (
    <div className="min-h-screen bg-paper-50">
      <Navbar />
      <PageHeader
        label={t("التعليم", "Learn")}
        title={<>{t("افهم الصناعة", "Understand the craft")} <span className="text-paper-400">{t("قبل أن تقرر.", "before you decide.")}</span></>}
        intro={t("دروس من ثلاث إلى خمس دقائق، مرتبة حسب الخدمة: العطر، العبوة والتغليف، الهوية، التصنيع، الطباعة، والعقود.", "Three-to-five-minute lessons, arranged by service: scent, packaging, identity, manufacturing, print and contracts.")}
      />
      <main className="max-w-7xl mx-auto px-5 md:px-8 pb-24">
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("الخدمة", "Service")} data-testid="learn-filter">
          <button type="button" onClick={() => pickTrack("")} aria-pressed={!track} className={chip(!track)}>{t(`كل الدروس (${num(LESSONS.length)})`, `All lessons (${LESSONS.length})`)}</button>
          {SERVICE_TRACKS.map((s) => (
            <button key={s.id} type="button" onClick={() => pickTrack(s.id)} aria-pressed={track === s.id} className={chip(track === s.id)} data-track={s.id}>
              <i className={`${s.icon} me-1.5`} aria-hidden="true"></i>{pick(s.title)} <span className="opacity-60">({num(lessonsFor(s.id).length)})</span>
            </button>
          ))}
        </div>

        {service && (
          <div className="mt-6 rounded-2xl bg-white border border-paper-200 p-5 flex flex-wrap items-center justify-between gap-4" data-testid="learn-service">
            <p className="text-ink-900">{t(`دروس خدمة «${pick(service.title)}»: اقرأها بالترتيب ثم ابدأ المسار.`, `Lessons for “${pick(service.title)}”: read them in order, then start the track.`)}</p>
            <div className="flex flex-wrap gap-2">
              <Button to={`/services/${service.id}`} variant="secondary">{t("تفاصيل الخدمة", "Service details")}</Button>
              <Button to={`/start/${service.id}`} arrow>{t("ابدأ هذا المسار", "Start this track")}</Button>
            </div>
          </div>
        )}

        <div className="mt-6 grid md:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="learn-list">
          {list.map((l) => <LessonCard key={l.slug} l={l} track={track || null} />)}
        </div>
      </main>
      <FooterSection />
    </div>
  );
}
