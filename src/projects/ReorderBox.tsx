import { useState, type FormEvent } from "react";
import { useI18n } from "@/i18n/context";
import { REORDER_LIMITS, referenceQty, type ReorderInput } from "./reorder";
import type { Contract } from "@/contracts/types";
import type { Quote } from "./types";

// «أعد الطلب»: نقرة تفتح سؤالين (الكمية والموعد) ثم تُنشئ مشروعاً جديداً بتركيبة الأصل ومسودة عرض وعقد.

const field = "w-full rounded-xl border border-paper-300 bg-white px-3.5 py-2.5 text-sm text-ink-900 focus:outline-none focus:border-ink-900";

export function ReorderBox({ quote, contract, onSubmit, onCancel, forClient }: { quote: Quote | null; contract: Contract | null; onSubmit: (i: ReorderInput) => Promise<boolean>; onCancel: () => void; forClient: boolean }) {
  const { t, num } = useI18n();
  const ref = referenceQty(quote ? quote.lines.map((l) => l.qty) : (contract?.specs ?? []).map((s) => s.qty));
  const [qty, setQty] = useState<string>(ref ? String(ref) : "");
  const [due, setDue] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await onSubmit({ qty: qty.trim() ? Number(qty) : null, due: due || null, note });
    setBusy(false);
  };
  return (
    <form onSubmit={submit} className="rounded-2xl border border-ink-900 bg-white p-5 space-y-4" data-testid="reorder-box">
      <div>
        <h2 className="font-display text-xl text-ink-900">{t("أعد الطلب", "Reorder")}</h2>
        <p className="mt-1 text-sm text-paper-600 leading-[1.8]">
          {forClient
            ? t("ننشئ لك مشروعًا جديدًا بالتركيبة والمواصفات والعقد نفسها. يراجع الفريق السعر على الكمية الجديدة ويرسل لك العرض خلال يوم عمل، ولا تدفع شيئًا الآن.", "We create a new project with the same formula, specifications and contract. The team reviews the price for the new quantity and sends the quote within one business day; nothing is charged now.")
            : t("مشروع جديد للعميل بتركيبة الأصل، مع مسودة عرض بالكمية الجديدة ومسودة عقد بالبنود نفسها. راجعهما ثم أرسلهما.", "A new project for the client with the original formula, a draft quote at the new quantity and a draft contract with the same clauses. Review, then send.")}
        </p>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-xs text-paper-600 mb-1">{t("الكمية", "Quantity")}{ref ? <span className="text-paper-400"> · {t(`السابقة ${num(ref)}`, `previous ${ref}`)}</span> : null}</span>
          <input type="number" min={1} max={REORDER_LIMITS.maxQty} step={1} value={qty} onChange={(e) => setQty(e.target.value)} dir="ltr" className={field} data-testid="reorder-qty" />
        </label>
        <label className="block">
          <span className="block text-xs text-paper-600 mb-1">{t("التسليم قبل (اختياري)", "Deliver by (optional)")}</span>
          <input type="date" min={today} value={due} onChange={(e) => setDue(e.target.value)} className={field} data-testid="reorder-due" />
        </label>
      </div>
      <label className="block">
        <span className="block text-xs text-paper-600 mb-1">{t("ملاحظة (اختياري): أي تغيير عن الطلب السابق", "Note (optional): any change from the previous order")}</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={REORDER_LIMITS.note} className={field} data-testid="reorder-note" />
      </label>
      <ul className="text-xs text-paper-600 space-y-1">
        {quote && <li><i className="ri-check-line text-[#1F6B4F]" aria-hidden="true"></i> {t(`مسودة عرض من ${quote.ref} بالكمية الجديدة`, `Draft quote from ${quote.ref} at the new quantity`)}</li>}
        {contract && <li><i className="ri-check-line text-[#1F6B4F]" aria-hidden="true"></i> {t(`مسودة عقد من ${contract.ref} بالبنود والمواصفات نفسها`, `Draft contract from ${contract.ref} with the same clauses and specifications`)}</li>}
        <li><i className="ri-check-line text-[#1F6B4F]" aria-hidden="true"></i> {t("التركيبة المعتمدة تنتقل كما هي، فلا عينات جديدة", "The approved formula carries over, so no new samples")}</li>
      </ul>
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={busy} className="rounded-full bg-ink-900 text-white px-6 py-2.5 text-sm hover:bg-ink-700 disabled:opacity-60" data-testid="reorder-submit">{busy ? t("ننشئ الطلب…", "Creating…") : forClient ? t("أرسل طلب الإعادة", "Send the reorder") : t("أنشئ إعادة الطلب", "Create the reorder")}</button>
        <button type="button" onClick={onCancel} className="rounded-full border border-paper-300 px-5 py-2.5 text-sm text-ink-900">{t("إلغاء", "Cancel")}</button>
      </div>
    </form>
  );
}
