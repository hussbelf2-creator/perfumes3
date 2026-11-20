import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useI18n } from "@/i18n/context";
import { useContent } from "@/cms/ContentProvider";
import { absoluteUrl } from "@/lib/links";
import { kitsRepo } from "@/kits/repo";
import { KIT_REF_RE, sheetPath, type KitSheet } from "@/kits/types";
import { SheetDoc } from "@/kits/ClientSheet";

// ورقة العينات للطباعة: تُرفق مع الشحنة. رمز QR عليها يفتح صفحة العميل برمزها لاستكمال الإجراءات.
export default function KitSheetPage() {
  const { ref = "" } = useParams();
  const [params] = useSearchParams();
  const { t } = useI18n();
  const site = useContent("site");
  const token = (params.get("k") ?? "").trim();
  const clean = ref.trim().toUpperCase();
  const [sheet, setSheet] = useState<KitSheet | null | undefined>();

  useEffect(() => {
    if (!KIT_REF_RE.test(clean) || !token) {
      setSheet(null);
      return;
    }
    let live = true;
    kitsRepo
      .sheet(clean, token)
      .then((s) => live && setSheet(s))
      .catch(() => live && setSheet(null));
    return () => {
      live = false;
    };
  }, [clean, token]);
  useEffect(() => {
    if (sheet) document.title = `${sheet.ref} · ${t("ورقة العينات", "Sample sheet")}`;
  }, [sheet, t]);

  return (
    <div className="min-h-screen bg-paper-50 print:bg-white">
      <div className="max-w-4xl mx-auto px-4 py-6 print:p-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link to={sheetPath(clean, token)} className="text-sm text-paper-600 underline underline-offset-4">{t("رجوع لصفحة العينات", "Back to the samples page")}</Link>
          {sheet && (
            <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-full bg-ink-900 text-white px-5 py-2.5 text-sm" data-testid="sheet-print">
              <i className="ri-printer-line" aria-hidden="true"></i>{t("اطبع أو احفظ PDF", "Print or save as PDF")}
            </button>
          )}
        </div>
        {sheet === undefined ? (
          <div className="h-64 rounded-2xl shimmer bg-paper-100" />
        ) : sheet === null ? (
          <p className="rounded-2xl bg-white border border-paper-200 p-8 text-center text-paper-600" data-testid="sheet-missing">{t("الرابط غير صالح. امسح رمز QR من الورقة المرفقة أو افتح «عيناتي» من حسابك.", "This link isn't valid. Scan the QR on the enclosed sheet or open “My samples” in your account.")}</p>
        ) : (
          <SheetDoc sheet={sheet} url={absoluteUrl(sheetPath(sheet.ref, token))} company={{ legalName: site.billing.legalName, phone: site.phone, email: site.email }} />
        )}
      </div>
    </div>
  );
}
