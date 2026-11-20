import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n/context";
import { kitsRepo } from "@/kits/repo";
import { CARRIERS, DISCLOSURES, DISCLOSURE_HINTS, DISCLOSURE_LABELS, KIT_KIND_LABELS, KIT_STATUSES, KIT_STATUS_LABELS, addressLine, addressOf, emptyAddress, hasGeo, mapsLink, newSample, nextStatuses, sampleTotals, sheetPath, trackingUrlFor, type Disclosure, type KitAddress, type KitDraft, type KitIssue, type KitOrder, type KitPatch, type KitSample, type KitStatus } from "@/kits/types";
import { KitStatusBadge, KitTimeline, TrackingLink } from "@/kits/components";
import { SamplesEditor } from "@/kits/SamplesEditor";
import { AddressForm } from "@/kits/AddressForm";
import { absoluteUrl } from "@/lib/links";
import { QrCode } from "@/lib/QrCode";
import { projectsRepo } from "@/projects/repo";
import type { Project } from "@/projects/types";
import { inventoryRepo } from "@/inventory/repo";
import { available, type InventoryItem } from "@/inventory/types";
import { usePActor } from "@/projects/useProjects";
import { COUNTRIES } from "@/lib/phone";
import { useCrm } from "../data/CrmProvider";
import { ValidationError } from "../data/types";
import { Btn, Card, Drawer, Empty, PageTitle, Stat, download, fieldCls, inlineFieldCls, toCsv, useFormat, waLink, numFieldCls } from "../components/ui";

// شحنات العينات: عينة الاكتشاف وجولات العطّار. لكل شحنة عيناتها بأسمائها ومكوّناتها، عنوان يؤكده العميل،
// وورقة مطبوعة برمز QR يقيّم منها العميل كل عينة بالاسم. مع صرف المواد من المخزون عند الشحن.

const clientLink = (o: Pick<KitOrder, "ref" | "token">) => absoluteUrl(sheetPath(o.ref, o.token));
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function Detail({ o, items, paid, manage, project, onSave, onFormula, onClose }: { o: KitOrder; items: InventoryItem[]; paid: boolean | null; manage: boolean; project: Project | null; onSave: (patch: KitPatch, issues: KitIssue[]) => Promise<boolean>; onFormula: (sampleId: string) => Promise<boolean>; onClose: () => void }) {
  const { t, pick, num } = useI18n();
  const f = useFormat();
  const [status, setStatus] = useState<KitStatus>(o.status);
  const [carrier, setCarrier] = useState(o.carrier);
  const [trackingNo, setTrackingNo] = useState(o.trackingNo);
  const [trackingUrl, setTrackingUrl] = useState(o.trackingUrl);
  const [note, setNote] = useState(o.note);
  const [samples, setSamples] = useState<KitSample[]>(o.samples);
  const [disclosure, setDisclosure] = useState<Disclosure>(o.disclosure);
  const [addr, setAddr] = useState<KitAddress>(() => addressOf(o));
  const [editAddr, setEditAddr] = useState(false);
  const [issue, setIssue] = useState<Record<string, number>>(() => Object.fromEntries(items.filter((i) => i.category === "sample").map((i) => [i.id, 1])));
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const shippingNow = status === "shipped" && o.status !== "shipped";
  const autoUrl = trackingUrlFor(carrier, trackingNo);
  const country = COUNTRIES.find((c) => c.iso === o.country);
  const options = [o.status, ...nextStatuses(o.status)];
  const link = clientLink(o);
  const wa = waLink(o.phone, `مرحباً ${o.name || ""}، بخصوص عيناتك ${o.ref}: ${status === "shipped" ? `شُحنت عبر ${carrier}${trackingNo ? ` برقم ${trackingNo}` : ""}. تابعها وقيّم كل عينة باسمها من ${link}` : `أكّد عنوان التسليم وتابع حالتها من ${link}`}`);
  const samplesDirty = !sameJson(samples, o.samples);
  const addrDirty = !sameJson(addr, addressOf(o));
  const dirty = status !== o.status || carrier !== o.carrier || trackingNo !== o.trackingNo || trackingUrl !== o.trackingUrl || note !== o.note || samplesDirty || addrDirty || disclosure !== o.disclosure;
  const totals = sampleTotals(o.samples);

  const submit = async () => {
    setSaving(true);
    const issues: KitIssue[] = shippingNow ? Object.entries(issue).filter(([, q]) => q > 0).map(([itemId, qty]) => ({ itemId, qty })) : [];
    const ok = await onSave({ status, carrier, trackingNo, trackingUrl: trackingUrl || autoUrl, note, ...(samplesDirty ? { samples } : {}), ...(addrDirty ? addr : {}), ...(disclosure !== o.disclosure ? { disclosure } : {}) }, issues);
    setSaving(false);
    if (ok) onClose();
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* المتصفح يمنع النسخ */
    }
  };

  return (
    <div className="p-5 md:p-6 space-y-6" data-testid="kit-detail">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-lg text-ink-900" dir="ltr" style={{ textAlign: "start" }}>{o.ref}</p>
          <p className="text-sm text-paper-600 mt-1">{o.name || o.email}</p>
        </div>
        <KitStatusBadge status={o.status} />
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-xs text-paper-500">{t("البريد", "Email")}</dt><dd className="text-ink-900 break-all" dir="ltr" style={{ textAlign: "start" }}>{o.email}</dd></div>
        <div>
          <dt className="text-xs text-paper-500">{t("الجوال", "Phone")}</dt>
          <dd className="text-ink-900" dir="ltr" style={{ textAlign: "start" }}>
            {o.phone || "—"}
            {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="ms-2 text-[#1F7A5C] hover:underline" aria-label={t("واتساب", "WhatsApp")}><i className="ri-whatsapp-line" aria-hidden="true"></i></a>}
          </dd>
        </div>
        <div className="col-span-2" data-testid="kit-address">
          <dt className="text-xs text-paper-500 flex items-center gap-2">
            {t("عنوان الشحن", "Ship to")}
            {o.addressConfirmedAt ? <span className="inline-flex items-center gap-1 text-[#1F6B4F]" data-testid="kit-address-confirmed"><i className="ri-check-double-line" aria-hidden="true"></i>{t("أكّده العميل", "Confirmed by the client")}</span> : <span className="text-accent2-ink">{t("لم يؤكده العميل بعد", "Not yet confirmed by the client")}</span>}
          </dt>
          <dd className="text-ink-900 mt-0.5">{addressLine(o, country ? pick(country.name) : "") || "—"}</dd>
          <dd className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            {o.shortAddress && <span className="font-mono text-paper-600" dir="ltr">{o.shortAddress}</span>}
            {hasGeo(o) && <a href={mapsLink(o)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-4 text-ink-900"><i className="ri-map-pin-2-line" aria-hidden="true"></i>{t("الموقع على الخريطة", "Location on the map")}</a>}
            {manage && <button type="button" onClick={() => setEditAddr((v) => !v)} className="underline underline-offset-4 text-ink-900" data-testid="kit-edit-address">{editAddr ? t("أخفِ النموذج", "Hide the form") : t("عدّل العنوان", "Edit the address")}</button>}
          </dd>
          {editAddr && <div className="mt-3 rounded-xl border border-paper-200 bg-white p-3"><AddressForm value={addr} onChange={setAddr} fieldClass={fieldCls} idPrefix="adm-addr" optional /></div>}
        </div>
        {o.directions && <div className="col-span-2"><dt className="text-xs text-paper-500">{t("الاتجاهات العطرية", "Scent directions")}</dt><dd className="text-ink-900">{o.directions}</dd></div>}
        <div>
          <dt className="text-xs text-paper-500">{t("الدفع", "Payment")}</dt>
          <dd className={paid ? "text-[#1F6B4F]" : paid === false ? "text-red-700" : "text-paper-500"}>{paid ? t("مدفوع", "Paid") : paid === false ? t("دفع مرفوض", "Payment failed") : t("غير مؤكد", "Unconfirmed")}</dd>
        </div>
        <div><dt className="text-xs text-paper-500">{t("أُنشئ", "Created")}</dt><dd className="text-ink-900">{f.date(o.createdAt)}</dd></div>
      </dl>

      <div className="flex flex-wrap gap-2 text-sm">
        <button type="button" onClick={copy} className="inline-flex items-center gap-1 rounded-full border border-paper-300 px-3 py-1.5 hover:border-ink-900">
          <i className={copied ? "ri-check-line" : "ri-link"} aria-hidden="true"></i>
          {copied ? t("نُسخ", "Copied") : t("رابط العميل لعيناته", "Client samples link")}
        </button>
        <Link to={sheetPath(o.ref, o.token)} target="_blank" className="inline-flex items-center gap-1 rounded-full border border-paper-300 px-3 py-1.5 hover:border-ink-900">
          <i className="ri-external-link-line" aria-hidden="true"></i>
          {t("صفحة العميل", "Client page")}
        </Link>
        <Link to={sheetPath(o.ref, o.token, true)} target="_blank" className="inline-flex items-center gap-1 rounded-full bg-ink-900 text-white px-3 py-1.5 hover:bg-ink-700" data-testid="kit-print-sheet">
          <i className="ri-printer-line" aria-hidden="true"></i>
          {t("اطبع ورقة العينات", "Print the sample sheet")}
        </Link>
        {o.contactId && <Link to={`/admin/contacts/${o.contactId}`} className="inline-flex items-center gap-1 rounded-full border border-paper-300 px-3 py-1.5 hover:border-ink-900"><i className="ri-contacts-book-3-line" aria-hidden="true"></i>{t("ملف العميل", "Client file")}</Link>}
      </div>

      <section className="rounded-2xl bg-paper-50 border border-paper-200 p-4" data-testid="kit-samples">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm text-ink-900">{t("العينات بأسمائها", "Named samples")}</h3>
            <p className="text-xs text-paper-500 mt-0.5">
              {o.decidedAt
                ? t(`قيّمها العميل: ${num(totals.accepted)} مقبولة، ${num(totals.rejected)} مرفوضة${totals.pending ? `، ${num(totals.pending)} بلا رأي` : ""}`, `Client rated: ${totals.accepted} accepted, ${totals.rejected} rejected${totals.pending ? `, ${totals.pending} unrated` : ""}`)
                : t("سمِّ كل عبوة واكتب مكوّناتها. تظهر للعميل في صفحته وعلى الورقة المطبوعة.", "Name each vial and list its ingredients. They show on the client page and the printed sheet.")}
            </p>
          </div>
          <QrCode value={link} size={64} title={t("رمز صفحة العميل", "Client page QR")} className="shrink-0 rounded" />
        </div>
        <SamplesEditor value={samples} onChange={setSamples} readOnly={!manage} />

        <label className="block mt-4 text-sm" data-testid="kit-disclosure">
          <span className="block text-paper-600 mb-1"><i className="ri-lock-line" aria-hidden="true"></i> {t("ما يراه العميل من المكوّنات", "What the client sees of the ingredients")}</span>
          <select value={disclosure} onChange={(e) => setDisclosure(e.target.value as Disclosure)} disabled={!manage} className={fieldCls}>
            {DISCLOSURES.map((d) => <option key={d} value={d}>{pick(DISCLOSURE_LABELS[d])}</option>)}
          </select>
          <span className="block mt-1 text-xs text-paper-500 leading-[1.7]">{pick(DISCLOSURE_HINTS[disclosure])}</span>
        </label>

        {o.samples.length > 0 && (
          <div className="mt-4 rounded-xl border border-paper-200 bg-white p-3" data-testid="kit-formula">
            <p className="text-sm text-ink-900"><i className="ri-award-line" aria-hidden="true"></i> {t("التركيبة المعتمدة", "Approved formula")}</p>
            {!o.projectId ? (
              <p className="mt-1 text-xs text-paper-500">{t("الشحنة غير مربوطة بمشروع. اعتماد العينة يُسجَّل على الشحنة فقط.", "This shipment isn't linked to a project. Approval is recorded on the shipment only.")}</p>
            ) : (
              <p className="mt-1 text-xs text-paper-500">{t(`مشروع «${project?.title ?? "—"}»: العينة المعتمدة تصير تركيبته، وتُنسخ في أمر الإنتاج.`, `Project “${project?.title ?? "—"}”: the approved sample becomes its formula and is copied into the production order.`)}</p>
            )}
            <ul className="mt-2 space-y-1.5">
              {o.samples.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-6 h-6 rounded bg-ink-900 text-white flex items-center justify-center font-mono text-[11px]" aria-hidden="true">{x.code}</span>
                  <span className="flex-1 min-w-0 truncate text-ink-900">{x.name}</span>
                  {o.approvedSample === x.id ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-ink-900 text-white px-2.5 py-0.5 text-xs" data-testid="kit-approved"><i className="ri-award-fill" aria-hidden="true"></i>{t("معتمدة", "Approved")}</span>
                  ) : manage && o.projectId && x.decision !== "rejected" ? (
                    <button type="button" onClick={() => window.confirm(t(`اعتماد «${x.name}» تركيبةً لمشروع «${project?.title ?? ""}»؟${x.decision ? "" : " العميل لم يقيّمها بعد."}`, `Set “${x.name}” as the formula of “${project?.title ?? ""}”?${x.decision ? "" : " The client hasn't rated it yet."}`)) && void onFormula(x.id)} className="rounded-full border border-paper-300 px-3 py-0.5 text-xs text-ink-900 hover:border-ink-900" data-testid="kit-set-formula">{t("اعتمدها تركيبةً", "Set as formula")}</button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {manage && (
        <form
          className="rounded-2xl bg-white border border-paper-200 p-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <fieldset>
            <legend className="text-sm text-paper-600 mb-2">{t("الحالة", "Status")}</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("الحالة", "Status")}>
              {options.map((s) => (
                <button key={s} type="button" role="radio" aria-checked={status === s} onClick={() => setStatus(s)} className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${status === s ? "border-ink-900 bg-ink-900 text-white" : "border-paper-300 text-ink-900 hover:border-ink-900"}`}>
                  {pick(KIT_STATUS_LABELS[s])}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="block text-paper-600 mb-1">{t("شركة الشحن", "Carrier")}{status === "shipped" && <span className="text-accent2-ink"> *</span>}</span>
              <select value={CARRIERS.some((c) => c.id === carrier) ? carrier : carrier ? "__other" : ""} onChange={(e) => setCarrier(e.target.value === "__other" ? carrier || "—" : e.target.value)} className={fieldCls} required={status === "shipped"}>
                <option value="">{t("اختر", "Choose")}</option>
                {CARRIERS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value="__other">{t("أخرى", "Other")}</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="block text-paper-600 mb-1">{t("رقم التتبع", "Tracking number")}</span>
              <input value={trackingNo} onChange={(e) => setTrackingNo(e.target.value)} maxLength={60} dir="ltr" className={fieldCls} placeholder="290123456789" />
            </label>
          </div>
          {!CARRIERS.some((c) => c.id === carrier) && carrier !== "" && (
            <label className="block text-sm">
              <span className="block text-paper-600 mb-1">{t("اسم شركة الشحن", "Carrier name")}</span>
              <input value={carrier} onChange={(e) => setCarrier(e.target.value)} maxLength={40} className={fieldCls} />
            </label>
          )}
          <label className="block text-sm">
            <span className="block text-paper-600 mb-1">{t("رابط التتبع", "Tracking link")} <span className="text-paper-400">{t("(يُولَّد تلقائياً من الشركة والرقم)", "(generated from carrier and number)")}</span></span>
            <input value={trackingUrl || autoUrl} onChange={(e) => setTrackingUrl(e.target.value)} dir="ltr" className={fieldCls} placeholder="https://" pattern="https://.*" />
          </label>
          <label className="block text-sm">
            <span className="block text-paper-600 mb-1">{t("ملاحظة داخلية", "Internal note")}</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} className={fieldCls} />
          </label>

          {shippingNow && (
            <fieldset className="rounded-xl bg-paper-50 border border-paper-200 p-3" data-testid="kit-issue">
              <legend className="text-sm text-ink-900 px-1">{t("خصم العينات من المخزون", "Deduct samples from stock")}</legend>
              {items.length === 0 ? (
                <p className="text-xs text-paper-500">{t("لا مواد من فئة «عينة» في المخزون. أضفها من صفحة المخزون ليُخصم رصيدها هنا تلقائياً.", "No “sample” items in stock. Add them on the stock page and they will be deducted here automatically.")}</p>
              ) : (
                <ul className="space-y-2">
                  {items.map((i) => {
                    const q = issue[i.id] ?? 0;
                    const short = q > available(i);
                    return (
                      <li key={i.id} className="flex items-center gap-3 text-sm">
                        <input type="checkbox" id={`iss-${i.id}`} checked={q > 0} onChange={(e) => setIssue({ ...issue, [i.id]: e.target.checked ? 1 : 0 })} className="accent-ink-900" />
                        <label htmlFor={`iss-${i.id}`} className="flex-1 min-w-0 truncate text-ink-900">{i.name} <span className="text-xs text-paper-500" dir="ltr">{i.sku}</span></label>
                        <input type="number" min={0} step={1} value={q} onChange={(e) => setIssue({ ...issue, [i.id]: Math.max(0, Number(e.target.value) || 0) })} aria-label={t(`كمية ${i.name}`, `${i.name} quantity`)} className={numFieldCls} />
                        <span className={`text-xs whitespace-nowrap ${short ? "text-red-700" : "text-paper-500"}`}>{t(`المتاح ${num(available(i))}`, `${num(available(i))} available`)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </fieldset>
          )}
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-paper-500">{status === "delivered" && o.status !== "delivered" ? t("سيُسجَّل تذكير بدعوة العميل لمكالمة بعد 3 أيام", "A reminder to invite the client to a call will be set for 3 days from now") : status === "shipped" && o.status !== "shipped" ? t("سيُبلَّغ العميل برقم التتبع", "The client will be told the tracking number") : ""}</p>
            <Btn type="submit" disabled={!dirty || saving}>{t("حفظ", "Save")}</Btn>
          </div>
        </form>
      )}

      <section>
        <h3 className="text-sm text-paper-600 mb-2">{t("السجل", "History")}</h3>
        <KitTimeline history={o.history} />
      </section>
    </div>
  );
}

/** جولة عينات جديدة: لمشروع قائم أو لعميل ببريده، بعيّنات مسمّاة ومكوّناتها */
function NewRound({ projects, initialProject = "", onCreate }: { projects: Project[]; initialProject?: string; onCreate: (d: KitDraft) => Promise<boolean> }) {
  const { t, pick } = useI18n();
  const first = projects.find((x) => x.id === initialProject);
  const [projectId, setProjectId] = useState(first?.id ?? "");
  const [email, setEmail] = useState(first?.clientEmail ?? "");
  const [name, setName] = useState(first?.brief?.name ?? [first?.brief?.firstName, first?.brief?.lastName].filter(Boolean).join(" "));
  const [phone, setPhone] = useState(first?.brief?.phone ?? "");
  const [directions, setDirections] = useState("");
  const [samples, setSamples] = useState<KitSample[]>(() => [{ ...newSample(0) }, { ...newSample(1) }]);
  const [addr, setAddr] = useState<KitAddress>(emptyAddress);
  const [disclosure, setDisclosure] = useState<Disclosure>("contract");
  const [saving, setSaving] = useState(false);
  const pickProject = (id: string) => {
    setProjectId(id);
    const p = projects.find((x) => x.id === id);
    if (p) {
      setEmail(p.clientEmail);
      setName(p.brief?.name ?? name);
      setPhone(p.brief?.phone ?? phone);
    }
  };
  const named = samples.filter((x) => x.name.trim());
  return (
    <form
      className="p-5 md:p-6 space-y-5"
      data-testid="new-round"
      onSubmit={(e) => {
        e.preventDefault();
        setSaving(true);
        const p = projects.find((x) => x.id === projectId);
        void onCreate({ ...addr, email, name, phone, directions, disclosure, projectId: projectId || null, contactId: p?.contactId ?? null, samples: named.map((x) => ({ ...x, ingredients: x.ingredients.filter((g) => g.name.trim()) })) }).finally(() => setSaving(false));
      }}
    >
      <p className="text-sm text-paper-600 leading-[1.8]">{t("سمِّ كل عينة واكتب مكوّناتها، ثم اطبع الورقة وأرفقها مع العبوات. العميل يمسح الرمز ويقبل أو يرفض كل عينة باسمها.", "Name each sample and list its ingredients, then print the sheet and enclose it with the vials. The client scans the code and accepts or rejects each by name.")}</p>
      {projects.length > 0 && (
        <label className="block text-sm">
          <span className="block text-paper-600 mb-1">{t("المشروع", "Project")}</span>
          <select value={projectId} onChange={(e) => pickProject(e.target.value)} className={fieldCls} data-testid="round-project">
            <option value="">{t("بلا مشروع (عميل جديد)", "No project (new client)")}</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.title} · {p.clientEmail}</option>)}
          </select>
        </label>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block text-sm sm:col-span-2">
          <span className="block text-paper-600 mb-1">{t("بريد العميل", "Client email")} <span className="text-accent2-ink">*</span></span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" className={fieldCls} data-testid="round-email" />
        </label>
        <label className="block text-sm">
          <span className="block text-paper-600 mb-1">{t("اسم المستلم", "Recipient name")}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={fieldCls} />
        </label>
        <label className="block text-sm">
          <span className="block text-paper-600 mb-1">{t("الجوال", "Phone")}</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} dir="ltr" className={fieldCls} />
        </label>
      </div>
      <label className="block text-sm">
        <span className="block text-paper-600 mb-1">{t("ملاحظة العطّار للعميل (تُطبع على الورقة)", "Perfumer's note to the client (printed on the sheet)")}</span>
        <textarea value={directions} onChange={(e) => setDirections(e.target.value)} rows={2} maxLength={300} className={fieldCls} />
      </label>
      <fieldset>
        <legend className="text-sm text-ink-900 mb-2">{t("العينات", "Samples")}</legend>
        <SamplesEditor value={samples} onChange={setSamples} />
      </fieldset>
      <label className="block text-sm" data-testid="round-disclosure">
        <span className="block text-paper-600 mb-1"><i className="ri-lock-line" aria-hidden="true"></i> {t("ما يراه العميل من المكوّنات", "What the client sees of the ingredients")}</span>
        <select value={disclosure} onChange={(e) => setDisclosure(e.target.value as Disclosure)} className={fieldCls}>
          {DISCLOSURES.map((d) => <option key={d} value={d}>{pick(DISCLOSURE_LABELS[d])}</option>)}
        </select>
        <span className="block mt-1 text-xs text-paper-500 leading-[1.7]">{pick(DISCLOSURE_HINTS[disclosure])}</span>
      </label>
      <details className="rounded-xl border border-paper-200 bg-white p-3">
        <summary className="cursor-pointer text-sm text-ink-900">{t("عنوان التسليم (اختياري: العميل يؤكده من رابطه)", "Delivery address (optional: the client confirms it from their link)")}</summary>
        <div className="mt-3"><AddressForm value={addr} onChange={setAddr} fieldClass={fieldCls} idPrefix="round-addr" optional /></div>
      </details>
      <div className="flex justify-end">
        <Btn type="submit" disabled={saving || !named.length || !email.trim()} data-testid="round-create">{t("أنشئ الجولة", "Create the round")}</Btn>
      </div>
    </form>
  );
}

export default function KitOrders() {
  const { t, pick, num } = useI18n();
  const { can } = useAuth();
  const { data: crm, run } = useCrm();
  const actor = usePActor();
  const f = useFormat();
  const [params, setParams] = useSearchParams();
  const [orders, setOrders] = useState<KitOrder[] | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const projects = useMemo(() => allProjects.filter((p) => p.status !== "done"), [allProjects]);
  // ?new=1&project=<id> من صفحة المشروع يفتح «جولة عينات جديدة» على مشروعه
  const [creating, setCreating] = useState(params.get("new") === "1");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(params.get("status") ?? "all");
  const manage = can("inventory.manage") || can("crm.edit");
  const seesPayments = can("payments.view");

  const reload = useCallback(async () => {
    if (!actor) return;
    setOrders(await kitsRepo.list(actor));
  }, [actor]);
  useEffect(() => {
    void reload();
    if (actor) void inventoryRepo.load(actor).then((d) => setItems(d.items.filter((i) => i.active && i.category === "sample"))).catch(() => undefined);
    if (actor) void projectsRepo.load(actor).then((d) => setAllProjects(d.projects)).catch(() => undefined);
  }, [actor, reload]);

  const payments = useMemo(() => new Map((crm?.payments ?? []).filter((p) => p.orderRef).map((p) => [p.orderRef!, p.status === "paid"])), [crm]);
  const openId = params.get("order");
  const open = orders?.find((o) => o.id === openId) ?? null;
  const setOpen = (id: string | null) => {
    const n = new URLSearchParams(params);
    if (id) n.set("order", id);
    else n.delete("order");
    setParams(n, { replace: true });
  };
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (orders ?? []).filter((o) => status === "all" || (status === "open" ? o.status === "new" || o.status === "preparing" : o.status === status)).filter((o) => !needle || [o.ref, o.name, o.email, o.phone, o.city, o.trackingNo].some((v) => v.toLowerCase().includes(needle)));
  }, [orders, q, status]);
  if (!orders) return <div className="h-48 rounded-2xl shimmer bg-paper-100" />;

  const month = new Date().toISOString().slice(0, 7);
  const toPrepare = orders.filter((o) => (o.status === "new" || o.status === "preparing") && payments.get(o.ref) !== false);
  const inTransit = orders.filter((o) => o.status === "shipped");
  const deliveredMonth = orders.filter((o) => o.status === "delivered" && (o.deliveredAt ?? "").startsWith(month));
  const returned = orders.filter((o) => o.status === "returned");
  const save = (id: string) => async (patch: KitPatch, issues: KitIssue[]) => {
    if (!actor) return false;
    let issueErrors: string[] = [];
    const ok = await run(async () => {
      const r = await kitsRepo.update(id, patch, issues, actor);
      issueErrors = r.issueErrors;
    }, patch.status === "shipped" ? t("سُجِّل الشحن", "Marked as shipped") : t("حُفظت الشحنة", "Shipment saved"));
    if (ok) {
      await reload();
      if (issueErrors.length) await run(() => Promise.reject(new ValidationError("insufficient_stock")));
    }
    return ok;
  };

  const setFormula = (id: string) => async (sampleId: string) => {
    if (!actor) return false;
    const ok = await run(() => kitsRepo.setFormula(id, sampleId, actor), t("اعتُمدت التركيبة للمشروع", "Formula set for the project"));
    if (ok) {
      await reload();
      void projectsRepo.load(actor).then((d) => setAllProjects(d.projects)).catch(() => undefined);
    }
    return ok;
  };
  const create = async (d: KitDraft) => {
    if (!actor) return false;
    let id = "";
    const ok = await run(async () => {
      id = (await kitsRepo.create(d, actor)).id;
    }, t("أُنشئت جولة العينات", "Sample round created"));
    if (ok) {
      await reload();
      setCreating(false);
      setOpen(id);
    }
    return ok;
  };
  const awaitingRating = orders.filter((o) => (o.status === "shipped" || o.status === "delivered") && o.samples.length > 0 && !o.decidedAt);

  return (
    <>
      <PageTitle
        title={t("شحنات العينات", "Sample shipments")}
        sub={t("عينة الاكتشاف وجولات العطّار: سمِّ كل عينة واكتب مكوّناتها، اطبع الورقة برمز QR، اشحن برقم تتبع، ثم راجع ما قبله العميل وما رفضه بالاسم.", "Discovery kits and perfumer rounds: name each sample with its ingredients, print the QR sheet, ship with tracking, then review what the client accepted and rejected by name.")}
        actions={
          <>
          {manage && (
            <Btn onClick={() => setCreating(true)} data-testid="new-round-open">
              <i className="ri-add-line" aria-hidden="true"></i>
              {t("جولة عينات جديدة", "New sample round")}
            </Btn>
          )}
          <Btn variant="secondary" onClick={() => download(`kits-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([["ref", "name", "email", "phone", "country", "city", "status", "carrier", "tracking_no", "created_at", "shipped_at", "delivered_at"], ...rows.map((o) => [o.ref, o.name, o.email, o.phone, o.country, o.city, o.status, o.carrier, o.trackingNo, o.createdAt, o.shippedAt ?? "", o.deliveredAt ?? ""])]))}>
            <i className="ri-download-2-line" aria-hidden="true"></i>
            {t("تصدير CSV", "Export CSV")}
          </Btn>
          </>
        }
      />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4 mb-4">
        <Stat icon="ri-flask-line" label={t("بانتظار التجهيز", "To prepare")} value={num(toPrepare.length)} tone={toPrepare.length ? "warn" : "plain"} hint={toPrepare.length ? t("جهّزها اليوم: العميل دفع وينتظر", "Prepare today: the client has paid and is waiting") : undefined} />
        <Stat icon="ri-truck-line" label={t("في الطريق", "In transit")} value={num(inTransit.length)} />
        <Stat icon="ri-checkbox-circle-line" label={t("سُلِّمت هذا الشهر", "Delivered this month")} value={num(deliveredMonth.length)} tone="good" />
        <Stat icon="ri-thumb-up-line" label={t("بانتظار تقييم العميل", "Awaiting client rating")} value={num(awaitingRating.length)} hint={returned.length ? t(`${num(returned.length)} مرتجعة`, `${returned.length} returned`) : undefined} tone={returned.length ? "warn" : "plain"} />
      </div>

      <Card>
        <div className="p-4 border-b border-paper-100 flex flex-wrap items-center gap-3">
          <label className="relative flex-1 min-w-48">
            <i className="ri-search-line absolute top-1/2 -translate-y-1/2 start-3 text-paper-400" aria-hidden="true"></i>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("رقم الطلب، الاسم، المدينة، رقم التتبع…", "Ref, name, city, tracking…")} aria-label={t("بحث", "Search")} className={`${fieldCls} ps-9`} />
          </label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={inlineFieldCls} aria-label={t("الحالة", "Status")}>
            <option value="all">{t("كل الشحنات", "All shipments")}</option>
            <option value="open">{t("بانتظار التجهيز", "To prepare")}</option>
            {KIT_STATUSES.map((s) => <option key={s} value={s}>{pick(KIT_STATUS_LABELS[s])}</option>)}
          </select>
        </div>
        {rows.length === 0 ? (
          <Empty icon="ri-truck-line" title={t("لا شحنات هنا", "No shipments here")} hint={t("تظهر طلبات العينة تلقائياً حين يطلبها العميل من صفحة عينة الاكتشاف.", "Kit orders appear automatically when a client orders from the discovery-kit page.")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="kits-table">
              <thead>
                <tr className="text-xs text-paper-500 border-b border-paper-100">
                  <th scope="col" className="text-start font-normal px-5 py-3">{t("رقم الطلب", "Ref")}</th>
                  <th scope="col" className="text-start font-normal px-3 py-3">{t("العميل", "Client")}</th>
                  <th scope="col" className="text-start font-normal px-3 py-3 hidden md:table-cell">{t("الوجهة", "Destination")}</th>
                  <th scope="col" className="text-start font-normal px-3 py-3 hidden sm:table-cell">{t("العينات", "Samples")}</th>
                  <th scope="col" className="text-start font-normal px-3 py-3 hidden sm:table-cell">{t("الدفع", "Payment")}</th>
                  <th scope="col" className="text-start font-normal px-3 py-3">{t("الحالة", "Status")}</th>
                  <th scope="col" className="text-start font-normal px-3 py-3 hidden lg:table-cell">{t("الشحن", "Shipping")}</th>
                  <th scope="col" className="text-end font-normal px-5 py-3 hidden sm:table-cell">{t("آخر تحديث", "Updated")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-paper-100">
                {rows.map((o) => {
                  const paid = payments.get(o.ref);
                  return (
                    <tr key={o.id} className="hover:bg-paper-50 cursor-pointer" onClick={() => setOpen(o.id)}>
                      <td className="px-5 py-3">
                        <button type="button" className="font-mono text-ink-900 hover:underline underline-offset-4" dir="ltr" onClick={() => setOpen(o.id)}>{o.ref}</button>
                        <span className="block text-[11px] text-paper-500">{pick(KIT_KIND_LABELS[o.kind])}</span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="block text-ink-900">{o.name || "—"}</span>
                        <span className="block text-xs text-paper-500" dir="ltr" style={{ textAlign: "start" }}>{o.email}</span>
                      </td>
                      <td className="px-3 py-3 hidden md:table-cell text-paper-600">{[o.city, o.country].filter(Boolean).join(" · ") || "—"}</td>
                      <td className="px-3 py-3 hidden sm:table-cell text-xs text-paper-600 whitespace-nowrap" data-testid="kit-row-samples">
                        {o.samples.length === 0 ? <span className="text-accent2-ink">{t("لم تُسمَّ", "Unnamed")}</span> : o.decidedAt ? <><span className="text-[#1F6B4F]">✓ {num(sampleTotals(o.samples).accepted)}</span> · <span className="text-red-700">✗ {num(sampleTotals(o.samples).rejected)}</span></> : t(`${num(o.samples.length)} عينات`, `${o.samples.length} samples`)}
                      </td>
                      <td className={`px-3 py-3 hidden sm:table-cell text-xs ${o.kind === "round" ? "text-paper-400" : paid ? "text-[#1F6B4F]" : paid === false ? "text-red-700" : "text-paper-500"}`}>{!seesPayments || o.kind === "round" ? "—" : paid ? t("مدفوع", "Paid") : paid === false ? t("مرفوض", "Failed") : t("لم يُدفع", "Unpaid")}</td>
                      <td className="px-3 py-3"><KitStatusBadge status={o.status} /></td>
                      <td className="px-3 py-3 hidden lg:table-cell text-paper-600" onClick={(e) => e.stopPropagation()}><TrackingLink url={o.trackingUrl || trackingUrlFor(o.carrier, o.trackingNo)} no={o.trackingNo} carrier={o.carrier} className="text-xs" /></td>
                      <td className="px-5 py-3 text-end text-paper-500 whitespace-nowrap hidden sm:table-cell">{f.ago(o.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Drawer open={creating} onClose={() => setCreating(false)} title={t("جولة عينات جديدة", "New sample round")}>
        {creating && <NewRound key={projects.length} projects={projects} initialProject={params.get("project") ?? ""} onCreate={create} />}
      </Drawer>
      <Drawer open={!!open} onClose={() => setOpen(null)} title={open?.ref ?? ""}>
        {open && <Detail key={open.id + open.updatedAt} o={open} items={items} paid={seesPayments ? (payments.get(open.ref) ?? null) : null} manage={manage} project={allProjects.find((p) => p.id === open.projectId) ?? null} onSave={save(open.id)} onFormula={setFormula(open.id)} onClose={() => setOpen(null)} />}
      </Drawer>
    </>
  );
}
