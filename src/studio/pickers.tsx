import { useI18n } from "@/i18n/context";
import ProfileIcon from "./ProfileIcon";
import type { PackModel } from "./types";
import { Swatch } from "./ui";

// منتقيات مشتركة بين الوضع المبسّط والمتقدم في الاستوديو

export function Swatches<T extends { id: string; swatch?: string; color?: string; name: { ar: string; en: string } }>({ items, value, onChange, label }: { items: T[]; value: string; onChange: (id: string) => void; label: string }) {
  const { pick } = useI18n();
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
      {items.map((x) => {
        const bg = x.swatch ?? (x.color === "transparent" ? "repeating-linear-gradient(45deg,#fff 0 4px,#eee 4px 8px)" : x.color ?? "#ccc");
        return <Swatch key={x.id} selected={x.id === value} onSelect={() => onChange(x.id)} bg={bg} label={pick(x.name)} />;
      })}
    </div>
  );
}

export function ModelPicker({ items, value, onChange, cap, label, allowNone }: { items: PackModel[]; value?: string; onChange: (id: string) => void; cap?: PackModel | null; label: string; allowNone?: string }) {
  const { pick, t, num } = useI18n();
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-3 sm:grid-cols-4 gap-2">
      {allowNone && (
        <button type="button" role="radio" aria-checked={!value} onClick={() => onChange("")} className={`rounded-2xl border p-2 text-xs flex flex-col items-center justify-center gap-1 min-h-[7.5rem] ${!value ? "border-ink-900 bg-white" : "border-paper-200 bg-white/60 text-paper-500"}`}>
          <i className="ri-forbid-line text-xl" aria-hidden="true"></i>
          {allowNone}
        </button>
      )}
      {items.map((m) => {
        const on = m.id === value;
        return (
          <button key={m.id} type="button" role="radio" aria-checked={on} onClick={() => onChange(m.id)} className={`rounded-2xl border p-2 flex flex-col items-center gap-1 transition-colors ${on ? "border-ink-900 bg-white text-ink-900" : "border-paper-200 bg-white/60 text-paper-500 hover:border-paper-400"}`}>
            <ProfileIcon model={m} cap={m.kind === "bottle" ? cap : undefined} className="h-16 w-full" />
            <span className="text-[11px] leading-tight text-center text-ink-900">
              {pick(m.name)}
              {m.source === "ai" && <span className="ms-1 rounded-full bg-accent2-soft text-accent2-ink px-1.5 text-[9px] align-middle">3D AI</span>}
            </span>
            {m.capacityMl ? <span className="text-[10px] text-paper-500">{t(`${num(m.capacityMl)} مل`, `${m.capacityMl} ml`)}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

