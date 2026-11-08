import { useState, type ReactNode } from "react";
import { useI18n } from "@/i18n/context";

// عناصر الاختيار الموحّدة في الاستوديو: بطاقة خيار، حبّة تبديل، شريط مقسّم، وعيّنة لون.
// قاعدة واحدة: الحالة المختارة تُقرأ من حافة داكنة وشارة صح، لا من اللون وحده؛ والضغط يصغّر العنصر قليلاً.

const price = (n?: number, num?: (n: number, d?: number) => string) => (n && n > 0 ? <span className="opt-price" dir="ltr">+{num ? num(n, 2) : n.toFixed(2)}</span> : null);

export function OptionGroup({ label, children, cols = 2, className = "" }: { label?: string; children: ReactNode; cols?: 1 | 2 | 3 | 4; className?: string }) {
  return (
    <div role="group" aria-label={label} className={`opt-grid opt-grid-${cols} ${className}`}>
      {children}
    </div>
  );
}

/** بطاقة خيار: أيقونة، عنوان، ملاحظة، سعر الإضافة — للاختيار المفرد (radio) أو المتعدد (checkbox) */
export function OptionCard({ selected, onSelect, title, note, icon, extra, multi = false, disabled = false, compact = false, testId }: { selected: boolean; onSelect: () => void; title: ReactNode; note?: ReactNode; icon?: string; extra?: number; multi?: boolean; disabled?: boolean; compact?: boolean; testId?: string }) {
  const { num } = useI18n();
  return (
    <button
      type="button"
      role={multi ? "checkbox" : "radio"}
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      data-testid={testId}
      className={`opt-card ${compact ? "opt-card-compact" : ""} ${selected ? "is-on" : ""}`}
    >
      {icon && <span className="opt-icon" aria-hidden="true"><i className={icon}></i></span>}
      <span className="opt-body">
        <span className="opt-title">{title}</span>
        {note && <span className="opt-note">{note}</span>}
      </span>
      {price(extra, num)}
      <span className="opt-check" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5l3 3 6-7" /></svg></span>
    </button>
  );
}

/** حبّة تبديل للاختيار المتعدد الخفيف (تأثيرات، وسوم) */
export function Toggle({ selected, onSelect, children, extra, title }: { selected: boolean; onSelect: () => void; children: ReactNode; extra?: number; title?: string }) {
  const { num } = useI18n();
  return (
    <button type="button" role="checkbox" aria-checked={selected} title={title} onClick={onSelect} className={`opt-pill ${selected ? "is-on" : ""}`}>
      <span className="opt-pill-check" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5l3 3 6-7" /></svg></span>
      {children}
      {price(extra, num)}
    </button>
  );
}

/** شريط مقسّم للاختيار المفرد من 2 – 5 خيارات قصيرة */
export function Seg<T extends string>({ value, onChange, options, label, small = false }: { value: T; onChange: (v: T) => void; options: { id: T; label: ReactNode; swatch?: string; extra?: number }[]; label: string; small?: boolean }) {
  const { num } = useI18n();
  return (
    <div role="radiogroup" aria-label={label} className={`opt-seg ${small ? "opt-seg-sm" : ""}`}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)} className={`opt-seg-item ${value === o.id ? "is-on" : ""}`}>
          {o.swatch && <span className="opt-swatch-dot" style={{ background: o.swatch }} aria-hidden="true" />}
          {o.label}
          {price(o.extra, num)}
        </button>
      ))}
    </div>
  );
}

/** عيّنة لون/خامة دائرية بحلقة عند الاختيار */
export function Swatch({ selected, onSelect, bg, label }: { selected: boolean; onSelect: () => void; bg: string; label: string }) {
  return (
    <button type="button" role="radio" aria-checked={selected} title={label} onClick={onSelect} className={`opt-swatch ${selected ? "is-on" : ""}`}>
      <span className="opt-swatch-chip" style={{ background: bg }} aria-hidden="true" />
      <span className="opt-swatch-label">{label}</span>
    </button>
  );
}

/** عنوان قسم داخل اللوحة مع رقم خطوة اختياري وملاحظة */
export function Step({ n, title, note }: { n?: number | string; title: string; note?: string }) {
  return (
    <div className="opt-step">
      {n !== undefined && <span className="opt-step-n">{n}</span>}
      <span className="opt-step-t">{title}</span>
      {note && <span className="opt-step-note">{note}</span>}
    </div>
  );
}

// ── أكورديون موجَّه: قسم واحد مفتوح، والمغلق يعرض خلاصة اختياره، وزر «التالي» ينقل للقسم الذي يليه
export interface AccordionItem {
  id: string;
  title: string;
  /** ما اختاره العميل، يظهر في رأس القسم المغلق */
  summary?: ReactNode;
  content: ReactNode;
  done?: boolean;
  testId?: string;
}

export function Accordion({ items, initial, label }: { items: AccordionItem[]; initial?: string; label: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState<string>(initial ?? items[0]?.id);
  const idx = items.findIndex((x) => x.id === open);
  const doneCount = items.filter((x) => x.done).length;
  return (
    <div className="space-y-2" role="group" aria-label={label} data-testid="accordion">
      <p className="text-[11px] text-paper-500 flex items-center gap-2 px-1">
        <span className="inline-flex h-1.5 flex-1 rounded-full bg-paper-200 overflow-hidden" aria-hidden="true"><span className="h-full bg-ink-900 transition-all" style={{ width: `${items.length ? (doneCount / items.length) * 100 : 0}%` }} /></span>
        <span>{t(`${doneCount} من ${items.length} مكتمل`, `${doneCount} of ${items.length} complete`)}</span>
      </p>
      {items.map((it, i) => {
        const isOpen = it.id === open;
        return (
          <section key={it.id} className={`rounded-2xl border transition-colors ${isOpen ? "bg-white border-ink-900/40 shadow-sm" : "bg-white/70 border-paper-200"}`} data-testid={it.testId}>
            <button type="button" aria-expanded={isOpen} aria-controls={`acc-${it.id}`} onClick={() => setOpen(isOpen ? "" : it.id)} className="w-full flex items-center gap-3 px-4 py-3 text-start">
              <span className={`opt-step-n ${it.done && !isOpen ? "!bg-accent3" : ""}`}>{it.done && !isOpen ? <i className="ri-check-line" aria-hidden="true"></i> : i + 1}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm text-ink-900 font-medium">{it.title}</span>
                {!isOpen && it.summary && <span className="block text-[11px] text-paper-500 truncate">{it.summary}</span>}
              </span>
              <i className={`ri-arrow-down-s-line text-paper-500 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden="true"></i>
            </button>
            {isOpen && (
              <div id={`acc-${it.id}`} className="px-4 pb-4 space-y-3 panel-in">
                {it.content}
                {i < items.length - 1 && (
                  <div className="flex justify-end pt-1">
                    <button type="button" onClick={() => setOpen(items[idx + 1].id)} className="rounded-full bg-ink-900 text-white px-4 py-2 text-xs inline-flex items-center gap-1.5">
                      {t("التالي", "Next")}
                      <i className="ri-arrow-left-line flip-ltr" aria-hidden="true"></i>
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
