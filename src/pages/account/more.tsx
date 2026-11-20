import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n/context";
import { COUNTRIES } from "@/lib/phone";
import { ValidationError } from "@/admin/data/types";
import { validationText } from "@/creatives/messages";
import { addressesRepo, MAX_ADDRESSES, type AddressInput, type SavedAddress } from "@/account/addresses";
import { AddressForm } from "@/kits/AddressForm";
import { KitProgress, KitStatusBadge, TrackingLink } from "@/kits/components";
import { DecisionBadge } from "@/kits/SamplesEditor";
import { countryName } from "@/kits/ClientSheet";
import { useMyKits } from "@/kits/useKits";
import { KIT_KIND_LABELS, addressLine, addressOpen, canDecide, emptyAddress, hasGeo, kitStatusHint, mapsLink, sampleTotals, sheetPath, statusAt, trackingUrlFor, type KitOrder } from "@/kits/types";
import { ContractStatusBadge } from "@/contracts/components";
import { PAY_METHOD_LABELS, contractMoney, payable } from "@/contracts/finance";
import { MoneyBar, useMoney } from "@/contracts/finance-ui";
import { useAccount } from "./AccountLayout";
import { PageTitle, Panel } from "./ui";

// صفحات الحساب المكمّلة: «عيناتي» (كل الشحنات بعيّناتها وقراراتها) و«الإعدادات» (بياناتي وعناوين التسليم).

const field = "w-full rounded-xl border border-paper-300 bg-white px-3.5 py-2.5 text-sm text-ink-900 focus:outline-none focus:border-ink-900";

/** ما المطلوب من العميل على هذه الشحنة الآن؟ */
export function kitNextStep(k: Pick<KitOrder, "status" | "samples" | "decidedAt" | "addressConfirmedAt">): "address" | "decide" | "done" | "wait" {
  if (addressOpen(k.status) && !k.addressConfirmedAt) return "address";
  if (canDecide(k.status) && k.samples.length > 0 && !k.decidedAt) return "decide";
  return k.decidedAt ? "done" : "wait";
}

export function KitCard({ k }: { k: KitOrder }) {
  const { t, pick, num } = useI18n();
  const url = k.trackingUrl || trackingUrlFor(k.carrier, k.trackingNo);
  const next = kitNextStep(k);
  const totals = sampleTotals(k.samples);
  const page = sheetPath(k.ref, k.token);
  return (
    <article className="rounded-2xl bg-white border border-paper-200 p-5" data-testid="kit-card" data-ref={k.ref} data-next={next}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-paper-500">{pick(KIT_KIND_LABELS[k.kind])}</p>
          <p className="font-mono text-ink-900" dir="ltr" style={{ textAlign: "start" }}>{k.ref}</p>
          {k.directions && <p className="mt-1 text-xs text-paper-500">{k.directions}</p>}
        </div>
        <KitStatusBadge status={k.status} />
      </div>
      <p className="mt-3 text-sm text-paper-700">{pick(kitStatusHint(k.status, k.kind))}</p>
      <div className="mt-4"><KitProgress status={k.status} compact dates={{ new: k.createdAt, preparing: statusAt(k, "preparing"), shipped: k.shippedAt, delivered: k.deliveredAt }} /></div>

      {k.samples.length > 0 && (
        <ul className="mt-4 space-y-1.5" aria-label={t("العينات", "Samples")}>
          {k.samples.map((s) => (
            <li key={s.id} className="flex items-center gap-2.5 text-sm">
              <span className="w-7 h-7 shrink-0 rounded-lg bg-ink-900 text-white flex items-center justify-center font-mono text-xs" aria-hidden="true">{s.code}</span>
              <span className="flex-1 min-w-0 truncate text-ink-900">{s.name}</span>
              {(s.decision || k.decidedAt) && <DecisionBadge s={s} />}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs text-paper-600 flex items-start gap-1.5">
        <i className={`mt-0.5 ${k.addressConfirmedAt ? "ri-map-pin-2-fill text-[#1F6B4F]" : "ri-map-pin-line"}`} aria-hidden="true"></i>
        <span>{addressLine(k, countryName(k.country, pick)) || t("لم يُحدد عنوان التسليم", "No delivery address yet")}{hasGeo(k) && <> · <a href={mapsLink(k)} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{t("الخريطة", "Map")}</a></>}</span>
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <Link to={next === "address" ? `${page}#kit-address` : page} className={`rounded-full px-4 py-2 text-xs ${next === "address" || next === "decide" ? "bg-ink-900 text-white hover:bg-ink-700" : "border border-paper-300 text-ink-900 hover:border-ink-900"}`} data-testid="kit-card-cta">
          {next === "address" ? t("أكّد عنوان التسليم", "Confirm delivery address") : next === "decide" ? t(`قيّم العينات (${num(k.samples.length)})`, `Rate the samples (${k.samples.length})`) : next === "done" ? t(`تقييمك: ${num(totals.accepted)} مقبولة · ${num(totals.rejected)} مرفوضة`, `Your rating: ${totals.accepted} accepted · ${totals.rejected} rejected`) : t("افتح صفحة العينات", "Open the samples page")}
        </Link>
        <TrackingLink url={url} no={k.trackingNo} carrier={k.carrier} className="text-ink-900" />
        {k.samples.length > 0 && <Link to={sheetPath(k.ref, k.token, true)} className="text-paper-600 hover:text-ink-900 underline-offset-4 hover:underline">{t("ورقة العينات", "Sample sheet")}</Link>}
        {k.status === "delivered" && k.kind === "kit" && <Link to="/book" className="ms-auto text-paper-600 hover:text-ink-900 underline-offset-4 hover:underline">{t("احجز مكالمة المتابعة", "Book the follow-up call")}</Link>}
      </div>
    </article>
  );
}

export function AccountSamples() {
  const { t } = useI18n();
  const kits = useMyKits();
  const todo = (kits ?? []).filter((k) => ["address", "decide"].includes(kitNextStep(k)));
  return (
    <>
      <PageTitle kicker={t("حسابي", "My account")} title={t("عيناتي", "My samples")}>
        <Link to="/discovery-kit" className="rounded-full border border-paper-300 px-4 py-2.5 text-sm text-ink-900 hover:border-ink-900">{t("اطلب عينة الاكتشاف", "Order a discovery kit")}</Link>
      </PageTitle>
      {!kits ? (
        <div className="h-48 rounded-2xl shimmer bg-paper-100" />
      ) : kits.length === 0 ? (
        <div className="rounded-2xl bg-white border border-paper-200 p-10 text-center" data-testid="samples-empty">
          <span className="w-14 h-14 mx-auto rounded-full bg-paper-100 text-ink-900 flex items-center justify-center text-2xl" aria-hidden="true"><i className="ri-test-tube-line"></i></span>
          <h2 className="mt-4 font-display text-xl text-ink-900">{t("لا عينات بعد", "No samples yet")}</h2>
          <p className="mt-2 text-sm text-paper-600 max-w-md mx-auto leading-[1.8]">{t("حين يرسل العطّار عيناتك تظهر هنا بأسمائها ومكوّناتها، فتؤكد عنوانك وتقبل أو ترفض كل عينة بالاسم.", "When the perfumer sends your samples they appear here by name with their ingredients, so you confirm your address and accept or reject each one by name.")}</p>
          <Link to="/discovery-kit" className="mt-5 inline-flex rounded-full bg-ink-900 text-white px-5 py-2.5 text-sm">{t("ابدأ بعينة الاكتشاف", "Start with the discovery kit")}</Link>
        </div>
      ) : (
        <>
          {todo.length > 0 && <p className="mb-4 rounded-2xl bg-ink-900 text-white px-4 py-3 text-sm" data-testid="samples-todo"><i className="ri-notification-3-line" aria-hidden="true"></i> {t("شحنات تنتظر خطوة منك: تأكيد العنوان أو تقييم العينات.", "Shipments waiting on you: confirm the address or rate the samples.")}</p>}
          <div className="grid md:grid-cols-2 gap-4" data-testid="samples-list">{kits.map((k) => <KitCard key={k.id} k={k} />)}</div>
          <p className="mt-5 text-sm text-paper-600"><i className="ri-graduation-cap-line" aria-hidden="true"></i> {t("أول مرة؟ ", "First time? ")}<Link to="/learn/reading-sample-sheet" className="underline underline-offset-4 text-ink-900">{t("كيف تقرأ ورقة العينات وتقيّم كل عينة", "How to read the sample sheet and rate each sample")}</Link></p>
        </>
      )}
    </>
  );
}

// ─── الإعدادات: بياناتي وعناويني ──────────────────────────────────

const blankInput = (name = "", phone = ""): AddressInput => ({ ...emptyAddress(), label: "", name, phone, isDefault: false });

function AddressEditor({ initial, onSave, onCancel }: { initial: AddressInput; onSave: (a: AddressInput) => Promise<boolean>; onCancel: () => void }) {
  const { t } = useI18n();
  const [a, setA] = useState<AddressInput>(initial);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await onSave(a);
    setBusy(false);
  };
  return (
    <form onSubmit={submit} className="rounded-2xl border border-ink-900 bg-white p-4 md:p-5 space-y-3" data-testid="address-editor">
      <div className="grid sm:grid-cols-3 gap-3">
        <label className="block">
          <span className="block text-xs text-paper-600 mb-1">{t("تسمية العنوان", "Address label")}</span>
          <input value={a.label} onChange={(e) => setA({ ...a, label: e.target.value })} maxLength={40} placeholder={t("المكتب، المستودع، البيت", "Office, warehouse, home")} className={field} data-testid="address-label" />
        </label>
        <label className="block">
          <span className="block text-xs text-paper-600 mb-1">{t("اسم المستلم", "Recipient")}</span>
          <input value={a.name} onChange={(e) => setA({ ...a, name: e.target.value })} maxLength={120} className={field} autoComplete="name" />
        </label>
        <label className="block">
          <span className="block text-xs text-paper-600 mb-1">{t("جوال المستلم", "Recipient phone")}</span>
          <input value={a.phone} onChange={(e) => setA({ ...a, phone: e.target.value })} maxLength={30} dir="ltr" className={field} autoComplete="tel" />
        </label>
      </div>
      <AddressForm value={a} onChange={(v) => setA({ ...a, ...v })} idPrefix="saved-addr" />
      <label className="flex items-center gap-2 text-sm text-ink-900">
        <input type="checkbox" checked={a.isDefault} onChange={(e) => setA({ ...a, isDefault: e.target.checked })} className="accent-ink-900" />
        {t("اجعله عنواني الافتراضي", "Make this my default address")}
      </label>
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={busy || !a.city.trim()} className="rounded-full bg-ink-900 text-white px-5 py-2.5 text-sm hover:bg-ink-700 disabled:opacity-60" data-testid="address-editor-save">{t("احفظ العنوان", "Save address")}</button>
        <button type="button" onClick={onCancel} className="rounded-full border border-paper-300 px-5 py-2.5 text-sm text-ink-900">{t("إلغاء", "Cancel")}</button>
      </div>
    </form>
  );
}

export function AccountSettings() {
  const { t, pick, lang, setLang } = useI18n();
  const { user, updateProfile, logout, isDemoMode } = useAuth();
  const [profile, setProfile] = useState({ firstName: user?.firstName ?? "", lastName: user?.lastName ?? "", phone: user?.phone ?? "", country: user?.country ?? "SA" });
  const [list, setList] = useState<SavedAddress[] | null>(null);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const uid = user?.id ?? "";

  const reload = useCallback(async () => {
    if (!uid) return;
    setList(await addressesRepo.list(uid).catch(() => []));
  }, [uid]);
  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(id);
  }, [notice]);

  const run = async (fn: () => Promise<unknown>, okText: string) => {
    try {
      await fn();
      await reload();
      setNotice({ ok: true, text: okText });
      return true;
    } catch (e) {
      setNotice({ ok: false, text: e instanceof ValidationError ? validationText(e.code, t) : t("تعذّر الحفظ. حاول مرة أخرى.", "Couldn't save. Please try again.") });
      return false;
    }
  };
  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const r = await updateProfile(profile);
    setSaving(false);
    setNotice({ ok: r.success, text: r.success ? t("حُفظت بياناتك.", "Your details are saved.") : r.message });
  };
  const saveAddress = (id: string | null) => async (a: AddressInput) => {
    const ok = await run(() => addressesRepo.save(uid, a, id), t("حُفظ العنوان.", "Address saved."));
    if (ok) setEditing(null);
    return ok;
  };
  if (!user) return null;
  const dirty = profile.firstName !== user.firstName || profile.lastName !== user.lastName || profile.phone !== (user.phone ?? "") || profile.country !== (user.country ?? "SA");

  return (
    <>
      <PageTitle kicker={t("حسابي", "My account")} title={t("الإعدادات", "Settings")} />
      {notice && <p role={notice.ok ? "status" : "alert"} className={`mb-4 rounded-2xl px-4 py-3 text-sm ${notice.ok ? "bg-[#E3F1EA] text-[#1F6B4F]" : "bg-red-50 text-red-700"}`} data-testid="settings-notice">{notice.text}</p>}
      <div className="grid xl:grid-cols-5 gap-5">
        <Panel title={t("بياناتي", "My details")} className="xl:col-span-2 self-start">
          <form onSubmit={saveProfile} className="space-y-3" data-testid="profile-form">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-xs text-paper-600 mb-1">{t("الاسم الأول", "First name")}</span>
                <input value={profile.firstName} onChange={(e) => setProfile({ ...profile, firstName: e.target.value })} required maxLength={60} className={field} autoComplete="given-name" data-testid="profile-first" />
              </label>
              <label className="block">
                <span className="block text-xs text-paper-600 mb-1">{t("اسم العائلة", "Last name")}</span>
                <input value={profile.lastName} onChange={(e) => setProfile({ ...profile, lastName: e.target.value })} maxLength={60} className={field} autoComplete="family-name" />
              </label>
            </div>
            <label className="block">
              <span className="block text-xs text-paper-600 mb-1">{t("البريد الإلكتروني", "Email")}</span>
              <input value={user.email} readOnly dir="ltr" className={`${field} bg-paper-50 text-paper-600`} />
              <span className="block mt-1 text-xs text-paper-500">{t("البريد يربط مشاريعك وعيناتك بحسابك؛ لتغييره تواصل معنا.", "Your email links projects and samples to your account; contact us to change it.")}</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-xs text-paper-600 mb-1">{t("الجوال", "Mobile")}</span>
                <input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} maxLength={30} dir="ltr" className={field} autoComplete="tel" data-testid="profile-phone" />
              </label>
              <label className="block">
                <span className="block text-xs text-paper-600 mb-1">{t("الدولة", "Country")}</span>
                <select value={profile.country} onChange={(e) => setProfile({ ...profile, country: e.target.value })} className={field}>
                  {COUNTRIES.map((c) => <option key={c.iso} value={c.iso}>{pick(c.name)}</option>)}
                </select>
              </label>
            </div>
            <button type="submit" disabled={!dirty || saving} className="rounded-full bg-ink-900 text-white px-5 py-2.5 text-sm hover:bg-ink-700 disabled:opacity-50" data-testid="profile-save">{t("احفظ بياناتي", "Save my details")}</button>
          </form>
          <div className="mt-6 pt-5 border-t border-paper-200 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-paper-600">{t("لغة المنصة", "Platform language")}</span>
              <div className="inline-flex rounded-full border border-paper-300 p-0.5" role="group" aria-label={t("اللغة", "Language")}>
                {(["ar", "en"] as const).map((l) => (
                  <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={lang === l} className={`rounded-full px-3.5 py-1.5 text-xs ${lang === l ? "bg-ink-900 text-white" : "text-ink-900"}`}>{l === "ar" ? "العربية" : "English"}</button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-paper-600">{t("الإشعارات", "Notifications")}</span>
              <span className="text-ink-900 text-xs text-end">{t("بالبريد عند كل عرض، عقد، شحنة أو اعتماد مطلوب", "By email for every quote, contract, shipment or approval")}</span>
            </div>
            <button type="button" onClick={logout} className="text-red-700 underline underline-offset-4">{t("تسجيل الخروج", "Sign out")}</button>
            {isDemoMode && <p className="text-xs text-paper-500">{t("نسخة تجريبية: بياناتك محفوظة في هذا المتصفح فقط.", "Demo build: your data stays in this browser only.")}</p>}
          </div>
        </Panel>

        <Panel
          title={t("عناوين التسليم", "Delivery addresses")}
          className="xl:col-span-3"
          action={editing === null && (list?.length ?? 0) < MAX_ADDRESSES ? <button type="button" onClick={() => setEditing("new")} className="rounded-full bg-ink-900 text-white px-4 py-2 text-sm hover:bg-ink-700" data-testid="address-add"><i className="ri-add-line" aria-hidden="true"></i> {t("عنوان جديد", "New address")}</button> : undefined}
        >
          <p className="text-sm text-paper-600 leading-[1.8] mb-4">{t("احفظ عناوينك مرة واحدة واختر منها عند شحن العينات أو تسليم الطلب. الموقع على الخريطة يوصل المندوب بلا اتصال.", "Save your addresses once and pick from them when samples ship or an order is delivered. A map pin gets the courier to you without a call.")}</p>
          {editing === "new" && <div className="mb-4"><AddressEditor initial={blankInput(`${user.firstName} ${user.lastName}`.trim(), user.phone ?? "")} onSave={saveAddress(null)} onCancel={() => setEditing(null)} /></div>}
          {!list ? (
            <div className="h-24 rounded-2xl shimmer bg-paper-100" />
          ) : list.length === 0 && editing !== "new" ? (
            <p className="rounded-2xl border border-dashed border-paper-300 p-6 text-center text-sm text-paper-600" data-testid="addresses-empty">{t("لا عناوين محفوظة. أضف عنوانك الأول ليُستخدم في شحناتك القادمة.", "No saved addresses. Add your first one to use on upcoming shipments.")}</p>
          ) : (
            <ul className="space-y-3" data-testid="addresses-list">
              {list.map((a) =>
                editing === a.id ? (
                  <li key={a.id}><AddressEditor initial={a} onSave={saveAddress(a.id)} onCancel={() => setEditing(null)} /></li>
                ) : (
                  <li key={a.id} className="rounded-2xl border border-paper-200 p-4" data-testid="address-item">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-ink-900 flex flex-wrap items-center gap-2">
                          <i className={hasGeo(a) ? "ri-map-pin-2-fill text-[#1F6B4F]" : "ri-map-pin-line text-paper-500"} aria-hidden="true"></i>
                          {a.label || a.city}
                          {a.isDefault && <span className="rounded-full bg-ink-900 text-white px-2 py-0.5 text-[11px]" data-testid="address-default">{t("الافتراضي", "Default")}</span>}
                        </p>
                        <p className="mt-1 text-sm text-paper-700 leading-[1.8]">{[a.name, a.phone].filter(Boolean).join(" · ")}</p>
                        <p className="text-sm text-paper-700 leading-[1.8]">{addressLine(a, countryName(a.country, pick))}{a.shortAddress ? ` · ${a.shortAddress}` : ""}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        {hasGeo(a) && <a href={mapsLink(a)} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 text-ink-900">{t("الخريطة", "Map")}</a>}
                        {!a.isDefault && <button type="button" onClick={() => void run(() => addressesRepo.setDefault(uid, a.id), t("صار عنوانك الافتراضي.", "Set as your default."))} className="underline underline-offset-4 text-ink-900">{t("اجعله الافتراضي", "Make default")}</button>}
                        <button type="button" onClick={() => setEditing(a.id)} className="underline underline-offset-4 text-ink-900" data-testid="address-item-edit">{t("تعديل", "Edit")}</button>
                        <button type="button" onClick={() => void run(() => addressesRepo.remove(uid, a.id), t("حُذف العنوان.", "Address removed."))} className="underline underline-offset-4 text-red-700" data-testid="address-item-delete">{t("حذف", "Delete")}</button>
                      </div>
                    </div>
                  </li>
                ),
              )}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}

// ─── عقودي وفواتيري ───────────────────────────────────────────────

export function AccountContracts() {
  const { t, num } = useI18n();
  const { data } = useAccount();
  const money = useMoney();
  if (!data) return <div className="h-48 rounded-2xl shimmer bg-paper-100" />;
  const list = data.contracts.filter((c) => c.status !== "void");
  return (
    <>
      <PageTitle kicker={t("حسابي", "My account")} title={t("عقودي", "My contracts")} />
      {list.length === 0 ? (
        <div className="rounded-2xl bg-white border border-paper-200 p-10 text-center" data-testid="contracts-empty">
          <span className="w-14 h-14 mx-auto rounded-full bg-paper-100 text-ink-900 flex items-center justify-center text-2xl" aria-hidden="true"><i className="ri-file-text-line"></i></span>
          <h2 className="mt-4 font-display text-xl text-ink-900">{t("لا عقود بعد", "No contracts yet")}</h2>
          <p className="mt-2 text-sm text-paper-600 max-w-md mx-auto leading-[1.8]">{t("بعد اعتماد عرض السعر يرسل لك المصنع العقد بقيمته وجدول دفعاته، فتراجعه وتوقّعه هنا إلكترونيًا.", "Once you approve the quote, the factory sends the contract with its value and payment schedule for you to review and e-sign here.")}</p>
        </div>
      ) : (
        <ul className="space-y-4" data-testid="my-contracts">
          {list.map((c) => {
            const m = contractMoney(c, data.contractPayments);
            const p = data.projects.find((x) => x.id === c.projectId);
            const needsMe = c.status === "sent" && !c.clientSignature;
            return (
              <li key={c.id} className="rounded-2xl bg-white border border-paper-200 p-5" data-testid="my-contract" data-ref={c.ref}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm text-paper-500" dir="ltr" style={{ textAlign: "start" }}>{c.ref}</p>
                    <h2 className="font-display text-lg text-ink-900" dir="auto">{c.title}</h2>
                    {p && <p className="text-xs text-paper-500 mt-0.5">{p.title}</p>}
                  </div>
                  <ContractStatusBadge c={c} />
                </div>
                {m.rows.length > 0 && (
                  <div className="mt-4 grid sm:grid-cols-3 gap-4 items-end">
                    <div><p className="text-xs text-paper-500">{t("قيمة العقد", "Contract value")}</p><p className="text-ink-900">{money(m.total)}</p></div>
                    <div><p className="text-xs text-paper-500">{t("المتبقي", "Remaining")}</p><p className="text-ink-900">{money(m.remaining)}</p></div>
                    <MoneyBar paid={m.paid} total={m.total} />
                  </div>
                )}
                {m.next && payable(c.status) && <p className="mt-3 text-sm text-paper-700"><i className="ri-time-line" aria-hidden="true"></i> {t(`الدفعة التالية: ${m.next.inst.label} بمبلغ ${money(m.next.amount)}`, `Next installment: ${m.next.inst.label}, ${money(m.next.amount)}`)}{m.next.inst.due ? ` · ${m.next.inst.due}` : ""}</p>}
                <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
                  <Link to={`/account/projects/${c.projectId}#pj-contract`} className={`rounded-full px-4 py-2 ${needsMe ? "bg-[#1F6B4F] text-white" : "border border-paper-300 text-ink-900 hover:border-ink-900"}`} data-testid="my-contract-open">{needsMe ? t("راجع العقد ووقّع", "Review & sign") : t("افتح العقد", "Open the contract")}</Link>
                  {c.status !== "changes" && <Link to={`/contract/${c.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-paper-600 hover:text-ink-900 underline-offset-4 hover:underline"><i className="ri-printer-line" aria-hidden="true"></i>{t("نسخة للطباعة", "Printable copy")}</Link>}
                  {m.rows.some((r) => r.payment) && <Link to="/account/invoices" className="text-paper-600 hover:text-ink-900 underline-offset-4 hover:underline">{t(`الفواتير (${num(m.rows.filter((r) => r.payment).length)})`, `Invoices (${m.rows.filter((r) => r.payment).length})`)}</Link>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

export function AccountInvoices() {
  const { t, pick, date } = useI18n();
  const { data } = useAccount();
  const money = useMoney();
  if (!data) return <div className="h-48 rounded-2xl shimmer bg-paper-100" />;
  const contractOf = (id: string) => data.contracts.find((c) => c.id === id);
  const paid = [...data.contractPayments].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  // المستحق: دفعات لم تُسدَّد من عقود موقّعة
  const due = data.contracts.filter((c) => payable(c.status)).flatMap((c) => contractMoney(c, data.contractPayments).rows.filter((r) => !r.payment).map((r) => ({ c, r })));
  const day = (iso: string) => date(new Date(iso), { day: "numeric", month: "short", year: "numeric" });
  return (
    <>
      <PageTitle kicker={t("حسابي", "My account")} title={t("فواتيري", "My invoices")} />
      {paid.length === 0 && due.length === 0 ? (
        <div className="rounded-2xl bg-white border border-paper-200 p-10 text-center" data-testid="invoices-empty">
          <span className="w-14 h-14 mx-auto rounded-full bg-paper-100 text-ink-900 flex items-center justify-center text-2xl" aria-hidden="true"><i className="ri-bill-line"></i></span>
          <h2 className="mt-4 font-display text-xl text-ink-900">{t("لا فواتير بعد", "No invoices yet")}</h2>
          <p className="mt-2 text-sm text-paper-600 max-w-md mx-auto leading-[1.8]">{t("بعد توقيع العقد تظهر هنا دفعاته المستحقة، وتصدر فاتورة ضريبية لكل دفعة تسددها.", "After the contract is signed its due installments appear here, and a tax invoice is issued for each one you pay.")}</p>
        </div>
      ) : (
        <div className="space-y-5">
          {due.length > 0 && (
            <Panel title={t("دفعات مستحقة", "Installments due")}>
              <ul className="divide-y divide-paper-100" data-testid="my-dues">
                {due.map(({ c, r }) => (
                  <li key={`${c.id}:${r.inst.id}`} className="py-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-ink-900">{r.inst.label} <span className="font-mono text-xs text-paper-500" dir="ltr">· {c.ref}</span></p>
                      {r.inst.due && <p className="text-xs text-paper-600">{t("الاستحقاق: ", "Due: ")}{r.inst.due}</p>}
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-ink-900 whitespace-nowrap">{money(r.amount)}</span>
                      <Link to={`/invoice/due/${c.id}/${r.inst.id}`} target="_blank" rel="noopener" className="rounded-full border border-paper-300 px-4 py-2 text-sm text-ink-900 hover:border-ink-900" data-testid="my-due-open">{t("المطالبة وبيانات التحويل", "Request & bank details")}</Link>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {paid.length > 0 && (
            <Panel title={t("فواتير صادرة", "Issued invoices")}>
              <ul className="divide-y divide-paper-100" data-testid="my-invoices">
                {paid.map((p) => (
                  <li key={p.id} className="py-3 flex flex-wrap items-center justify-between gap-3" data-testid="my-invoice">
                    <div className="min-w-0">
                      <p className="font-mono text-ink-900" dir="ltr" style={{ textAlign: "start" }}>{p.invoiceNo}</p>
                      <p className="text-xs text-paper-600">{p.label} · <span className="font-mono" dir="ltr">{contractOf(p.contractId)?.ref}</span> · {day(p.issuedAt)} · {pick(PAY_METHOD_LABELS[p.method])}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-ink-900 whitespace-nowrap">{money(p.amount)}</span>
                      <Link to={`/invoice/${p.id}`} target="_blank" rel="noopener" className="rounded-full bg-ink-900 text-white px-4 py-2 text-sm hover:bg-ink-700" data-testid="my-invoice-open"><i className="ri-printer-line" aria-hidden="true"></i> {t("الفاتورة", "Invoice")}</Link>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      )}
    </>
  );
}
