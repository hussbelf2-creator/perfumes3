import { useState } from "react";
import { useI18n } from "@/i18n/context";
import { COUNTRIES } from "@/lib/phone";
import { SHORT_ADDRESS_RE, hasGeo, mapsLink, parseLatLng, type KitAddress } from "./types";

// نموذج عنوان التسليم: حقول العنوان الوطني السعودي، وموقع على الخريطة بزر واحد أو بلصق رابط الخرائط.

const publicField = "w-full rounded-xl border border-paper-300 bg-white px-3.5 py-2.5 text-sm text-ink-900 focus:outline-none focus:border-ink-900";

export function AddressForm({ value, onChange, fieldClass = publicField, idPrefix = "addr", disabled = false, optional = false }: { value: KitAddress; onChange: (a: KitAddress) => void; fieldClass?: string; idPrefix?: string; disabled?: boolean; /** العنوان كله اختياري (لا نمنع إرسال النموذج الحاوي) */ optional?: boolean }) {
  const { t, pick } = useI18n();
  const set = (p: Partial<KitAddress>) => onChange({ ...value, ...p });
  const shortBad = !!value.shortAddress && !SHORT_ADDRESS_RE.test(value.shortAddress.replace(/\s/g, "").toUpperCase());

  const lbl = "block text-xs text-paper-600 mb-1";

  return (
    <fieldset disabled={disabled} className="space-y-3" data-testid="address-form">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={lbl}>{t("الدولة", "Country")}</span>
          <select id={`${idPrefix}-country`} value={value.country} onChange={(e) => set({ country: e.target.value })} className={fieldClass} autoComplete="country">
            {COUNTRIES.map((c) => <option key={c.iso} value={c.iso}>{pick(c.name)}</option>)}
          </select>
        </label>
        <label className="block">
          <span className={lbl}>{t("المدينة", "City")} {!optional && <span className="text-accent2-ink">*</span>}</span>
          <input id={`${idPrefix}-city`} value={value.city} onChange={(e) => set({ city: e.target.value })} maxLength={60} required={!optional} className={fieldClass} autoComplete="address-level2" />
        </label>
        <label className="block">
          <span className={lbl}>{t("الحي", "District")}</span>
          <input id={`${idPrefix}-district`} value={value.district} onChange={(e) => set({ district: e.target.value })} maxLength={80} className={fieldClass} autoComplete="address-level3" />
        </label>
        <label className="block">
          <span className={lbl}>{t("الشارع", "Street")}</span>
          <input id={`${idPrefix}-street`} value={value.street} onChange={(e) => set({ street: e.target.value })} maxLength={120} className={fieldClass} autoComplete="address-line1" />
        </label>
        <label className="block">
          <span className={lbl}>{t("رقم المبنى", "Building no.")}</span>
          <input id={`${idPrefix}-building`} value={value.building} onChange={(e) => set({ building: e.target.value })} maxLength={40} dir="ltr" className={fieldClass} />
        </label>
        <label className="block">
          <span className={lbl}>{t("الرمز البريدي", "Postal code")}</span>
          <input id={`${idPrefix}-postal`} value={value.postal} onChange={(e) => set({ postal: e.target.value })} maxLength={12} dir="ltr" inputMode="numeric" className={fieldClass} autoComplete="postal-code" />
        </label>
      </div>
      {value.country === "SA" && (
        <label className="block">
          <span className={lbl}>{t("العنوان الوطني المختصر (اختياري)", "National short address (optional)")}</span>
          <input id={`${idPrefix}-short`} value={value.shortAddress} onChange={(e) => set({ shortAddress: e.target.value.toUpperCase() })} maxLength={9} dir="ltr" placeholder="RRRD2929" aria-invalid={shortBad} className={`${fieldClass} font-mono ${shortBad ? "!border-red-500" : ""}`} />
          <span className={`block mt-1 text-xs ${shortBad ? "text-red-700" : "text-paper-500"}`}>{t("أربعة أحرف ثم أربعة أرقام، تجده في تطبيق «توكلنا» أو «سبل».", "Four letters then four digits; find it in Tawakkalna or SPL.")}</span>
        </label>
      )}
      <label className="block">
        <span className={lbl}>{t("وصف إضافي للمندوب", "Extra directions for the courier")}</span>
        <textarea id={`${idPrefix}-extra`} value={value.address} onChange={(e) => set({ address: e.target.value })} rows={2} maxLength={300} className={fieldClass} placeholder={t("معلم قريب، رقم الشقة، أنسب وقت للاستلام", "Nearby landmark, flat number, best delivery time")} />
      </label>

      <GeoPicker value={value} onChange={(g) => set(g)} fieldClass={fieldClass} />
    </fieldset>
  );
}

type Geo = { lat?: number | null; lng?: number | null };
/** موقع التسليم على الخريطة: بزر «موقعي الحالي» أو بلصق رابط الخرائط أو الإحداثيات */
export function GeoPicker({ value, onChange, fieldClass = publicField }: { value: Geo; onChange: (g: { lat: number | null; lng: number | null }) => void; fieldClass?: string }) {
  const { t } = useI18n();
  const [geo, setGeo] = useState<"idle" | "busy" | "denied" | "unsupported">("idle");
  const [link, setLink] = useState("");
  const [linkBad, setLinkBad] = useState(false);
  const set = onChange;
  const locate = () => {
    if (!("geolocation" in navigator)) {
      setGeo("unsupported");
      return;
    }
    setGeo("busy");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        set({ lat: Math.round(pos.coords.latitude * 1e6) / 1e6, lng: Math.round(pos.coords.longitude * 1e6) / 1e6 });
        setGeo("idle");
      },
      () => setGeo("denied"),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  };
  const applyLink = () => {
    const p = parseLatLng(link);
    setLinkBad(!p);
    if (p) {
      set(p);
      setLink("");
    }
  };
  return (
    <div className="rounded-xl bg-paper-50 border border-paper-200 p-3.5" data-testid="address-geo">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-ink-900 flex items-center gap-1.5">
            <i className={hasGeo(value) ? "ri-map-pin-2-fill text-[#1F6B4F]" : "ri-map-pin-line text-paper-500"} aria-hidden="true"></i>
            {hasGeo(value) ? t("الموقع محدد على الخريطة", "Location pinned on the map") : t("حدّد الموقع على الخريطة ليصل المندوب بلا اتصال", "Pin the location so the courier arrives without calling")}
          </p>
          <button type="button" onClick={locate} disabled={geo === "busy"} className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 text-white px-3.5 py-2 text-xs hover:bg-ink-700 disabled:opacity-60" data-testid="use-my-location">
            <i className={geo === "busy" ? "ri-loader-4-line animate-spin" : "ri-focus-3-line"} aria-hidden="true"></i>
            {hasGeo(value) ? t("حدّث بموقعي الحالي", "Update to my location") : t("استخدم موقعي الحالي", "Use my current location")}
          </button>
        </div>
        {hasGeo(value) && (
          <p className="mt-2 text-xs text-paper-600 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span dir="ltr" className="font-mono" data-testid="address-coords">{value.lat}, {value.lng}</span>
            <a href={mapsLink(value)} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{t("افتح في الخرائط", "Open in Maps")}</a>
            <button type="button" onClick={() => set({ lat: null, lng: null })} className="underline underline-offset-4 text-paper-500">{t("أزل الموقع", "Remove pin")}</button>
          </p>
        )}
        {(geo === "denied" || geo === "unsupported") && <p role="alert" className="mt-2 text-xs text-red-700">{geo === "denied" ? t("لم يسمح المتصفح بقراءة موقعك. الصق رابط الموقع من تطبيق الخرائط بدلًا من ذلك.", "The browser didn't share your location. Paste a Maps link instead.") : t("هذا المتصفح لا يدعم تحديد الموقع. الصق رابط الموقع من تطبيق الخرائط.", "This browser can't read location. Paste a Maps link instead.")}</p>}
        <div className="mt-3 flex gap-2">
          <label className="flex-1 min-w-0">
            <span className="sr-only">{t("رابط الموقع من الخرائط", "Maps link")}</span>
            <input value={link} onChange={(e) => { setLink(e.target.value); setLinkBad(false); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyLink(); } }} dir="ltr" placeholder={t("أو الصق رابط الموقع من خرائط Google", "Or paste a Google Maps link")} aria-invalid={linkBad} className={`${fieldClass} !py-2 text-xs`} data-testid="maps-link" />
          </label>
          <button type="button" onClick={applyLink} disabled={!link.trim()} className="rounded-full border border-paper-300 px-3.5 text-xs text-ink-900 hover:border-ink-900 disabled:opacity-50" data-testid="maps-link-apply">{t("استخدمه", "Use")}</button>
        </div>
        {linkBad && <p role="alert" className="mt-1.5 text-xs text-red-700">{t("لم نجد إحداثيات في الرابط. افتح الموقع في الخرائط وانسخ الرابط الكامل، أو اكتب الإحداثيات مثل 24.7136, 46.6753.", "No coordinates found in that link. Copy the full Maps link, or type coordinates like 24.7136, 46.6753.")}</p>}
      </div>
  );
}
