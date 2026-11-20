// إعادة الطلب بنقرة: مشروع جديد من مشروع سبق التعاقد عليه، بتركيبته المعتمدة ومسودة عرض وعقد بالكمية الجديدة.
// نفس قواعد reorder_project في supabase/schema.sql.
import type { Installment } from "@/contracts/finance";
import type { Contract, SpecItem } from "@/contracts/types";
import type { Quote, QuoteLine } from "./types";

export interface ReorderInput {
  /** الكمية الجديدة (فارغة = الكميات نفسها) */
  qty: number | null;
  /** أقصى موعد للتسليم YYYY-MM-DD */
  due: string | null;
  note: string;
}
export const REORDER_LIMITS = { maxQty: 1_000_000, note: 1000, pending: 2 } as const;

/** العرض والعقد اللذان يُبنى عليهما: آخر عرض مدفوع (وإلا معتمد)، وآخر عقد وقّعه العميل */
export function reorderSource(quotes: Quote[], contracts: Contract[]) {
  const byDate = <T extends { createdAt: string }>(a: T, b: T) => b.createdAt.localeCompare(a.createdAt);
  const quote = [...quotes].filter((q) => q.status === "paid").sort(byDate)[0] ?? [...quotes].filter((q) => q.status === "accepted").sort(byDate)[0] ?? null;
  const contract = [...contracts].filter((c) => c.status === "signed" || c.status === "client_signed").sort(byDate)[0] ?? null;
  return { quote, contract };
}
/** متاحة لمشروع له عقد موقّع أو عرض مدفوع/معتمد */
export const reorderEligible = (quotes: Quote[], contracts: Contract[]) => {
  const s = reorderSource(quotes, contracts);
  return !!(s.quote || s.contract);
};

/** الكمية المرجعية: الأكثر تكراراً بين الكميات الأكبر من واحد، وعند التعادل الأكبر */
export function referenceQty(values: number[]): number | null {
  const count = new Map<number, number>();
  for (const v of values) if (v > 1) count.set(v, (count.get(v) ?? 0) + 1);
  let best: number | null = null;
  for (const [v, n] of count) if (best === null || n > count.get(best)! || (n === count.get(best)! && v > best)) best = v;
  return best;
}
/** البنود بالكمية الجديدة: تتغير البنود التي كميتها = المرجعية، وتبقى بنود المرة الواحدة كما هي ليراجعها الفريق */
export const scaleLines = (lines: QuoteLine[], ref: number | null, qty: number | null): QuoteLine[] => lines.map((l) => (qty && ref && l.qty === ref ? { ...l, qty } : { ...l }));
/** المواصفات بالكمية الجديدة؛ صور وملفات المشروع الأصلي لا تُنقل (مجلد تخزين آخر) */
export const scaleSpecs = (specs: SpecItem[], ref: number | null, qty: number | null): SpecItem[] => specs.map((s) => ({ ...s, images: [], files: [], qty: qty && ref && s.qty === ref ? qty : s.qty }));

const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
/** جدول الدفعات للعقد الجديد: الدفعة الأولى تطابق عربون العرض الجديد، والأخيرة تأخذ الباقي، وتواريخ الاستحقاق القديمة تسقط */
export function reorderSchedule(schedule: Installment[], total: number, deposit: number | null): Installment[] {
  const rows = schedule.map(({ dueDate: _drop, ...r }) => ({ ...r }));
  if (!rows.length || deposit == null || !(total > 0) || !(deposit > 0)) return rows;
  const pct = r6((deposit / total) * 100);
  if (pct >= 100) return [{ ...rows[0], percent: 100 }];
  const middle = rows.slice(1, -1);
  const last = r6(100 - pct - middle.reduce((n, r) => n + r.percent, 0));
  if (rows.length >= 2 && last > 0) return [{ ...rows[0], percent: pct }, ...middle, { ...rows[rows.length - 1], percent: last }];
  return [{ ...rows[0], percent: pct }, { id: "rest", label: "الدفعة النهائية", percent: r6(100 - pct), due: "قبل التسليم أو الشحن" }];
}

const SUFFIX = / · إعادة طلب \d+$/;
export const reorderBase = (title: string) => title.replace(SUFFIX, "");
export const reorderTitle = (title: string, n: number) => `${reorderBase(title).slice(0, 100)} · إعادة طلب ${n}`;

export function reorderProblem(i: ReorderInput, today = new Date().toISOString().slice(0, 10)): string | null {
  if (i.qty != null && !(i.qty > 0 && i.qty <= REORDER_LIMITS.maxQty)) return "reorder_qty";
  if (i.due && (!/^\d{4}-\d{2}-\d{2}$/.test(i.due) || i.due < today)) return "bad_date";
  if (i.note.length > REORDER_LIMITS.note) return "note_too_long";
  return null;
}
