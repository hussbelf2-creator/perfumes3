import { useState, type FormEvent } from "react";
import { useI18n } from "@/i18n/context";
import { COUNTRIES } from "@/lib/phone";
import { QrCode } from "@/lib/QrCode";
import { AddressForm } from "./AddressForm";
import { DecisionBadge } from "./SamplesEditor";
import { KIT_KIND_LABELS, KIT_STATUS_LABELS, SAMPLE_LIMITS, SAMPLE_UNIT_LABELS, addressLine, addressOf, addressOpen, amountDigits, canDecide, hasGeo, mapsLink, sampleTotals, type KitAddress, type KitDecisionInput, type KitSample, type KitSheet, type SampleDecision } from "./types";

// ما يراه العميل من ورقة العينات: مكوّنات كل عبوة باسمها، تأكيد عنوان التسليم، وقبول أو رفض كل عينة.

export const countryName = (iso: string, pick: (b: { ar: string; en: string }) => string) => {
  const c = COUNTRIES.find((x) => x.iso === iso);
  return c ? pick(c.name) : iso;
};

export function Ingredients({ s, dense = false }: { s: KitSample; dense?: boolean }) {
  const { t, pick, num } = useI18n();
  if (!s.ingredients.length) return null;
  return (
    <table className={`w-full ${dense ? "text-xs" : "text-sm"}`} data-testid="sample-ingredients">
      <thead>
        <tr className="text-paper-500 border-b border-paper-200">
          <th scope="col" className="text-start font-normal py-1.5">{t("المكوّن", "Ingredient")}</th>
          <th scope="col" className="text-end font-normal py-1.5 w-28">{t("الكمية", "Amount")}</th>
        </tr>
      </thead>
      <tbody>
        {s.ingredients.map((g, i) => (
          <tr key={i} className="border-b border-paper-100 last:border-0">
            <td className="py-1.5 text-ink-900">{g.name}</td>
            <td className="py-1.5 text-end text-ink-900 whitespace-nowrap">{g.masked ? <span className="text-paper-400" aria-label={t("الكمية غير معروضة", "Amount not shown")}>••</span> : <>{num(g.amount, amountDigits(g.amount))} {pick(SAMPLE_UNIT_LABELS[g.unit])}</>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** عنوان التسليم: نموذج قبل الشحن، وعرض ثابت بعده */
export interface SavedChoice extends KitAddress {
  id: string;
  label: string;
  name: string;
  isDefault: boolean;
}
export function ConfirmAddress({ sheet, onSubmit, saved = [] }: { sheet: KitSheet; onSubmit: (a: KitAddress & { name?: string }) => Promise<boolean>; /** عناوين العميل المحفوظة في حسابه (إن كان مسجّلاً) */ saved?: SavedChoice[] }) {
  const { t, pick } = useI18n();
  const [addr, setAddr] = useState<KitAddress>(() => ({ ...addressOf(sheet), country: sheet.country || "SA" }));
  const [name, setName] = useState(sheet.name);
  const [editing, setEditing] = useState(!sheet.addressConfirmedAt);
  const [busy, setBusy] = useState(false);
  const open = addressOpen(sheet.status);
  const line = addressLine(sheet, countryName(sheet.country, pick));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await onSubmit({ ...addr, name });
    setBusy(false);
    if (ok) setEditing(false);
  };

  if (!open || !editing) {
    return (
      <div data-testid="address-summary">
        <p className="text-ink-900 leading-[1.8]">{sheet.name && <span className="block">{sheet.name}</span>}{line || t("لم يُحدد العنوان بعد", "No address yet")}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {sheet.shortAddress && <span className="font-mono text-paper-600" dir="ltr">{sheet.shortAddress}</span>}
          {hasGeo(sheet) && <a href={mapsLink(sheet)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-4 text-ink-900"><i className="ri-map-pin-2-line" aria-hidden="true"></i>{t("الموقع على الخريطة", "Location on the map")}</a>}
          {sheet.addressConfirmedAt && <span className="inline-flex items-center gap-1 text-[#1F6B4F]" data-testid="address-confirmed"><i className="ri-check-double-line" aria-hidden="true"></i>{t("أكّدتَ العنوان", "You confirmed this address")}</span>}
        </div>
        {open ? (
          <button type="button" onClick={() => setEditing(true)} className="mt-3 text-sm underline underline-offset-4 text-ink-900" data-testid="address-edit">{t("غيّر العنوان", "Change the address")}</button>
        ) : (
          <p className="mt-3 text-xs text-paper-500">{t("خرجت الشحنة، فلا يمكن تغيير العنوان من هنا. تواصل معنا إن لزم.", "The parcel has left, so the address can't be changed here. Contact us if needed.")}</p>
        )}
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-3" data-testid="address-confirm">
      <label className="block">
        <span className="block text-xs text-paper-600 mb-1">{t("اسم المستلم", "Recipient name")}</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className="w-full rounded-xl border border-paper-300 bg-white px-3.5 py-2.5 text-sm text-ink-900 focus:outline-none focus:border-ink-900" autoComplete="name" />
      </label>
      {saved.length > 0 && (
        <div data-testid="saved-addresses">
          <p className="text-xs text-paper-600 mb-1.5">{t("اختر من عناوينك المحفوظة", "Pick one of your saved addresses")}</p>
          <div className="flex flex-wrap gap-2">
            {saved.map((a) => (
              <button key={a.id} type="button" onClick={() => { setAddr(addressOf(a)); if (a.name) setName(a.name); }} className="inline-flex items-center gap-1.5 rounded-full border border-paper-300 bg-white px-3.5 py-1.5 text-sm text-ink-900 hover:border-ink-900" data-testid="saved-address">
                <i className={hasGeo(a) ? "ri-map-pin-2-fill text-[#1F6B4F]" : "ri-map-pin-line"} aria-hidden="true"></i>
                {a.label || a.city}
                {a.isDefault && <span className="text-[11px] text-paper-500">{t("الافتراضي", "default")}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
      <AddressForm value={addr} onChange={setAddr} idPrefix="kit-addr" />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy || !addr.city.trim()} className="rounded-full bg-ink-900 text-white px-5 py-2.5 text-sm hover:bg-ink-700 disabled:opacity-60" data-testid="address-save">{busy ? t("نحفظ…", "Saving…") : t("أكّد عنوان التسليم", "Confirm delivery address")}</button>
        {sheet.addressConfirmedAt && <button type="button" onClick={() => setEditing(false)} className="text-sm text-paper-600 underline underline-offset-4">{t("إلغاء", "Cancel")}</button>}
      </div>
    </form>
  );
}

/** العينات بأسمائها: مكوّنات كل عبوة، وقرار العميل عليها بعد الشحن */
/** سطر يشرح للعميل ما يراه من المكوّنات ولماذا */
export function DisclosureNote({ sheet }: { sheet: Pick<KitSheet, "disclosure" | "amounts" | "samples"> }) {
  const { t } = useI18n();
  if (sheet.amounts || !sheet.samples.some((s) => s.ingredients.length)) return null;
  return (
    <p className="mb-3 rounded-xl bg-paper-50 border border-paper-200 px-3.5 py-2.5 text-xs text-paper-700 leading-[1.8]" data-testid="disclosure-note" data-disclosure={sheet.disclosure}>
      <i className="ri-lock-line" aria-hidden="true"></i>{" "}
      {sheet.disclosure === "contract"
        ? t("تعرض الورقة أسماء المكوّنات. الكميات والنسب تظهر هنا تلقائيًا بعد توقيع عقد المشروع.", "The sheet lists ingredient names. Amounts and percentages appear here automatically once the project contract is signed.")
        : t("تعرض الورقة أسماء المكوّنات بلا كميات.", "The sheet lists ingredient names without amounts.")}
    </p>
  );
}

export function SampleDecisions({ sheet, onSubmit, onApprove }: { sheet: KitSheet; onSubmit: (d: KitDecisionInput[]) => Promise<boolean>; /** اعتماد عينة مقبولة تركيبةً نهائية للمشروع */ onApprove?: (sampleId: string) => Promise<boolean> }) {
  const { t, num } = useI18n();
  const can = canDecide(sheet.status);
  const [draft, setDraft] = useState<Record<string, { decision?: SampleDecision; comment: string }>>(() => Object.fromEntries(sheet.samples.map((s) => [s.id, { decision: s.decision, comment: s.comment ?? "" }])));
  const [busy, setBusy] = useState(false);
  const [approving, setApproving] = useState<string | null>(null);
  const [editing, setEditing] = useState(!sheet.decidedAt);
  const approved = sheet.samples.find((x) => x.id === sheet.approvedSample);
  const chosen = sheet.samples.filter((s) => draft[s.id]?.decision);
  const totals = sampleTotals(sheet.samples);
  const set = (id: string, p: Partial<{ decision: SampleDecision; comment: string }>) => setDraft((d) => ({ ...d, [id]: { ...d[id], comment: d[id]?.comment ?? "", ...p } }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!chosen.length) return;
    setBusy(true);
    const ok = await onSubmit(chosen.map((s) => ({ id: s.id, decision: draft[s.id].decision!, comment: draft[s.id].comment })));
    setBusy(false);
    if (ok) setEditing(false);
  };

  if (!sheet.samples.length) return <p className="text-sm text-paper-600">{t("سيكتب العطّار أسماء العينات ومكوّناتها هنا قبل الشحن.", "The perfumer will list the sample names and ingredients here before shipping.")}</p>;
  const active = can && editing;
  return (
    <form onSubmit={submit} data-testid="sample-decisions">
      {sheet.decidedAt && !editing && (
        <p className="mb-4 rounded-xl bg-[#E3F1EA] text-[#1F6B4F] px-4 py-3 text-sm flex flex-wrap items-center justify-between gap-2" data-testid="decisions-done">
          <span><i className="ri-check-double-line" aria-hidden="true"></i> {t(`وصلنا تقييمك: ${num(totals.accepted)} مقبولة و${num(totals.rejected)} مرفوضة.`, `We got your rating: ${totals.accepted} accepted, ${totals.rejected} rejected.`)}</span>
          <button type="button" onClick={() => setEditing(true)} className="underline underline-offset-4">{t("عدّل تقييمك", "Edit your rating")}</button>
        </p>
      )}
      <DisclosureNote sheet={sheet} />
      {approved && (
        <p className="mb-4 rounded-xl bg-ink-900 text-white px-4 py-3 text-sm" data-testid="formula-approved">
          <i className="ri-award-line" aria-hidden="true"></i> {t(`اعتمدتَ «${approved.name}» تركيبةً نهائية${sheet.hasProject ? " لمشروعك. ننتقل الآن للخطوة التالية." : "."}`, `You approved “${approved.name}” as the final formula${sheet.hasProject ? " for your project. We now move to the next step." : "."}`)}
        </p>
      )}
      <ul className="space-y-3">
        {sheet.samples.map((s) => {
          const d = draft[s.id] ?? { comment: "" };
          return (
            <li key={s.id} className={`rounded-2xl border p-4 md:p-5 transition-colors ${active && d.decision === "accepted" ? "border-[#1F6B4F] bg-[#F4FAF7]" : active && d.decision === "rejected" ? "border-red-300 bg-red-50/40" : "border-paper-200 bg-white"}`} data-testid="sample-card" data-sample={s.id}>
              <div className="flex items-start gap-3">
                <span className="w-11 h-11 shrink-0 rounded-xl bg-ink-900 text-white flex items-center justify-center font-mono text-base" aria-hidden="true">{s.code}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h3 className="font-display text-lg text-ink-900">{s.name}</h3>
                    {!active && (s.decision || sheet.decidedAt) && <DecisionBadge s={s} />}
                  </div>
                  {s.concentration && <p className="text-xs text-paper-500 mt-0.5">{s.concentration}</p>}
                  {s.notes && <p className="mt-2 text-sm text-paper-700 leading-[1.8]">{s.notes}</p>}
                </div>
              </div>
              {s.ingredients.length > 0 && (
                <details className="mt-3 group">
                  <summary className="cursor-pointer text-sm text-ink-900 inline-flex items-center gap-1 select-none"><i className="ri-arrow-down-s-line group-open:rotate-180 transition-transform" aria-hidden="true"></i>{s.ingredients.some((g) => !g.masked) ? t(`المكوّنات والكميات (${num(s.ingredients.length)})`, `Ingredients and amounts (${s.ingredients.length})`) : t(`المكوّنات (${num(s.ingredients.length)})`, `Ingredients (${s.ingredients.length})`)}</summary>
                  <div className="mt-2"><Ingredients s={s} /></div>
                </details>
              )}
              {active && (
                <div className="mt-4 pt-4 border-t border-paper-200">
                  <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t(`رأيك في ${s.name}`, `Your verdict on ${s.name}`)}>
                    <button type="button" role="radio" aria-checked={d.decision === "accepted"} onClick={() => set(s.id, { decision: "accepted" })} className={`rounded-full border py-2.5 text-sm transition-colors ${d.decision === "accepted" ? "border-[#1F6B4F] bg-[#1F6B4F] text-white" : "border-paper-300 text-ink-900 hover:border-[#1F6B4F]"}`} data-testid="accept"><i className="ri-check-line" aria-hidden="true"></i> {t("مقبولة", "Accept")}</button>
                    <button type="button" role="radio" aria-checked={d.decision === "rejected"} onClick={() => set(s.id, { decision: "rejected" })} className={`rounded-full border py-2.5 text-sm transition-colors ${d.decision === "rejected" ? "border-red-600 bg-red-600 text-white" : "border-paper-300 text-ink-900 hover:border-red-600"}`} data-testid="reject"><i className="ri-close-line" aria-hidden="true"></i> {t("مرفوضة", "Reject")}</button>
                  </div>
                  {d.decision && (
                    <label className="block mt-3">
                      <span className="block text-xs text-paper-600 mb-1">{d.decision === "rejected" ? t("ما الذي لم يعجبك؟ يساعد العطّار في الجولة القادمة", "What didn't work? It guides the perfumer's next round") : t("ملاحظة للعطّار (اختياري)", "Note for the perfumer (optional)")}</span>
                      <textarea value={d.comment} onChange={(e) => set(s.id, { comment: e.target.value })} rows={2} maxLength={SAMPLE_LIMITS.comment} className="w-full rounded-xl border border-paper-300 bg-white px-3.5 py-2.5 text-sm text-ink-900 focus:outline-none focus:border-ink-900" data-testid="sample-comment" />
                    </label>
                  )}
                </div>
              )}
              {!active && s.comment && <p className="mt-3 text-sm text-paper-700 leading-[1.8] border-s-2 border-paper-300 ps-3">«{s.comment}»</p>}
              {!active && onApprove && can && s.decision === "accepted" && sheet.approvedSample !== s.id && (
                <div className="mt-3 pt-3 border-t border-paper-200 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-paper-600">{sheet.approvedSample ? t("غيّرت رأيك؟ يمكنك اعتماد هذه بدلًا من السابقة.", "Changed your mind? You can approve this one instead.") : t("هذه هي؟ اعتمدها ليبدأ المصنع عليها.", "Is this the one? Approve it so the factory builds on it.")}</p>
                  <button
                    type="button"
                    disabled={approving !== null}
                    onClick={async () => {
                      if (!window.confirm(t(`اعتماد «${s.name}» تركيبةً نهائية للإنتاج؟`, `Approve “${s.name}” as the final formula for production?`))) return;
                      setApproving(s.id);
                      await onApprove(s.id);
                      setApproving(null);
                    }}
                    className="rounded-full bg-[#1F6B4F] text-white px-4 py-2 text-sm hover:opacity-90 disabled:opacity-50"
                    data-testid="approve-formula"
                  >
                    <i className="ri-award-line" aria-hidden="true"></i> {approving === s.id ? t("نعتمد…", "Approving…") : t("اعتمدها تركيبةً نهائية", "Approve as the final formula")}
                  </button>
                </div>
              )}
              {sheet.approvedSample === s.id && <p className="mt-3 inline-flex items-center gap-1 rounded-full bg-ink-900 text-white px-3 py-1 text-xs" data-testid="approved-badge"><i className="ri-award-fill" aria-hidden="true"></i>{t("التركيبة المعتمدة", "Approved formula")}</p>}
            </li>
          );
        })}
      </ul>
      {active ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-paper-600">{t(`قيّمتَ ${num(chosen.length)} من ${num(sheet.samples.length)}`, `Rated ${chosen.length} of ${sheet.samples.length}`)}</p>
          <button type="submit" disabled={busy || !chosen.length} className="rounded-full bg-ink-900 text-white px-6 py-3 text-sm hover:bg-ink-700 disabled:opacity-50" data-testid="decisions-submit">{busy ? t("نرسل…", "Sending…") : t("أرسل تقييمي للعطّار", "Send my rating to the perfumer")}</button>
        </div>
      ) : !can ? (
        <p className="mt-4 text-sm text-paper-600" data-testid="decisions-wait"><i className="ri-time-line" aria-hidden="true"></i> {t("يفتح التقييم حين تُشحن العينات. جرّب كل عينة على بشرتك يومًا كاملًا قبل الحكم.", "Rating opens once the samples ship. Wear each one for a full day before judging.")}</p>
      ) : null}
    </form>
  );
}

/** الورقة المطبوعة المرافقة للعينات: مكوّنات كل عبوة ورمز QR لاستكمال الإجراءات */
export function SheetDoc({ sheet, url, company }: { sheet: KitSheet; url: string; company: { legalName: string; phone: string; email: string } }) {
  const { t, pick, num, lang } = useI18n();
  const locale = lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB";
  const date = new Date(sheet.shippedAt ?? sheet.createdAt).toLocaleDateString(locale, { timeZone: "Asia/Riyadh", year: "numeric", month: "long", day: "numeric" });
  return (
    <article className="sheet-doc bg-white text-ink-900 border border-paper-200 print:border-0 rounded-2xl print:rounded-none p-6 md:p-10 print:p-0" data-testid="sheet-doc">
      <header className="flex items-start justify-between gap-6 pb-5 border-b-2 border-ink-900">
        <div className="min-w-0">
          <p className="text-xs text-paper-600">{company.legalName || t("منصة العطور", "Perfume Platform")}</p>
          <h1 className="mt-1 font-display text-2xl md:text-3xl">{t("ورقة العينات", "Sample sheet")}</h1>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-paper-600">{t("الرقم", "Ref")}</dt><dd className="font-mono" dir="ltr" style={{ textAlign: "start" }}>{sheet.ref}</dd>
            <dt className="text-paper-600">{t("النوع", "Type")}</dt><dd>{pick(KIT_KIND_LABELS[sheet.kind])} · {pick(KIT_STATUS_LABELS[sheet.status])}</dd>
            <dt className="text-paper-600">{t("التاريخ", "Date")}</dt><dd>{date}</dd>
            {sheet.name && <><dt className="text-paper-600">{t("المستلم", "Recipient")}</dt><dd>{sheet.name}</dd></>}
            {addressLine(sheet) && <><dt className="text-paper-600">{t("العنوان", "Address")}</dt><dd>{addressLine(sheet, countryName(sheet.country, pick))}{sheet.shortAddress ? ` · ${sheet.shortAddress}` : ""}</dd></>}
            <dt className="text-paper-600">{t("عدد العبوات", "Vials")}</dt><dd>{num(sheet.samples.length)}</dd>
          </dl>
        </div>
        <div className="shrink-0 text-center">
          <QrCode value={url} size={132} title={t("رمز استكمال الإجراءات", "QR to complete the steps")} />
          <p className="mt-1 text-[11px] leading-snug text-paper-700 max-w-[132px]">{t("امسح الرمز لتقييم كل عينة واستكمال طلبك", "Scan to rate each sample and continue your order")}</p>
        </div>
      </header>

      {sheet.directions && <p className="mt-4 text-sm leading-[1.8]"><span className="text-paper-600">{t("ملاحظة العطّار: ", "Perfumer's note: ")}</span>{sheet.directions}</p>}

      {!sheet.amounts && sheet.samples.some((x) => x.ingredients.length > 0) && (
        <p className="mt-3 text-xs text-paper-700" data-testid="sheet-disclosure">{sheet.disclosure === "contract" ? t("المكوّنات بأسمائها. النسب تُسلَّم بعد توقيع العقد.", "Ingredients by name. Percentages are shared after the contract is signed.") : t("المكوّنات بأسمائها.", "Ingredients by name.")}</p>
      )}

      <section className="mt-5 grid sm:grid-cols-2 print:grid-cols-2 gap-4">
        {sheet.samples.map((s) => (
          <div key={s.id} className="rounded-xl border border-paper-300 p-4 break-inside-avoid" data-testid="sheet-sample">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 shrink-0 rounded-lg border-2 border-ink-900 flex items-center justify-center font-mono text-base">{s.code}</span>
              <div className="min-w-0">
                <h2 className="font-display text-base leading-snug">{s.name}</h2>
                {s.concentration && <p className="text-xs text-paper-600">{s.concentration}</p>}
              </div>
            </div>
            {s.notes && <p className="mt-2 text-xs leading-[1.7] text-paper-700">{s.notes}</p>}
            <div className="mt-2"><Ingredients s={s} dense /></div>
            <div className="mt-3 pt-2 border-t border-dashed border-paper-300 flex items-center gap-4 text-xs">
              <span className="inline-flex items-center gap-1.5"><span className="w-3.5 h-3.5 border border-ink-900 inline-block"></span>{t("مقبولة", "Accept")}</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-3.5 h-3.5 border border-ink-900 inline-block"></span>{t("مرفوضة", "Reject")}</span>
              <span className="flex-1 border-b border-paper-400 h-3" aria-hidden="true"></span>
            </div>
          </div>
        ))}
      </section>

      <section className="mt-6 pt-4 border-t border-paper-300 grid sm:grid-cols-[1fr_auto] print:grid-cols-[1fr_auto] gap-4 text-sm break-inside-avoid">
        <div>
          <h2 className="font-display text-base">{t("ماذا بعد؟", "What next?")}</h2>
          <ol className="mt-2 space-y-1 list-decimal ps-5 leading-[1.8]">
            <li>{t("جرّب كل عينة على بشرتك يومًا كاملًا، واحدة في كل مرة.", "Wear each sample for a full day, one at a time.")}</li>
            <li>{t("امسح الرمز وحدّد المقبولة والمرفوضة بالاسم، واكتب ملاحظتك.", "Scan the code, accept or reject each by name, and add your note.")}</li>
            <li>{t("نعدّل التركيبة أو نعتمدها، ثم ننتقل للعبوة والتغليف والعقد.", "We adjust or approve the formula, then move on to bottle, packaging and contract.")}</li>
          </ol>
        </div>
        <div className="text-xs text-paper-700 sm:text-end">
          {company.phone && <p dir="ltr">{company.phone}</p>}
          {company.email && <p dir="ltr">{company.email}</p>}
          <p className="mt-2 max-w-[16rem] leading-[1.6]">{t("للاستعمال الخارجي فقط. اختبر على مساحة صغيرة أولًا. يُحفظ بعيدًا عن الحرارة واللهب.", "External use only. Patch-test first. Keep away from heat and flame.")}</p>
        </div>
      </section>
    </article>
  );
}
