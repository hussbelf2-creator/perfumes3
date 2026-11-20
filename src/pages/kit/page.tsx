import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import Navbar from "@/pages/home/components/Navbar";
import FooterSection from "@/pages/home/components/FooterSection";
import Button from "@/components/ui/Button";
import { useI18n } from "@/i18n/context";
import { useContent } from "@/cms/ContentProvider";
import { ValidationError } from "@/admin/data/types";
import { validationText } from "@/creatives/messages";
import { kitsRepo } from "@/kits/repo";
import { KIT_KIND_LABELS, KIT_REF_RE, addressOpen, canDecide, kitStatusHint, sampleTotals, sheetPath, statusAt, type KitAddress, type KitDecisionInput, type KitSheet, type KitTrack } from "@/kits/types";
import { KitProgress, KitStatusBadge, KitTimeline, TrackingLink } from "@/kits/components";
import { ConfirmAddress, SampleDecisions } from "@/kits/ClientSheet";
import { useAuth } from "@/hooks/useAuth";
import { addressesRepo, type SavedAddress } from "@/account/addresses";

// صفحة شحنة العينات. برقم الطلب وحده: تتبع عام بلا بيانات شخصية.
// برمز الورقة (?k= من رمز QR المطبوع أو من الحساب): العينات بأسمائها ومكوّناتها، تأكيد العنوان، وقبول أو رفض كل عينة.

type State = { status: "loading" | "ok" | "missing" | "error"; track?: KitTrack; sheet?: KitSheet };

export default function KitTrackPage() {
  const { ref = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { t, pick, num } = useI18n();
  const kit = useContent("offers").kit;
  const [state, setState] = useState<State>({ status: "loading" });
  const [input, setInput] = useState("");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const clean = ref.trim().toUpperCase();
  const token = (params.get("k") ?? "").trim();
  // العميل المسجّل يختار من عناوينه المحفوظة
  const { user } = useAuth();
  const [saved, setSaved] = useState<SavedAddress[]>([]);
  useEffect(() => {
    if (!user || user.role !== "client" || !token) return;
    let live = true;
    void addressesRepo.list(user.id).then((l) => live && setSaved(l)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [user, token]);

  useEffect(() => {
    if (!KIT_REF_RE.test(clean)) {
      setState({ status: "missing" });
      return;
    }
    let live = true;
    setState({ status: "loading" });
    const load = async (): Promise<State> => {
      if (token) {
        const sheet = await kitsRepo.sheet(clean, token);
        if (sheet) return { status: "ok", track: sheet, sheet };
      }
      const tr = await kitsRepo.track(clean);
      return tr ? { status: "ok", track: tr } : { status: "missing" };
    };
    load()
      .then((s) => live && setState(s))
      .catch(() => live && setState({ status: "error" }));
    return () => {
      live = false;
    };
  }, [clean, token]);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(id);
  }, [notice]);

  const act = useCallback(
    async (fn: () => Promise<KitSheet>, okText: string) => {
      try {
        const sheet = await fn();
        setState({ status: "ok", track: sheet, sheet });
        setNotice({ ok: true, text: okText });
        return true;
      } catch (e) {
        setNotice({ ok: false, text: e instanceof ValidationError ? validationText(e.code, t) : t("تعذّر الحفظ. حاول مرة أخرى.", "Couldn't save. Please try again.") });
        return false;
      }
    },
    [t],
  );
  const saveAddress = (a: KitAddress & { name?: string }) => act(() => kitsRepo.setAddress(clean, token, a), t("حفظنا عنوان التسليم.", "Delivery address saved."));
  const decide = (d: KitDecisionInput[]) => act(() => kitsRepo.decide(clean, token, d), t("وصل تقييمك للعطّار. شكرًا لك.", "Your rating reached the perfumer. Thank you."));
  const approve = (sampleId: string) => act(() => kitsRepo.approve(clean, token, sampleId), t("اعتُمدت التركيبة. يبدأ المصنع عليها.", "Formula approved. The factory builds on it."));

  const lookup = (e: FormEvent) => {
    e.preventDefault();
    const raw = input.trim().toUpperCase();
    const v = /^(KIT|SMP)-/.test(raw) ? raw : `KIT-${raw}`;
    if (KIT_REF_RE.test(v)) navigate(`/kit/${v}`);
  };

  const tr = state.track;
  const sheet = state.sheet;
  const dates = tr ? { new: tr.createdAt, preparing: statusAt({ history: tr.history }, "preparing"), shipped: tr.shippedAt ?? statusAt({ history: tr.history }, "shipped"), delivered: tr.deliveredAt } : undefined;
  const totals = sheet ? sampleTotals(sheet.samples) : null;
  // الخطوة التالية المطلوبة من العميل، واحدة في كل مرة
  const next = !sheet ? null : addressOpen(sheet.status) && !sheet.addressConfirmedAt ? "address" : canDecide(sheet.status) && sheet.samples.length > 0 && !sheet.decidedAt ? "decide" : sheet.decidedAt ? "done" : "wait";

  return (
    <div className="min-h-screen bg-paper-50">
      <Navbar />
      <main className="max-w-2xl mx-auto px-5 md:px-8 pt-32 md:pt-40 pb-24">
        <p className="text-sm text-paper-500">{sheet ? pick(KIT_KIND_LABELS[sheet.kind]) : t("عينة الاكتشاف", "Discovery kit")}</p>
        <h1 className="mt-2 font-display text-3xl md:text-4xl text-ink-900">{sheet ? t("عيناتك", "Your samples") : t("تتبّع شحنة عينتك", "Track your kit")}</h1>

        {notice && (
          <p role={notice.ok ? "status" : "alert"} className={`mt-6 rounded-2xl px-4 py-3 text-sm ${notice.ok ? "bg-[#E3F1EA] text-[#1F6B4F]" : "bg-red-50 text-red-700"}`} data-testid="kit-notice">{notice.text}</p>
        )}

        {state.status === "loading" && (
          <div role="status" aria-live="polite" className="mt-10 rounded-[1.75rem] bg-white border border-paper-200 p-10 text-center">
            <span className="w-12 h-12 mx-auto block rounded-full border-2 border-paper-200 border-t-ink-900 animate-spin" aria-hidden="true" />
            <p className="mt-6 text-paper-600">{t("نبحث عن شحنتك…", "Looking up your parcel…")}</p>
          </div>
        )}

        {state.status === "ok" && tr && (
          <section className="mt-8 rounded-[1.75rem] bg-white border border-paper-200 p-6 md:p-8 panel-in" data-testid="kit-track" aria-labelledby="kt-ref">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs text-paper-500">{t("رقم الطلب", "Order")}</p>
                <p id="kt-ref" className="font-mono text-xl text-ink-900" dir="ltr" style={{ textAlign: "start" }}>{tr.ref}</p>
              </div>
              <KitStatusBadge status={tr.status} />
            </div>
            <p className="mt-4 text-paper-700 leading-[1.8]">{pick(kitStatusHint(tr.status, sheet?.kind ?? (tr.ref.startsWith("SMP-") ? "round" : null)))}</p>
            <div className="mt-6"><KitProgress status={tr.status} dates={dates} /></div>

            {next && next !== "wait" && (
              <a href={next === "address" ? "#kit-address" : "#kit-samples"} className={`mt-6 flex items-center gap-3 rounded-2xl px-4 py-3.5 text-sm ${next === "done" ? "bg-[#E3F1EA] text-[#1F6B4F]" : "bg-ink-900 text-white"}`} data-testid="kit-next" data-next={next}>
                <i className={`text-lg ${next === "address" ? "ri-map-pin-line" : next === "decide" ? "ri-thumb-up-line" : "ri-check-double-line"}`} aria-hidden="true"></i>
                <span className="flex-1">
                  {next === "address"
                    ? t("المطلوب منك الآن: أكّد عنوان التسليم وموقعك على الخريطة.", "Your step now: confirm the delivery address and pin your location.")
                    : next === "decide"
                      ? t(`المطلوب منك الآن: حدّد المقبولة والمرفوضة من ${num(sheet!.samples.length)} عينات.`, `Your step now: accept or reject each of the ${sheet!.samples.length} samples.`)
                      : t(`اكتمل تقييمك: ${num(totals!.accepted)} مقبولة و${num(totals!.rejected)} مرفوضة. نتواصل معك للخطوة التالية.`, `Rating complete: ${totals!.accepted} accepted, ${totals!.rejected} rejected. We'll be in touch for the next step.`)}
                </span>
                {next !== "done" && <i className="ri-arrow-down-line" aria-hidden="true"></i>}
              </a>
            )}

            {(tr.carrier || tr.trackingNo) && (
              <dl className="mt-6 grid grid-cols-2 gap-px bg-paper-200 rounded-2xl overflow-hidden text-start">
                <div className="bg-white p-4"><dt className="text-xs text-paper-500">{t("شركة الشحن", "Carrier")}</dt><dd className="mt-1 text-ink-900">{tr.carrier || "—"}</dd></div>
                <div className="bg-white p-4"><dt className="text-xs text-paper-500">{t("رقم التتبع", "Tracking number")}</dt><dd className="mt-1 text-ink-900 font-mono" dir="ltr" style={{ textAlign: "start" }}>{tr.trackingNo || "—"}</dd></div>
                {tr.city && <div className="bg-white p-4"><dt className="text-xs text-paper-500">{t("الوجهة", "Destination")}</dt><dd className="mt-1 text-ink-900">{tr.city}</dd></div>}
                {tr.trackingUrl && <div className="bg-white p-4"><dt className="text-xs text-paper-500">{t("عند شركة الشحن", "At the courier")}</dt><dd className="mt-1 text-ink-900 text-sm"><TrackingLink url={tr.trackingUrl} no="" carrier="" /></dd></div>}
              </dl>
            )}

            {sheet && (
              <>
                <div className="mt-8 scroll-mt-28" id="kit-address">
                  <h2 className="font-display text-lg text-ink-900 mb-3">{t("عنوان التسليم", "Delivery address")}</h2>
                  <ConfirmAddress key={sheet.addressConfirmedAt ?? "new"} sheet={sheet} onSubmit={saveAddress} saved={saved} />
                </div>
                <div className="mt-8 scroll-mt-28" id="kit-samples">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <h2 className="font-display text-lg text-ink-900">{t("العينات بأسمائها", "Samples by name")}</h2>
                    {sheet.samples.length > 0 && <Link to={sheetPath(sheet.ref, token, true)} className="inline-flex items-center gap-1 text-sm underline underline-offset-4 text-ink-900" data-testid="open-sheet"><i className="ri-printer-line" aria-hidden="true"></i>{t("ورقة العينات", "Sample sheet")}</Link>}
                  </div>
                  <SampleDecisions key={`${sheet.decidedAt ?? "new"}:${sheet.approvedSample ?? ""}`} sheet={sheet} onSubmit={decide} onApprove={approve} />
                </div>
              </>
            )}

            <div className="mt-8">
              <h2 className="text-sm text-paper-600 mb-3">{t("المسار", "Timeline")}</h2>
              <KitTimeline history={tr.history} />
            </div>

            <div className="mt-8 rounded-2xl bg-paper-50 border border-paper-200 p-5">
              {sheet ? (
                <p className="text-sm text-ink-900 leading-[1.8]">{sheet.decidedAt ? t("بعد تقييمك: نعتمد التركيبة المقبولة أو نرسل جولة معدّلة، ثم ننتقل للعبوة والتغليف والعقد.", "After your rating: we lock the accepted formula or send an adjusted round, then move to bottle, packaging and contract.") : t("كل عينة تحمل حرفها واسمها على العبوة وعلى الورقة المرفقة. قيّمها هنا بالاسم.", "Every vial carries its letter and name on the vial and on the enclosed sheet. Rate them here by name.")}</p>
              ) : (
                <>
                  <p className="text-sm text-ink-900">{t(`في العلبة ${num(kit.vials)} عينات (${num(kit.ml)} مل) مركّبة على إجاباتك.`, `Inside: ${kit.vials} vials (${kit.ml} ml) built from your answers.`)}</p>
                  <p className="mt-1 text-sm text-paper-600 leading-[1.8]">
                    {tr.status === "delivered"
                      ? t("جرّبها على بشرتك وعلى جمهورك عدة أيام، ثم احجز مكالمة المتابعة لنختار الاتجاه ونبدأ.", "Try them on skin and with your audience for a few days, then book the follow-up call to pick a direction and start.")
                      : t(`مدة الشحن: ${pick(kit.shipping)}.`, `Shipping: ${pick(kit.shipping)}.`)}
                  </p>
                  <p className="mt-2 text-xs text-paper-500">{t("لتأكيد العنوان وتقييم العينات بأسمائها: امسح رمز QR على الورقة المرفقة، أو افتح «عيناتي» من حسابك.", "To confirm the address and rate samples by name: scan the QR on the enclosed sheet, or open “My samples” in your account.")}</p>
                </>
              )}
              {sheet && <p className="mt-2 text-sm"><Link to="/learn/sample-feedback" className="underline underline-offset-4 text-ink-900"><i className="ri-graduation-cap-line" aria-hidden="true"></i> {t("كيف تكتب ملاحظة يفهمها العطّار", "How to write feedback a perfumer can act on")}</Link></p>}
              <div className="mt-4 flex flex-wrap gap-3">
                <Button to="/book" arrow={tr.status === "delivered"} variant={tr.status === "delivered" ? "primary" : "secondary"}>{t("احجز مكالمة المتابعة", "Book the follow-up call")}</Button>
                <Button to="/account/samples" variant="secondary">{t("افتح حسابك", "Open your account")}</Button>
              </div>
            </div>
          </section>
        )}

        {(state.status === "missing" || state.status === "error") && (
          <section className="mt-8 rounded-[1.75rem] bg-white border border-paper-200 p-6 md:p-8" role={state.status === "error" ? "alert" : undefined} data-testid="kit-missing">
            <p className="text-ink-900">
              {state.status === "error"
                ? t("تعذّر الاتصال. حدّث الصفحة بعد قليل.", "Couldn't connect. Refresh in a moment.")
                : clean
                  ? t("لا نجد شحنة بهذا الرقم. تأكد من رقم الطلب في رسالة التأكيد.", "No shipment with that number. Check the order number in your confirmation message.")
                  : t("أدخل رقم طلبك لعرض حالة الشحنة.", "Enter your order number to see the shipment status.")}
            </p>
            <form onSubmit={lookup} className="mt-5 flex flex-wrap gap-2">
              <label className="flex-1 min-w-48">
                <span className="sr-only">{t("رقم الطلب", "Order number")}</span>
                <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="KIT-7F3K9Q" dir="ltr" className="w-full rounded-full border border-paper-300 bg-white px-4 py-3 text-sm font-mono text-ink-900 focus:outline-none focus:border-ink-900" />
              </label>
              <button type="submit" className="rounded-full bg-ink-900 text-white px-5 py-3 text-sm hover:bg-ink-700">{t("عرض", "Show")}</button>
            </form>
            <p className="mt-4 text-xs text-paper-500">{t("أو سجّل الدخول ببريدك لترى كل شحناتك في حسابك.", "Or sign in with your email to see all your shipments in your account.")}</p>
          </section>
        )}
      </main>
      <FooterSection />
    </div>
  );
}
