import { useI18n } from "@/i18n/context";
import { KIT_FLOW, KIT_STATUS_HINTS, KIT_STATUS_ICONS, KIT_STATUS_LABELS, kitProgress, type KitStatus } from "./types";

// عناصر مشتركة بين لوحة الإدارة وحساب العميل والصفحة العامة

export const KIT_STATUS_CLS: Record<KitStatus, string> = {
  new: "bg-paper-100 text-paper-700",
  preparing: "bg-accent2/15 text-accent2-ink",
  shipped: "bg-ink-900 text-white",
  delivered: "bg-[#1F7A5C]/10 text-[#1F7A5C]",
  returned: "bg-red-50 text-red-700",
};

export function KitStatusBadge({ status, className = "" }: { status: KitStatus; className?: string }) {
  const { pick } = useI18n();
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs whitespace-nowrap ${KIT_STATUS_CLS[status]} ${className}`} data-status={status}>
      <i className={KIT_STATUS_ICONS[status]} aria-hidden="true"></i>
      {pick(KIT_STATUS_LABELS[status])}
    </span>
  );
}

/** شريط تقدّم بأربع محطات: جديد → قيد التجهيز → شُحن → سُلِّم */
export function KitProgress({ status, dates, compact = false }: { status: KitStatus; dates?: Partial<Record<KitStatus, string | null>>; compact?: boolean }) {
  const { pick, lang, t } = useI18n();
  const { step, total, pct } = kitProgress(status);
  const locale = lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB";
  const returned = status === "returned";
  return (
    <div>
      <div className="h-1.5 rounded-full bg-paper-200 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={step + 1} aria-label={t("تقدّم الشحنة", "Shipment progress")}>
        <div className={`h-full rounded-full transition-[width] duration-500 ${returned ? "bg-red-400" : "bg-accent3"}`} style={{ width: `${pct}%` }} />
      </div>
      <ol className={`mt-2 grid grid-cols-4 gap-1 ${compact ? "text-[11px]" : "text-xs"}`}>
        {KIT_FLOW.map((s, i) => {
          const done = i <= step;
          const d = dates?.[s];
          return (
            <li key={s} className={`min-w-0 ${done ? "text-ink-900" : "text-paper-400"}`}>
              <span className="flex items-center gap-1">
                <i className={`${done ? KIT_STATUS_ICONS[s] : "ri-checkbox-blank-circle-line"} shrink-0`} aria-hidden="true"></i>
                <span className="truncate">{pick(KIT_STATUS_LABELS[s])}</span>
              </span>
              {!compact && d && done && <span className="block text-[11px] text-paper-500 ps-5" dir="ltr" style={{ textAlign: "start" }}>{new Date(d).toLocaleDateString(locale, { day: "numeric", month: "short" })}</span>}
            </li>
          );
        })}
      </ol>
      {returned && <p className="mt-2 text-xs text-red-700">{pick(KIT_STATUS_HINTS.returned)}</p>}
    </div>
  );
}

/** السجل الزمني للانتقالات */
export function KitTimeline({ history }: { history: { status: KitStatus; at: string }[] }) {
  const { pick, lang } = useI18n();
  const locale = lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB";
  return (
    <ol className="space-y-2">
      {[...history].reverse().map((h, i) => (
        <li key={`${h.status}-${h.at}-${i}`} className="flex items-start gap-3 text-sm">
          <span className={`mt-0.5 w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-xs ${KIT_STATUS_CLS[h.status]}`} aria-hidden="true"><i className={KIT_STATUS_ICONS[h.status]}></i></span>
          <span className="min-w-0">
            <span className="block text-ink-900">{pick(KIT_STATUS_LABELS[h.status])}</span>
            <time className="block text-xs text-paper-500" dateTime={h.at}>{new Date(h.at).toLocaleString(locale, { timeZone: "Asia/Riyadh", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</time>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** رابط التتبع الخارجي إن وُجد */
export function TrackingLink({ url, no, carrier, className = "" }: { url: string; no: string; carrier: string; className?: string }) {
  const { t } = useI18n();
  if (!url && !no) return null;
  const label = [carrier, no].filter(Boolean).join(" · ");
  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 underline underline-offset-4 ${className}`} dir="ltr">
      <i className="ri-external-link-line" aria-hidden="true"></i>
      {label || t("تتبّع الشحنة", "Track parcel")}
    </a>
  ) : (
    <span className={className} dir="ltr">{label}</span>
  );
}
