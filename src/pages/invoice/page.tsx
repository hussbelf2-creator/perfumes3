import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useI18n } from "@/i18n/context";
import { useContent } from "@/cms/ContentProvider";
import { projectsRepo, type ProjectsData } from "@/projects/repo";
import { usePActor } from "@/projects/useProjects";
import { proformaInvoice, taxInvoice } from "@/contracts/invoice";
import { InvoiceDoc } from "@/contracts/finance-ui";

// الفاتورة للطباعة أو الحفظ PDF: ضريبية لدفعة مسددة (/invoice/:id) أو مطالبة بدفعة مستحقة (/invoice/due/:contractId/:installmentId).
// لمن يرى المشروع فقط: العميل صاحب المشروع، والفريق الذي يرى المدفوعات.
export default function InvoicePage() {
  const { id, contractId, installmentId } = useParams();
  const { t } = useI18n();
  const actor = usePActor();
  const site = useContent("site");
  const [data, setData] = useState<ProjectsData | null | undefined>();
  useEffect(() => {
    if (!actor) return;
    void projectsRepo
      .load(actor)
      .then(setData)
      .catch(() => setData(null));
  }, [actor]);

  const view = useMemo(() => {
    if (!data) return null;
    if (id) {
      const p = data.contractPayments.find((x) => x.id === id);
      const c = p && data.contracts.find((x) => x.id === p.contractId);
      return p && c ? { v: taxInvoice(p, c, data.contractPayments), projectId: c.projectId } : null;
    }
    const c = data.contracts.find((x) => x.id === contractId);
    if (!c || !installmentId) return null;
    // دفعة سُدِّدت؟ نعرض فاتورتها الضريبية بدل المطالبة
    const paid = data.contractPayments.find((x) => x.contractId === c.id && x.installmentId === installmentId);
    if (paid) return { v: taxInvoice(paid, c, data.contractPayments), projectId: c.projectId };
    const v = proformaInvoice(c, installmentId, data.contractPayments, site);
    return v ? { v, projectId: c.projectId } : null;
  }, [data, id, contractId, installmentId, site]);
  useEffect(() => {
    if (view) document.title = `${view.v.number} · ${view.v.contractRef}`;
  }, [view]);

  return (
    <div className="min-h-screen bg-paper-50 print:bg-white">
      <div className="max-w-4xl mx-auto px-4 py-6 print:p-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link to={actor?.role === "client" ? "/account/invoices" : view ? `/admin/projects/${view.projectId}` : "/admin/contracts"} className="text-sm text-paper-600 underline underline-offset-4">{t("رجوع", "Back")}</Link>
          {view && (
            <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-full bg-ink-900 text-white px-5 py-2.5 text-sm" data-testid="invoice-print">
              <i className="ri-printer-line" aria-hidden="true"></i>{t("اطبع أو احفظ PDF", "Print or save as PDF")}
            </button>
          )}
        </div>
        {data === undefined ? (
          <div className="h-64 rounded-2xl shimmer bg-paper-100" />
        ) : !view ? (
          <p className="rounded-2xl bg-white border border-paper-200 p-8 text-center text-paper-600" data-testid="invoice-missing">{t("لم نجد هذه الفاتورة في حسابك.", "This invoice isn't in your account.")}</p>
        ) : (
          <InvoiceDoc v={view.v} />
        )}
      </div>
    </div>
  );
}
