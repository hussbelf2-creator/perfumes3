import { useState } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "@/i18n/context";
import { FONTS } from "./label/fonts";
import { FOILS, type Foil, type FontId } from "./label/types";
import { DEFAULT_BRAND, type BrandKit } from "./brand";
import { Seg } from "./ui";

// بطاقة الهوية: شعار ولونان وخط وتشطيب. تُطبَّق على الملصق أو العلبة بضغطة،
// أو يُسلَّم التصميم لمصمم هوية من المنصة مع الحالة الحالية للاستوديو.

async function readLogo(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = Math.min(1, 600 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

const PALETTES: { ar: string; en: string; primary: string; secondary: string; foil: Foil }[] = [
  { ar: "ليل وذهب", en: "Night & gold", primary: "#15101D", secondary: "#D4A853", foil: "gold" },
  { ar: "عاج وزيتوني", en: "Ivory & olive", primary: "#F1EADB", secondary: "#4F5B3A", foil: "none" },
  { ar: "نبيذي ونحاس", en: "Burgundy & copper", primary: "#4A1C2B", secondary: "#C27C55", foil: "copper" },
  { ar: "رملي وفضي", en: "Sand & silver", primary: "#D9C7A7", secondary: "#2E2A26", foil: "silver" },
  { ar: "زمردي وذهب", en: "Emerald & gold", primary: "#0F3B2E", secondary: "#D1A95B", foil: "gold" },
  { ar: "مرجاني وحبر", en: "Coral & ink", primary: "#E4612E", secondary: "#15101D", foil: "none" },
];

export default function IdentityCard({ brand, onChange, onApply, target, designerLink }: { brand: BrandKit | null; onChange: (b: BrandKit | null) => void; onApply: (b: BrandKit) => void; target: "label" | "box"; designerLink: string }) {
  const { t, pick } = useI18n();
  const [err, setErr] = useState("");
  const b = brand ?? DEFAULT_BRAND;
  const set = (patch: Partial<BrandKit>) => onChange({ ...b, ...patch });
  return (
    <div className="space-y-3" data-testid="identity-card">
      <div className="flex items-center gap-3">
        <label className="relative w-14 h-14 shrink-0 rounded-xl border border-dashed border-paper-300 bg-[repeating-conic-gradient(#f3f0ea_0_25%,#fff_0_50%)] bg-[length:12px_12px] grid place-items-center cursor-pointer overflow-hidden" title={t("ارفع الشعار", "Upload logo")}>
          {b.logo ? <img src={b.logo} alt={t("شعار الهوية", "Brand logo")} className="w-full h-full object-contain" /> : <i className="ri-image-add-line text-xl text-paper-500" aria-hidden="true"></i>}
          <input
            type="file"
            accept="image/png,image/svg+xml,image/jpeg,image/webp"
            className="sr-only"
            aria-label={t("شعار الهوية", "Brand logo")}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 4 * 1024 * 1024) return setErr(t("الملف أكبر من 4 ميغابايت.", "File is larger than 4 MB."));
              try {
                set({ logo: await readLogo(f) });
                setErr("");
              } catch {
                setErr(t("تعذّرت قراءة الصورة.", "Couldn't read the image."));
              }
            }}
          />
        </label>
        <div className="flex-1 min-w-0">
          <input value={b.name} maxLength={40} dir="auto" onChange={(e) => set({ name: e.target.value })} placeholder={t("اسم الدار", "Brand name")} className="w-full bg-white border border-paper-200 focus:border-ink-900 rounded-xl px-3 py-2 text-sm outline-none" aria-label={t("اسم الدار", "Brand name")} />
          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-paper-600">
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input type="color" value={b.primary} onChange={(e) => set({ primary: e.target.value })} className="w-6 h-6 rounded-full border border-paper-200 p-0" aria-label={t("اللون الأساسي", "Primary colour")} />
              {t("أساسي", "Primary")}
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input type="color" value={b.secondary} onChange={(e) => set({ secondary: e.target.value })} className="w-6 h-6 rounded-full border border-paper-200 p-0" aria-label={t("اللون الثانوي", "Secondary colour")} />
              {t("ثانوي", "Secondary")}
            </label>
            {b.logo && <button type="button" onClick={() => set({ logo: null })} className="ms-auto text-red-700 underline underline-offset-2">{t("إزالة الشعار", "Remove logo")}</button>}
          </div>
        </div>
      </div>
      {err && <p role="alert" className="text-xs text-red-700">{err}</p>}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("لوحات ألوان جاهزة", "Ready palettes")}>
        {PALETTES.map((p) => (
          <button key={p.en} type="button" onClick={() => set({ primary: p.primary, secondary: p.secondary, foil: p.foil })} className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] ${b.primary === p.primary && b.secondary === p.secondary ? "border-ink-900 bg-ink-900 text-white" : "border-paper-200 bg-white text-paper-700 hover:border-ink-900"}`}>
            <span className="w-3.5 h-3.5 rounded-full border border-black/10" style={{ background: p.primary }} aria-hidden="true" />
            <span className="w-3.5 h-3.5 rounded-full border border-black/10 -ms-2.5" style={{ background: p.secondary }} aria-hidden="true" />
            {t(p.ar, p.en)}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="block flex-1 min-w-[9rem]">
          <span className="block text-[11px] text-paper-500 mb-1">{t("خط الهوية", "Brand typeface")}</span>
          <select value={b.font} onChange={(e) => set({ font: e.target.value as FontId })} className="w-full bg-white border border-paper-200 focus:border-ink-900 rounded-xl px-3 py-2 text-sm outline-none">
            {(Object.keys(FONTS) as FontId[]).map((f) => <option key={f} value={f}>{pick(FONTS[f].name)}</option>)}
          </select>
        </label>
        <Seg small label={t("التشطيب المعدني", "Metallic finish")} value={b.foil} onChange={(foil) => set({ foil })} options={[{ id: "none" as Foil, label: t("حبر", "Ink") }, ...(Object.keys(FOILS) as Exclude<Foil, "none">[]).map((f) => ({ id: f as Foil, label: pick(FOILS[f].name), swatch: FOILS[f].color }))]} />
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        <button type="button" onClick={() => { onChange(b); onApply(b); }} className="rounded-full bg-ink-900 text-white px-4 py-2 text-xs inline-flex items-center gap-1.5" data-testid="apply-brand">
          <i className="ri-palette-line" aria-hidden="true"></i>
          {target === "label" ? t("طبّق الهوية على الملصق", "Apply identity to the label") : t("طبّق الهوية على العلبة", "Apply identity to the box")}
        </button>
        <Link to={designerLink} className="rounded-full border border-paper-300 bg-white px-4 py-2 text-xs text-ink-900 inline-flex items-center gap-1.5" data-testid="designer-link">
          <i className="ri-user-star-line" aria-hidden="true"></i>
          {t("استعن بمصمم هوية من المنصة", "Hire a platform identity designer")}
        </Link>
      </div>
      <p className="text-[11px] text-paper-500 leading-[1.6]">{t("الهوية تُحفظ في جهازك وتُرفق مع طلبك: إن صممتها بنفسك طُبّقت هنا، وإن اخترت مصمماً وصلته مع تصميمك الحالي ليكمل عليه.", "Your identity is kept on this device and attached to your request: apply it yourself here, or hand it to a designer along with the current design.")}</p>
    </div>
  );
}
