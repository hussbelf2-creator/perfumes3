import { useRef, useState } from "react";
import { useI18n } from "@/i18n/context";
import { useContent } from "@/cms/ContentProvider";
import { SITE } from "@/config/site";
import { techPackGroups, type TechPackInput } from "./techpack";

export { techPackGroups, type TechPackInput };

// ورقة المواصفات الفنية: الحوار، النسخ، وتنزيل PDF (تُرسم كصورة فلا تتأثر بالخطوط العربية في jsPDF).

export default function TechPack({ input, onClose }: { input: TechPackInput; onClose: () => void }) {
  const { t, pick, num, date } = useI18n();
  const pricing = useContent("pricing");
  const site = useContent("site");
  const { groups, totals } = techPackGroups(input, pick, t, num, pricing.box, pricing.calc.tiers);
  const sheet = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<"" | "pdf" | "copy">("");
  const [note, setNote] = useState("");
  const ref = `TP-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${(input.bottle?.id ?? "X").slice(0, 6).toUpperCase()}`;

  const asText = () => [`${t("ورقة المواصفات", "Tech pack")} ${ref}`, ...groups.flatMap((g) => [``, `## ${g.title}`, ...g.rows.map((r) => `${r.k}: ${r.v}`)]), ``, `## ${t("التقدير", "Estimate")}`, ...totals.map((r) => `${r.k}: ${r.v}`)].join("\n");

  const copy = async () => {
    setBusy("copy");
    try {
      await navigator.clipboard.writeText(asText());
      setNote(t("نُسخت المواصفات", "Copied"));
    } catch {
      setNote(t("تعذّر النسخ — حدّد النص وانسخه", "Couldn't copy — select the text and copy"));
    } finally {
      setBusy("");
    }
  };

  const pdf = async () => {
    if (!sheet.current) return;
    setBusy("pdf");
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
      const canvas = await html2canvas(sheet.current, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
      const w = 190, pageH = 277;
      const h = (canvas.height * w) / canvas.width;
      // صفحات متعددة إن طالت الورقة
      let y = 0;
      while (y < h) {
        if (y > 0) doc.addPage();
        doc.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 10, 10 - y, w, h);
        y += pageH;
      }
      doc.save(`${ref}.pdf`);
      setNote(t("نُزّل ملف PDF", "PDF downloaded"));
    } catch {
      setNote(t("تعذّر إنشاء PDF — انسخ النص بدلاً منه", "Couldn't build the PDF — copy the text instead"));
    } finally {
      setBusy("");
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="tp-title" className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-6" onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <button type="button" aria-label={t("إغلاق", "Close")} onClick={onClose} className="absolute inset-0 bg-ink-900/60 backdrop-blur-sm" />
      <div className="relative w-full sm:max-w-3xl max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-paper-50 shadow-2xl panel-in">
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-paper-200 bg-paper-50/95 backdrop-blur px-5 py-3">
          <h2 id="tp-title" className="font-display text-lg text-ink-900 me-auto">{t("ورقة المواصفات الفنية", "Technical spec sheet")}</h2>
          <button type="button" onClick={copy} disabled={busy !== ""} className="rounded-full border border-paper-300 bg-white px-4 py-2 text-sm text-ink-900 inline-flex items-center gap-2 disabled:opacity-50"><i className="ri-file-copy-line" aria-hidden="true"></i>{t("نسخ النص", "Copy text")}</button>
          <button type="button" onClick={pdf} disabled={busy !== ""} className="rounded-full bg-ink-900 text-white px-4 py-2 text-sm inline-flex items-center gap-2 disabled:opacity-50" data-testid="techpack-pdf"><i className="ri-file-pdf-2-line" aria-hidden="true"></i>{busy === "pdf" ? t("جاري التجهيز…", "Preparing…") : t("تنزيل PDF", "Download PDF")}</button>
          <button type="button" onClick={onClose} className="w-9 h-9 rounded-full hover:bg-paper-200 text-ink-900" aria-label={t("إغلاق", "Close")}><i className="ri-close-line text-xl" aria-hidden="true"></i></button>
        </div>
        {note && <p role="status" className="px-5 pt-3 text-xs text-accent3-ink">{note}</p>}
        <div ref={sheet} className="bg-white m-4 sm:m-6 rounded-2xl border border-paper-200 p-6 text-ink-900" data-testid="techpack">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-paper-200 pb-4">
            <div>
              <p className="label-mono">{ref}</p>
              <h3 className="mt-1 font-display text-2xl">{t("مواصفات التغليف", "Packaging specification")}</h3>
              <p className="mt-1 text-sm text-paper-600">{site.billing.legalName || pick(SITE.name)} · {date(new Date(), { day: "numeric", month: "long", year: "numeric" })}</p>
            </div>
            {input.thumb && <img src={input.thumb} alt="" className="w-28 h-28 object-contain rounded-xl bg-[#F3F1EC]" />}
          </div>
          <div className="mt-4 grid sm:grid-cols-2 gap-x-8 gap-y-5">
            {groups.map((g) => (
              <section key={g.title}>
                <h4 className="text-sm font-medium text-ink-900 mb-2 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-accent2" aria-hidden="true" />{g.title}</h4>
                <dl className="text-xs divide-y divide-paper-100">
                  {g.rows.map((r) => (
                    <div key={r.k} className="grid grid-cols-[7.5rem_1fr] gap-2 py-1.5">
                      <dt className="text-paper-500">{r.k}</dt>
                      <dd className="text-ink-900 break-words">{r.v}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
          <section className="mt-5 rounded-xl bg-paper-50 border border-paper-200 p-4">
            <h4 className="text-sm font-medium text-ink-900 mb-2">{t("التقدير (قبل الضريبة والشحن)", "Estimate (before VAT and shipping)")}</h4>
            <dl className="text-xs grid sm:grid-cols-2 gap-x-8">
              {totals.map((r, idx) => (
                <div key={r.k} className={`flex justify-between gap-3 py-1.5 border-b border-paper-100 ${idx === totals.length - 1 ? "sm:col-span-2 font-medium text-sm border-0 pt-2" : ""}`}>
                  <dt className="text-paper-600">{r.k}</dt>
                  <dd className="font-mono text-ink-900" dir="ltr">{r.v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-[11px] text-paper-500 leading-[1.6]">{t("الأرقام تقديرية للتخطيط من أسعار المنصة؛ العرض الرسمي بعد مراجعة الملفات والعينة. القوالب والكليشات ملك العميل بعد سدادها.", "Planning figures from platform rates; the formal quote follows file and sample review. Dies and tooling belong to the client once paid.")}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
