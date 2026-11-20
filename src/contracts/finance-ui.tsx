import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "@/i18n/context";
import { QrCode } from "@/lib/QrCode";
import { storeProjectFile } from "@/creatives/images";
import type { Contract, ContractDraft } from "./types";
import type { InvoiceView } from "./invoice";
import { PAY_METHODS, PAY_METHOD_LABELS, SCHEDULE_LIMITS, SCHEDULE_PRESETS, contractMoney, depositMismatch, expectedDeposit, installmentAmounts, matchDeposit, newInstallment, payable, percentTotal, presetRows, round2, vatSplit, zatcaTimestamp, zatcaTlv, type ContractPayment, type DepositQuote, type Installment, type PayMethod, type ScheduleRow } from "./finance";

// واجهات العقد المالي: محرّر القيمة وجدول الدفعات، عرض الجدول بسداده، نموذج «تسجيل السداد»، والفاتورة الضريبية.

const field = "w-full rounded-lg border border-paper-300 bg-white px-3 py-2 text-sm text-ink-900 focus:outline-none focus:border-ink-900";

export function useMoney() {
  const { num, t } = useI18n();
  return (n: number) => `${num(n, 2)} ${t("ر.س", "SAR")}`;
}

/** القيمة وجدول الدفعات وملف العقد المرفوع (في محرّر العقد) */
export function FinanceEditor({ v, set, quote = null }: { v: ContractDraft; set: (d: ContractDraft) => void; /** عرض السعر المربوط: عربونه هو الدفعة الأولى */ quote?: DepositQuote | null }) {
  const { t, pick, num } = useI18n();
  const money = useMoney();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const amounts = installmentAmounts(v.total, v.schedule);
  const sum = percentTotal(v.schedule);
  const { net, vat } = vatSplit(v.total, v.vatRate);
  const patch = (i: number, p: Partial<Installment>) => set({ ...v, schedule: v.schedule.map((r, k) => (k === i ? { ...r, ...p } : r)) });
  const deposit = expectedDeposit(quote);
  const mismatch = depositMismatch(v.total, v.schedule, quote);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setErr("");
    try {
      const path = await storeProjectFile(file, v.projectId);
      set({ ...v, file: path, fileName: file.name.slice(0, 160) });
    } catch {
      setErr(t("تعذّر رفع الملف. المقبول: PDF أو صورة حتى 15 م.ب.", "Couldn't upload. Accepted: PDF or image up to 15 MB."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-labelledby="ce-finance" className="rounded-xl border border-paper-200 bg-paper-50 p-4 space-y-4" data-testid="finance-editor">
      <div>
        <h3 id="ce-finance" className="text-sm text-ink-900">{t("قيمة العقد وجدول الدفعات", "Contract value & payment schedule")}</h3>
        <p className="text-xs text-paper-500 mt-0.5">{t("يوقّع الطرفان على القيمة والجدول. بعد التوقيع تسجّل سداد كل دفعة فتصدر فاتورتها تلقائيًا.", "Both parties sign the value and schedule. After signing, record each payment and its invoice is issued automatically.")}</p>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <label className="block">
          <span className="block text-xs text-paper-500 mb-1">{t("القيمة شاملة الضريبة (ر.س)", "Value incl. VAT (SAR)")}</span>
          <input type="number" min={0} step="0.01" value={v.total || ""} onChange={(e) => {
            const total = Math.max(0, round2(Number(e.target.value) || 0));
            // أول قيمة تُكتب بلا جدول: نقترح 50٪ مقدم و50٪ قبل التسليم
            set({ ...v, total, schedule: total > 0 && v.schedule.length === 0 ? presetRows("50-50") : v.schedule });
          }} dir="ltr" className={field} data-testid="contract-total" />
        </label>
        <label className="block">
          <span className="block text-xs text-paper-500 mb-1">{t("نسبة الضريبة ٪", "VAT rate %")}</span>
          <input type="number" min={0} max={100} step="0.5" value={v.vatRate} onChange={(e) => set({ ...v, vatRate: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} dir="ltr" className={field} />
        </label>
        <label className="block">
          <span className="block text-xs text-paper-500 mb-1">{t("جدول جاهز", "Preset schedule")}</span>
          <select value="" onChange={(e) => e.target.value && set({ ...v, schedule: presetRows(e.target.value) })} className={field} data-testid="schedule-preset">
            <option value="">{t("اختر لتعبئة الجدول", "Choose to fill the schedule")}</option>
            {SCHEDULE_PRESETS.map((p) => <option key={p.id} value={p.id}>{pick(p.name)}</option>)}
          </select>
        </label>
      </div>
      {v.total > 0 && <p className="text-xs text-paper-600">{t(`قبل الضريبة ${money(net)} · الضريبة ${money(vat)}`, `Net ${money(net)} · VAT ${money(vat)}`)}</p>}

      <ol className="space-y-2">
        {v.schedule.map((r, i) => (
          <li key={r.id} className="rounded-lg border border-paper-200 bg-white p-2.5 grid grid-cols-12 gap-2 items-center" data-testid="schedule-row">
            <span className="col-span-1 text-center font-mono text-xs text-paper-400">{num(i + 1)}</span>
            <input value={r.label} maxLength={SCHEDULE_LIMITS.label} onChange={(e) => patch(i, { label: e.target.value })} placeholder={t("اسم الدفعة", "Installment name")} aria-label={t(`اسم الدفعة ${num(i + 1)}`, `Installment ${i + 1} name`)} className={`${field} col-span-11 sm:col-span-4`} />
            <div className="col-span-4 sm:col-span-2 relative">
              <input type="number" min={0} max={100} step="0.01" value={r.percent || ""} onChange={(e) => patch(i, { percent: Math.min(100, Math.max(0, round2(Number(e.target.value) || 0))) })} dir="ltr" aria-label={t(`نسبة الدفعة ${num(i + 1)}`, `Installment ${i + 1} percent`)} className={`${field} pe-7`} data-testid="schedule-percent" />
              <span className="absolute inset-y-0 end-2.5 flex items-center text-xs text-paper-500" aria-hidden="true">٪</span>
            </div>
            <input value={r.due} maxLength={SCHEDULE_LIMITS.due} onChange={(e) => patch(i, { due: e.target.value })} placeholder={t("الاستحقاق: عند التوقيع", "Due: on signing")} aria-label={t(`استحقاق الدفعة ${num(i + 1)}`, `Installment ${i + 1} due`)} className={`${field} col-span-8 sm:col-span-3`} />
            <label className="col-span-12 sm:col-start-2 sm:col-span-5 flex items-center gap-2 text-xs text-paper-500">
              {t("تاريخ الاستحقاق (اختياري، للتذكير الآلي)", "Due date (optional, for automatic reminders)")}
              <input type="date" value={r.dueDate ?? ""} onChange={(e) => patch(i, { dueDate: e.target.value || undefined })} className={`${field} !w-auto !py-1`} aria-label={t(`تاريخ استحقاق الدفعة ${num(i + 1)}`, `Installment ${i + 1} due date`)} data-testid="schedule-due-date" />
            </label>
            <span className="col-span-9 sm:col-span-1 text-xs text-ink-900 whitespace-nowrap sm:text-end" dir="ltr">{v.total > 0 ? num(amounts[i] ?? 0, 2) : "—"}</span>
            <button type="button" onClick={() => set({ ...v, schedule: v.schedule.filter((_, k) => k !== i) })} className="col-span-3 sm:col-span-1 justify-self-end w-8 h-8 rounded-full hover:bg-red-50 text-red-700" aria-label={t(`احذف الدفعة ${num(i + 1)}`, `Delete installment ${i + 1}`)}><i className="ri-delete-bin-line" aria-hidden="true"></i></button>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" disabled={v.schedule.length >= SCHEDULE_LIMITS.rows} onClick={() => set({ ...v, schedule: [...v.schedule, newInstallment(Math.max(0, round2(100 - sum)))] })} className="inline-flex items-center gap-2 rounded-full border border-paper-300 bg-white px-4 py-2 text-sm hover:border-ink-900 disabled:opacity-40" data-testid="schedule-add">
          <i className="ri-add-line" aria-hidden="true"></i>{t("دفعة جديدة", "New installment")}
        </button>
        {v.schedule.length > 0 && <p className={`text-sm ${sum === 100 ? "text-[#1F6B4F]" : "text-red-700"}`} role="status" data-testid="schedule-sum">{t(`مجموع النسب ${num(sum, sum % 1 ? 2 : 0)}٪`, `Total ${sum}%`)}{sum !== 100 && t(" · يجب أن يساوي 100٪ قبل الإرسال", " · must equal 100% before sending")}</p>}
      </div>

      {quote && deposit != null && (
        <div className={`rounded-lg border px-3 py-2.5 text-sm flex flex-wrap items-center justify-between gap-2 ${mismatch ? "border-red-300 bg-red-50 text-red-800" : "border-[#BFE0D0] bg-[#F4FAF7] text-[#1F6B4F]"}`} role="status" data-testid="deposit-link" data-mismatch={mismatch ? "1" : "0"}>
          <span>
            <i className={mismatch ? "ri-error-warning-line" : "ri-links-line"} aria-hidden="true"></i>{" "}
            {mismatch
              ? t(`الدفعة الأولى ${money(mismatch.first)} لا تساوي عربون العرض ${quote.ref} (${money(mismatch.expected)}${quote.status === "paid" ? "، مدفوع" : ""}). العربون هو الدفعة الأولى، ولا يُرسل العقد قبل المطابقة.`, `The first installment ${money(mismatch.first)} doesn't equal the deposit of quote ${quote.ref} (${money(mismatch.expected)}${quote.status === "paid" ? ", paid" : ""}). The deposit is the first installment; match them before sending.`)
              : quote.status === "paid"
                ? t(`عربون العرض ${quote.ref} مدفوع (${money(deposit)}): يسدّد الدفعة الأولى تلقائيًا عند توقيع العميل وتصدر فاتورتها.`, `The deposit of quote ${quote.ref} is paid (${money(deposit)}): it settles the first installment automatically when the client signs, and its invoice is issued.`)
                : t(`الدفعة الأولى هي عربون العرض ${quote.ref} (${money(deposit)}): أيهما سُدِّد أولًا يسدّد الآخر، فلا يُطالَب العميل مرتين.`, `The first installment is the deposit of quote ${quote.ref} (${money(deposit)}): paying either settles both, so the client is never asked twice.`)}
          </span>
          {mismatch && <button type="button" onClick={() => set({ ...v, schedule: matchDeposit(v.total, v.schedule, mismatch.expected) })} className="rounded-full bg-ink-900 text-white px-4 py-1.5 text-sm hover:bg-ink-700" data-testid="deposit-match">{t("طابق العربون", "Match the deposit")}</button>}
        </div>
      )}

      <div className="border-t border-paper-200 pt-3">
        <p className="text-sm text-ink-900">{t("أو ارفع عقدًا جاهزًا", "Or upload a ready contract")}</p>
        <p className="text-xs text-paper-500 mt-0.5">{t("ملف PDF أو صورة لعقد كتبته خارج المنصة. يوقّعه الطرفان هنا إلكترونيًا، ويمكن إرفاقه مع البنود أو بدلها.", "A PDF or image of a contract drafted elsewhere. Both parties e-sign it here; attach it alongside the clauses or instead of them.")}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
          <label className="inline-flex items-center gap-2 rounded-full border border-paper-300 bg-white px-4 py-2 cursor-pointer hover:border-ink-900">
            <i className={busy ? "ri-loader-4-line animate-spin" : "ri-upload-2-line"} aria-hidden="true"></i>
            {v.file ? t("استبدل الملف", "Replace file") : t("ارفع ملف العقد", "Upload contract file")}
            <input type="file" accept="application/pdf,image/*" className="sr-only" disabled={busy} onChange={(e) => void upload(e.target.files?.[0])} data-testid="contract-file-input" />
          </label>
          {v.file && (
            <span className="inline-flex items-center gap-2 text-ink-900" data-testid="contract-file-name">
              <i className="ri-file-pdf-2-line" aria-hidden="true"></i>{v.fileName || t("ملف العقد", "Contract file")}
              <button type="button" onClick={() => set({ ...v, file: null, fileName: null })} className="text-red-700 underline underline-offset-4 text-xs">{t("أزل", "Remove")}</button>
            </span>
          )}
        </div>
        {err && <p role="alert" className="mt-2 text-xs text-red-700">{err}</p>}
      </div>
    </section>
  );
}

/** شريط الموقف المالي: المدفوع من الإجمالي */
export function MoneyBar({ paid, total }: { paid: number; total: number }) {
  const { t, num } = useI18n();
  const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  return (
    <div data-testid="money-bar" data-pct={pct}>
      <div className="h-2 rounded-full bg-paper-200 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t("نسبة المسدَّد", "Paid share")}>
        <div className="h-full bg-[#1F6B4F] rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-paper-600">{t(`سُدِّد ${num(pct)}٪`, `${pct}% paid`)}</p>
    </div>
  );
}

/** جدول الدفعات كما يراه الطرفان: مبلغ كل دفعة، استحقاقها، سدادها وفاتورتها */
export function ScheduleTable({ c, payments, action, quote = null }: { c: Pick<Contract, "id" | "total" | "vatRate" | "schedule" | "status">; payments: ContractPayment[]; action?: (row: ScheduleRow) => ReactNode; quote?: DepositQuote | null }) {
  const { t, num, date } = useI18n();
  const money = useMoney();
  const m = contractMoney(c, payments);
  if (!c.schedule.length && !(c.total > 0)) return null;
  return (
    <section className="mt-8 break-inside-avoid" aria-labelledby={`ct-pay-${c.id}`} data-testid="contract-schedule">
      <h3 id={`ct-pay-${c.id}`} className="font-display text-xl">{t("القيمة وجدول الدفعات", "Value & payment schedule")}</h3>
      <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-px bg-paper-200 rounded-xl overflow-hidden text-sm">
        <div className="bg-white p-3"><dt className="text-xs text-paper-500">{t("قيمة العقد", "Contract value")}</dt><dd className="mt-0.5 text-ink-900" data-testid="contract-value">{money(m.total)}</dd></div>
        <div className="bg-white p-3"><dt className="text-xs text-paper-500">{t(`منها ضريبة ${num(c.vatRate, c.vatRate % 1 ? 2 : 0)}٪`, `Incl. VAT ${c.vatRate}%`)}</dt><dd className="mt-0.5 text-ink-900">{money(m.vat)}</dd></div>
        <div className="bg-white p-3"><dt className="text-xs text-paper-500">{t("المسدَّد", "Paid")}</dt><dd className="mt-0.5 text-[#1F6B4F]" data-testid="contract-paid">{money(m.paid)}</dd></div>
        <div className="bg-white p-3"><dt className="text-xs text-paper-500">{t("المتبقي", "Remaining")}</dt><dd className="mt-0.5 text-ink-900" data-testid="contract-remaining">{money(m.remaining)}</dd></div>
      </dl>
      {m.rows.length > 0 && (
        <>
          <div className="mt-3 print:hidden"><MoneyBar paid={m.paid} total={m.total} /></div>
          <ol className="mt-3 space-y-2">
            {m.rows.map((r) => (
              <li key={r.inst.id} className={`rounded-xl border p-3.5 ${r.payment ? "border-[#BFE0D0] bg-[#F4FAF7]" : m.next?.inst.id === r.inst.id && payable(c.status) ? "border-ink-900 bg-white" : "border-paper-200 bg-white"}`} data-testid="installment" data-paid={r.payment ? "1" : "0"}>
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                  <div className="min-w-0">
                    <p className="text-ink-900" dir="auto">{num(r.index + 1)}. {r.inst.label} <span className="text-paper-500 text-sm">· {num(r.inst.percent, r.inst.percent % 1 ? 2 : 0)}٪</span></p>
                    {r.inst.due && <p className="text-xs text-paper-600 mt-0.5" dir="auto">{t("الاستحقاق: ", "Due: ")}{r.inst.due}</p>}
                  </div>
                  <p className="font-mono text-sm text-ink-900 whitespace-nowrap" dir="ltr">{money(r.amount)}</p>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm print:hidden">
                  {r.payment ? (
                    <>
                      <span className="inline-flex items-center gap-1 text-[#1F6B4F]"><i className="ri-checkbox-circle-fill" aria-hidden="true"></i>{t("سُدِّدت", "Paid")} {date(new Date(r.payment.paidAt), { day: "numeric", month: "short", year: "numeric" })}</span>
                      <Link to={`/invoice/${r.payment.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 underline underline-offset-4 text-ink-900" data-testid="invoice-link"><i className="ri-bill-line" aria-hidden="true"></i><span dir="ltr">{r.payment.invoiceNo}</span></Link>
                      {r.payment.source === "deposit" && <span className="inline-flex items-center gap-1 rounded-full bg-white border border-[#BFE0D0] text-[#1F6B4F] px-2.5 py-0.5 text-xs" data-testid="from-deposit"><i className="ri-links-line" aria-hidden="true"></i>{t("من العربون", "From the deposit")}</span>}
                    </>
                  ) : (
                    <>
                      <span className="inline-flex items-center gap-1 text-paper-600"><i className="ri-time-line" aria-hidden="true"></i>{m.next?.inst.id === r.inst.id && payable(c.status) ? t("مستحقة الآن", "Due now") : t("لم تُسدَّد", "Unpaid")}</span>
                      {payable(c.status) && <Link to={`/invoice/due/${c.id}/${r.inst.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 underline underline-offset-4 text-ink-900" data-testid="proforma-link"><i className="ri-file-list-3-line" aria-hidden="true"></i>{t("مطالبة بالدفع", "Payment request")}</Link>}
                    </>
                  )}
                  {!r.payment && r.index === 0 && quote && expectedDeposit(quote) != null && quote.status !== "paid" && (
                    <span className="basis-full text-xs text-paper-600" data-testid="deposit-hint"><i className="ri-links-line" aria-hidden="true"></i> {t(`هذه الدفعة هي عربون العرض ${quote.ref}: ادفعه من بطاقة عرض السعر وتُسدَّد هنا تلقائيًا بفاتورتها.`, `This installment is the deposit of quote ${quote.ref}: pay it from the quote card and it is settled here automatically with its invoice.`)}</span>
                  )}
                  {action?.(r)}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

/** «تسجيل السداد»: طريقة الدفع ومرجعه وتاريخه، ثم تصدر الفاتورة */
export function PayBox({ row, onPay, onCancel }: { row: ScheduleRow; onPay: (v: { method: PayMethod; ref: string; paidAt: string; note: string }) => Promise<boolean>; onCancel: () => void }) {
  const { t, pick } = useI18n();
  const money = useMoney();
  const [method, setMethod] = useState<PayMethod>("bank");
  const [ref, setRef] = useState("");
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await onPay({ method, ref, paidAt, note });
    setBusy(false);
  };
  return (
    <form onSubmit={submit} className="w-full mt-2 rounded-xl border border-ink-900 bg-white p-3.5 space-y-3" data-testid="pay-box">
      <p className="text-sm text-ink-900">{t(`تسجيل سداد «${row.inst.label}» بمبلغ ${money(row.amount)}`, `Record payment of “${row.inst.label}” for ${money(row.amount)}`)}</p>
      <div className="grid sm:grid-cols-3 gap-2">
        <label className="block">
          <span className="block text-xs text-paper-500 mb-1">{t("طريقة الدفع", "Method")}</span>
          <select value={method} onChange={(e) => setMethod(e.target.value as PayMethod)} className={field} data-testid="pay-method">
            {PAY_METHODS.map((m) => <option key={m} value={m}>{pick(PAY_METHOD_LABELS[m])}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs text-paper-500 mb-1">{t("مرجع العملية", "Reference")}</span>
          <input value={ref} onChange={(e) => setRef(e.target.value)} maxLength={80} dir="ltr" placeholder={t("رقم الحوالة أو الإيصال", "Transfer or receipt no.")} className={field} data-testid="pay-ref" />
        </label>
        <label className="block">
          <span className="block text-xs text-paper-500 mb-1">{t("تاريخ السداد", "Paid on")}</span>
          <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} max={new Date().toISOString().slice(0, 10)} className={field} />
        </label>
      </div>
      <label className="block">
        <span className="block text-xs text-paper-500 mb-1">{t("ملاحظة (اختياري)", "Note (optional)")}</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className={field} />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={busy} className="rounded-full bg-ink-900 text-white px-5 py-2 text-sm hover:bg-ink-700 disabled:opacity-60" data-testid="pay-submit">{busy ? t("نسجّل…", "Recording…") : t("سجّل السداد وأصدر الفاتورة", "Record & issue invoice")}</button>
        <button type="button" onClick={onCancel} className="rounded-full border border-paper-300 px-4 py-2 text-sm text-ink-900">{t("إلغاء", "Cancel")}</button>
        <p className="text-xs text-paper-500">{t("الفاتورة تصدر برقم متسلسل ولا تُحذف بعد إصدارها.", "The invoice gets a sequential number and can't be deleted once issued.")}</p>
      </div>
    </form>
  );
}

/** الفاتورة الضريبية لدفعة مسددة (برمز QR وفق المرحلة الأولى للفوترة الإلكترونية) أو مطالبة بدفعة مستحقة */
export function InvoiceDoc({ v }: { v: InvoiceView }) {
  const { t, pick, num, date } = useI18n();
  const money = useMoney();
  const tax = v.kind === "tax";
  const qr = tax && v.seller.vatNumber ? zatcaTlv({ seller: v.seller.name, vatNumber: v.seller.vatNumber, timestamp: zatcaTimestamp(v.issuedAt), total: v.amount, vat: v.vat }) : "";
  const day = (iso: string) => date(new Date(iso), { day: "numeric", month: "long", year: "numeric" });
  return (
    <article className="invoice-doc bg-white text-ink-900 border border-paper-200 print:border-0 rounded-2xl print:rounded-none p-6 md:p-10 print:p-0" data-testid="invoice-doc" data-kind={v.kind}>
      <header className="flex items-start justify-between gap-6 pb-5 border-b-2 border-ink-900">
        <div className="min-w-0">
          <h1 className="font-display text-2xl md:text-3xl">{tax ? t("فاتورة ضريبية", "Tax invoice") : t("مطالبة بالدفع (فاتورة مبدئية)", "Payment request (proforma)")}</h1>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-paper-600">{tax ? t("رقم الفاتورة", "Invoice no.") : t("المرجع", "Reference")}</dt><dd className="font-mono" dir="ltr" style={{ textAlign: "start" }} data-testid="invoice-number">{v.number}</dd>
            <dt className="text-paper-600">{t("تاريخ الإصدار", "Issue date")}</dt><dd>{day(v.issuedAt)}</dd>
            <dt className="text-paper-600">{t("العقد", "Contract")}</dt><dd><span className="font-mono" dir="ltr">{v.contractRef}</span> · {v.contractTitle}</dd>
          </dl>
        </div>
        {qr ? (
          <div className="shrink-0 text-center">
            <QrCode value={qr} size={128} title={t("رمز الفاتورة الضريبية", "Tax invoice QR")} />
            <p className="mt-1 text-[10px] text-paper-600">{t("رمز الفوترة الإلكترونية", "E-invoice QR")}</p>
          </div>
        ) : tax ? (
          <p className="shrink-0 max-w-[11rem] text-[11px] text-red-700 leading-snug print:hidden" data-testid="invoice-no-vat">{t("أضف الرقم الضريبي للمنشأة من «المحتوى ← بيانات الفوترة» ليظهر رمز QR.", "Add the company VAT number under Content → Billing to show the QR.")}</p>
        ) : null}
      </header>

      <section className="mt-5 grid sm:grid-cols-2 print:grid-cols-2 gap-4 text-sm">
        <div className="rounded-xl border border-paper-200 p-4">
          <p className="text-xs text-paper-500">{t("البائع", "Seller")}</p>
          <p className="mt-1 font-medium">{v.seller.name}</p>
          {v.seller.vatNumber && <p className="text-paper-700">{t("الرقم الضريبي: ", "VAT no.: ")}<span className="font-mono" dir="ltr">{v.seller.vatNumber}</span></p>}
          {v.seller.cr && <p className="text-paper-700">{t("السجل التجاري: ", "CR: ")}<span className="font-mono" dir="ltr">{v.seller.cr}</span></p>}
          {v.seller.address && <p className="text-paper-700">{v.seller.address}</p>}
        </div>
        <div className="rounded-xl border border-paper-200 p-4">
          <p className="text-xs text-paper-500">{t("العميل", "Buyer")}</p>
          <p className="mt-1 font-medium">{v.buyer.name}</p>
          {v.buyer.idNumber && <p className="text-paper-700">{v.buyer.idLabel || t("السجل / الهوية", "CR / ID")}: <span className="font-mono" dir="ltr">{v.buyer.idNumber}</span></p>}
          {v.buyer.address && <p className="text-paper-700">{v.buyer.address}</p>}
        </div>
      </section>

      <table className="mt-5 w-full text-sm">
        <thead>
          <tr className="border-b-2 border-ink-900 text-paper-600">
            <th scope="col" className="text-start font-normal py-2">{t("البيان", "Description")}</th>
            <th scope="col" className="text-end font-normal py-2 w-32">{t("قبل الضريبة", "Net")}</th>
            <th scope="col" className="text-end font-normal py-2 w-28">{t(`ضريبة ${num(v.vatRate, v.vatRate % 1 ? 2 : 0)}٪`, `VAT ${v.vatRate}%`)}</th>
            <th scope="col" className="text-end font-normal py-2 w-32">{t("الإجمالي", "Total")}</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-paper-200">
            <td className="py-3">{v.label} <span className="text-paper-500">· {t(`${num(v.percent, v.percent % 1 ? 2 : 0)}٪ من قيمة العقد`, `${v.percent}% of the contract value`)}</span></td>
            <td className="py-3 text-end font-mono" dir="ltr">{num(v.net, 2)}</td>
            <td className="py-3 text-end font-mono" dir="ltr">{num(v.vat, 2)}</td>
            <td className="py-3 text-end font-mono" dir="ltr" data-testid="invoice-amount">{num(v.amount, 2)}</td>
          </tr>
        </tbody>
      </table>

      <section className="mt-5 grid sm:grid-cols-2 print:grid-cols-2 gap-4 text-sm break-inside-avoid">
        <div>
          {tax ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              {v.method && <><dt className="text-paper-600">{t("طريقة الدفع", "Method")}</dt><dd>{pick(PAY_METHOD_LABELS[v.method])}</dd></>}
              {v.payRef && <><dt className="text-paper-600">{t("مرجع العملية", "Reference")}</dt><dd className="font-mono" dir="ltr" style={{ textAlign: "start" }}>{v.payRef}</dd></>}
              {v.paidAt && <><dt className="text-paper-600">{t("تاريخ السداد", "Paid on")}</dt><dd>{day(v.paidAt)}</dd></>}
            </dl>
          ) : v.bank && (v.bank.iban || v.bank.bankName) ? (
            <div className="rounded-xl border border-paper-200 p-4">
              <p className="text-xs text-paper-500">{t("التحويل البنكي", "Bank transfer")}</p>
              <p className="mt-1">{v.bank.bankName}</p>
              <p className="font-mono" dir="ltr" style={{ textAlign: "start" }}>{v.bank.iban}</p>
              <p className="mt-1 text-xs text-paper-600">{t(`اكتب ${v.contractRef} في خانة الغرض، ثم أرسل الإيصال في ملاحظات المشروع.`, `Put ${v.contractRef} in the transfer purpose, then send the receipt in the project notes.`)}</p>
            </div>
          ) : null}
        </div>
        <dl className="rounded-xl bg-paper-50 border border-paper-200 p-4 grid grid-cols-[1fr_auto] gap-x-6 gap-y-1.5">
          <dt className="text-paper-600">{t("قيمة العقد", "Contract value")}</dt><dd className="font-mono text-end" dir="ltr">{num(v.contractTotal, 2)}</dd>
          <dt className="text-paper-600">{t("يُخصم: المسدَّد سابقًا", "Less: paid earlier")}</dt><dd className="font-mono text-end" dir="ltr" data-testid="invoice-paid-before">{num(v.paidBefore, 2)}</dd>
          <dt className="font-medium">{tax ? t("هذه الفاتورة", "This invoice") : t("المطلوب الآن", "Due now")}</dt><dd className="font-mono text-end font-medium" dir="ltr">{money(v.amount)}</dd>
          <dt className="text-paper-600">{t("المتبقي بعدها", "Remaining after")}</dt><dd className="font-mono text-end" dir="ltr" data-testid="invoice-remaining">{num(v.remainingAfter, 2)}</dd>
        </dl>
      </section>
      <p className="mt-6 text-[11px] text-paper-500 leading-relaxed">{tax ? t("فاتورة صادرة إلكترونيًا من المنصة، لا تحتاج توقيعًا أو ختمًا.", "Issued electronically by the platform; no signature or stamp required.") : t("هذه مطالبة وليست فاتورة ضريبية. تصدر الفاتورة الضريبية برقمها عند تسجيل السداد.", "This is a payment request, not a tax invoice. The tax invoice is issued with its number once payment is recorded.")}</p>
    </article>
  );
}
