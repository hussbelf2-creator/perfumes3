import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n/context";
import { projectsRepo, type ProjectsData } from "@/projects/repo";
import { usePActor } from "@/projects/useProjects";
import { CONTRACT_STATUSES, CONTRACT_STATUS_LABELS, type Contract } from "@/contracts/types";
import { ContractStatusBadge } from "@/contracts/components";
import { PAY_METHOD_LABELS, contractMoney, payable } from "@/contracts/finance";
import { MoneyBar, useMoney } from "@/contracts/finance-ui";
import { Card, Empty, PageTitle, Stat, Btn, download, fieldCls, inlineFieldCls, toCsv, useFormat } from "../components/ui";

// شاشة العقود: كل عقود المشاريع في مكان واحد بحالتها وقيمتها وما سُدِّد منها، والفواتير الصادرة عن دفعاتها.
// التحرير والتوقيع وتسجيل السداد في صفحة المشروع؛ هنا المتابعة والتحصيل.

export default function Contracts() {
  const { t, pick, num } = useI18n();
  const { can } = useAuth();
  const actor = usePActor();
  const f = useFormat();
  const money = useMoney();
  const [data, setData] = useState<ProjectsData | null>(null);
  const [tab, setTab] = useState<"contracts" | "invoices">("contracts");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("live");
  const seesMoney = can("payments.view");

  const reload = useCallback(async () => {
    if (actor) setData(await projectsRepo.load(actor).catch(() => null));
  }, [actor]);
  useEffect(() => {
    void reload();
  }, [reload]);

  const rows = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    return data.contracts
      .map((c) => ({ c, p: data.projects.find((x) => x.id === c.projectId), m: contractMoney(c, data.contractPayments) }))
      .filter(({ c }) => (status === "all" ? true : status === "live" ? c.status !== "void" : status === "due" ? payable(c.status) : c.status === status))
      .filter(({ m, c }) => status !== "due" || (m.rows.length > 0 && !m.settled && c.status !== "void"))
      .filter(({ c, p }) => !needle || [c.ref, c.title, c.client.name, p?.title ?? "", p?.clientEmail ?? ""].some((v) => v.toLowerCase().includes(needle)));
  }, [data, q, status]);
  if (!data) return <div className="h-48 rounded-2xl shimmer bg-paper-100" />;

  const live = data.contracts.filter((c) => c.status !== "void");
  const awaiting = live.filter((c) => c.status === "sent" || c.status === "client_signed");
  const signed = live.filter((c) => payable(c.status));
  const contracted = signed.reduce((n, c) => n + c.total, 0);
  const collected = data.contractPayments.filter((p) => signed.some((c) => c.id === p.contractId)).reduce((n, p) => n + p.amount, 0);
  const contractOf = (id: string): Contract | undefined => data.contracts.find((c) => c.id === id);
  const invoices = [...data.contractPayments].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));

  return (
    <>
      <PageTitle
        title={t("العقود", "Contracts")}
        sub={t("كل عقد بقيمته وجدول دفعاته: من المسودة إلى التوقيع، ثم سداد كل دفعة وفاتورتها. افتح العقد لتحريره أو توقيعه أو تسجيل السداد.", "Every contract with its value and payment schedule: from draft to signature, then each installment and its invoice. Open a contract to edit, sign or record a payment.")}
        actions={
          seesMoney ? (
            <Btn variant="secondary" onClick={() => download(`invoices-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([["invoice_no", "issued_at", "contract", "client", "installment", "net", "vat", "total", "method", "ref", "paid_at"], ...invoices.map((p) => [p.invoiceNo, p.issuedAt, contractOf(p.contractId)?.ref ?? "", p.buyer.name, p.label, p.netAmount, p.vatAmount, p.amount, p.method, p.ref, p.paidAt])]))}>
              <i className="ri-download-2-line" aria-hidden="true"></i>
              {t("تصدير الفواتير CSV", "Export invoices CSV")}
            </Btn>
          ) : undefined
        }
      />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4 mb-4">
        <Stat icon="ri-quill-pen-line" label={t("بانتظار توقيع", "Awaiting a signature")} value={num(awaiting.length)} tone={awaiting.length ? "warn" : "plain"} hint={awaiting.length ? t("من العميل أو من المنشأة", "From the client or the company") : undefined} />
        <Stat icon="ri-file-check-line" label={t("وقّعها العميل", "Signed by the client")} value={num(signed.length)} tone="good" hint={t("يُسجَّل عليها السداد", "Payments can be recorded")} />
        <Stat icon="ri-money-dollar-circle-line" label={t("قيمة ما وقّعه العملاء", "Client-signed value")} value={seesMoney ? money(contracted) : "—"} />
        <Stat icon="ri-hand-coin-line" label={t("المتبقي للتحصيل", "Outstanding")} value={seesMoney ? money(Math.max(0, contracted - collected)) : "—"} hint={seesMoney && contracted > 0 ? t(`حُصِّل ${money(collected)}`, `Collected ${money(collected)}`) : undefined} tone={contracted - collected > 0 ? "warn" : "plain"} />
      </div>

      <div className="mb-3 inline-flex rounded-full border border-paper-300 bg-white p-0.5" role="tablist" aria-label={t("العرض", "View")}>
        {(["contracts", "invoices"] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-full px-4 py-1.5 text-sm ${tab === k ? "bg-ink-900 text-white" : "text-ink-900"}`} data-testid={`tab-${k}`}>
            {k === "contracts" ? t(`العقود (${num(live.length)})`, `Contracts (${live.length})`) : t(`الفواتير (${num(invoices.length)})`, `Invoices (${invoices.length})`)}
          </button>
        ))}
      </div>

      {tab === "contracts" ? (
        <Card>
          <div className="p-4 border-b border-paper-100 flex flex-wrap items-center gap-3">
            <label className="relative flex-1 min-w-48">
              <i className="ri-search-line absolute top-1/2 -translate-y-1/2 start-3 text-paper-400" aria-hidden="true"></i>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("رقم العقد، العميل، المشروع…", "Contract no., client, project…")} aria-label={t("بحث", "Search")} className={`${fieldCls} ps-9`} />
            </label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={inlineFieldCls} aria-label={t("الحالة", "Status")}>
              <option value="live">{t("كل العقود السارية", "All live contracts")}</option>
              <option value="due">{t("عليها دفعات لم تُسدَّد", "With unpaid installments")}</option>
              {CONTRACT_STATUSES.map((s) => <option key={s} value={s}>{pick(CONTRACT_STATUS_LABELS[s])}</option>)}
              <option value="all">{t("الكل مع الملغاة", "All incl. void")}</option>
            </select>
          </div>
          {rows.length === 0 ? (
            <Empty icon="ri-file-text-line" title={t("لا عقود هنا", "No contracts here")} hint={t("أنشئ العقد من صفحة المشروع: يُملأ من عرض السعر بقيمته وجدول دفعاته، أو ارفع عقدًا جاهزًا.", "Create the contract from the project page: it's pre-filled from the quote with its value and schedule, or upload a ready one.")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="contracts-table">
                <thead>
                  <tr className="text-xs text-paper-500 border-b border-paper-100">
                    <th scope="col" className="text-start font-normal px-5 py-3">{t("العقد", "Contract")}</th>
                    <th scope="col" className="text-start font-normal px-3 py-3 hidden md:table-cell">{t("العميل والمشروع", "Client & project")}</th>
                    <th scope="col" className="text-start font-normal px-3 py-3">{t("الحالة", "Status")}</th>
                    <th scope="col" className="text-end font-normal px-3 py-3 hidden sm:table-cell">{t("القيمة", "Value")}</th>
                    <th scope="col" className="text-start font-normal px-3 py-3 hidden lg:table-cell w-44">{t("السداد", "Payment")}</th>
                    <th scope="col" className="text-start font-normal px-5 py-3 hidden xl:table-cell">{t("الدفعة التالية", "Next installment")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-paper-100">
                  {rows.map(({ c, p, m }) => (
                    <tr key={c.id} className="hover:bg-paper-50" data-testid="contract-row" data-ref={c.ref}>
                      <td className="px-5 py-3">
                        <Link to={`/admin/projects/${c.projectId}#pj-contract`} className="font-mono text-ink-900 hover:underline underline-offset-4" dir="ltr">{c.ref}</Link>
                        <span className="block text-xs text-paper-500 max-w-[16rem] truncate">{c.title}</span>
                        {c.file && <span className="inline-flex items-center gap-1 text-[11px] text-paper-500"><i className="ri-attachment-2" aria-hidden="true"></i>{t("ملف مرفوع", "Uploaded file")}</span>}
                      </td>
                      <td className="px-3 py-3 hidden md:table-cell">
                        <span className="block text-ink-900">{c.client.name || p?.clientEmail || "—"}</span>
                        <span className="block text-xs text-paper-500">{p?.title}</span>
                      </td>
                      <td className="px-3 py-3"><ContractStatusBadge c={c} /></td>
                      <td className="px-3 py-3 text-end hidden sm:table-cell whitespace-nowrap">{seesMoney && c.total > 0 ? money(c.total) : "—"}</td>
                      <td className="px-3 py-3 hidden lg:table-cell">{seesMoney && m.rows.length > 0 ? <MoneyBar paid={m.paid} total={m.total} /> : <span className="text-xs text-paper-400">{t("بلا جدول دفعات", "No schedule")}</span>}</td>
                      <td className="px-5 py-3 hidden xl:table-cell text-xs text-paper-600">
                        {m.settled ? <span className="text-[#1F6B4F]">{t("سُدِّد كاملًا", "Fully paid")}</span> : m.next ? <>{m.next.inst.label}{seesMoney && <span className="block text-ink-900">{money(m.next.amount)}{m.next.inst.due ? ` · ${m.next.inst.due}` : ""}</span>}</> : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <Card>
          {!seesMoney ? (
            <Empty icon="ri-lock-line" title={t("الفواتير لمن يملك صلاحية المدفوعات", "Invoices need the payments permission")} />
          ) : invoices.length === 0 ? (
            <Empty icon="ri-bill-line" title={t("لا فواتير بعد", "No invoices yet")} hint={t("تصدر الفاتورة تلقائيًا حين تسجّل سداد دفعة من عقد موقّع.", "An invoice is issued automatically when you record an installment on a signed contract.")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="invoices-table">
                <thead>
                  <tr className="text-xs text-paper-500 border-b border-paper-100">
                    <th scope="col" className="text-start font-normal px-5 py-3">{t("الفاتورة", "Invoice")}</th>
                    <th scope="col" className="text-start font-normal px-3 py-3">{t("العميل", "Client")}</th>
                    <th scope="col" className="text-start font-normal px-3 py-3 hidden md:table-cell">{t("الدفعة", "Installment")}</th>
                    <th scope="col" className="text-start font-normal px-3 py-3 hidden lg:table-cell">{t("الطريقة", "Method")}</th>
                    <th scope="col" className="text-end font-normal px-3 py-3 hidden sm:table-cell">{t("الضريبة", "VAT")}</th>
                    <th scope="col" className="text-end font-normal px-5 py-3">{t("الإجمالي", "Total")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-paper-100">
                  {invoices.map((p) => (
                    <tr key={p.id} className="hover:bg-paper-50" data-testid="invoice-row">
                      <td className="px-5 py-3">
                        <Link to={`/invoice/${p.id}`} target="_blank" className="font-mono text-ink-900 hover:underline underline-offset-4" dir="ltr">{p.invoiceNo}</Link>
                        <span className="block text-xs text-paper-500">{f.date(p.issuedAt)}</span>
                      </td>
                      <td className="px-3 py-3 text-ink-900">{p.buyer.name || "—"}</td>
                      <td className="px-3 py-3 hidden md:table-cell text-paper-600">{p.label} <span className="font-mono text-xs" dir="ltr">· {contractOf(p.contractId)?.ref}</span></td>
                      <td className="px-3 py-3 hidden lg:table-cell text-paper-600">{pick(PAY_METHOD_LABELS[p.method])}{p.ref && <span className="block text-xs font-mono" dir="ltr" style={{ textAlign: "start" }}>{p.ref}</span>}</td>
                      <td className="px-3 py-3 text-end hidden sm:table-cell text-paper-600 whitespace-nowrap">{money(p.vatAmount)}</td>
                      <td className="px-5 py-3 text-end text-ink-900 whitespace-nowrap">{money(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </>
  );
}
