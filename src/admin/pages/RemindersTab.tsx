import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/i18n/context";
import { supabase } from "@/lib/supabase";
import type { OpsDoc } from "@/cms/schema";
import { projectsRepo, type ProjectsData } from "@/projects/repo";
import { usePActor } from "@/projects/useProjects";
import { kitsRepo } from "@/kits/repo";
import type { KitOrder } from "@/kits/types";
import { REMINDER_BOUNDS, REMINDER_KIND_LABELS, dueReminders, type ReminderConfig, type ReminderKind } from "@/reminders/logic";
import { toRData } from "@/reminders/data";
import { Card, numFieldCls, useFormat } from "../components/ui";

// التذكيرات الآلية في مركز التحكم: المهل وعدد المحاولات، ومعاينة ما يستحق التذكير الآن، وسجل ما أُرسل.

type Num = Exclude<keyof ReminderConfig, "enabled">;
const FIELDS: [Num, { ar: string; en: string }, { ar: string; en: string }][] = [
  ["quoteDays", { ar: "عرض سعر بلا رد", en: "Quote without a reply" }, { ar: "يوم بعد الإرسال", en: "days after sending" }],
  ["depositDays", { ar: "عرض معتمد لم يُدفع عربونه", en: "Approved quote, deposit unpaid" }, { ar: "يوم بعد الاعتماد", en: "days after approval" }],
  ["contractDays", { ar: "عقد لم يوقّعه العميل", en: "Contract not signed by the client" }, { ar: "يوم بعد الإرسال", en: "days after sending" }],
  ["designDays", { ar: "تصميم ينتظر الاعتماد", en: "Design awaiting approval" }, { ar: "يوم بعد الإرسال", en: "days after sending" }],
  ["addressDays", { ar: "عنوان عينات لم يؤكَّد", en: "Sample address not confirmed" }, { ar: "يوم بعد إنشاء الشحنة", en: "days after the shipment is created" }],
  ["ratingDays", { ar: "عينات لم تُقيَّم، أو قُبلت ولم تُعتمد تركيبتها", en: "Samples unrated, or accepted without an approved formula" }, { ar: "يوم بعد الوصول", en: "days after delivery" }],
  ["dueBeforeDays", { ar: "دفعة لها تاريخ استحقاق", en: "Installment with a due date" }, { ar: "يوم قبل الاستحقاق", en: "days before the due date" }],
  ["repeatDays", { ar: "إعادة التذكير", en: "Repeat the reminder" }, { ar: "يوم بين المحاولة والتالية", en: "days between attempts" }],
  ["maxRepeats", { ar: "أقصى عدد محاولات", en: "Maximum attempts" }, { ar: "محاولة لكل تذكير", en: "attempts per reminder" }],
];

export default function RemindersTab({ doc, edit, editable }: { doc: OpsDoc; edit: (d: OpsDoc) => void; editable: boolean }) {
  const { t, pick, num } = useI18n();
  const f = useFormat();
  const actor = usePActor();
  const cfg = doc.reminders;
  const [data, setData] = useState<ProjectsData | null>(null);
  const [kits, setKits] = useState<KitOrder[]>([]);
  const [log, setLog] = useState<{ key: string; kind: string; audience: string; subject: string; createdAt: string }[] | null>(null);
  useEffect(() => {
    if (!actor) return;
    void projectsRepo.load(actor).then(setData).catch(() => setData(null));
    void kitsRepo.list(actor).then(setKits).catch(() => setKits([]));
    if (supabase)
      void supabase.from("reminder_log").select("key,kind,audience,subject,created_at").order("created_at", { ascending: false }).limit(30).then(({ data: rows }) => setLog((rows ?? []).map((r) => ({ key: String(r.key), kind: String(r.kind), audience: String(r.audience), subject: String(r.subject), createdAt: String(r.created_at) }))));
  }, [actor]);
  const due = useMemo(() => (data ? dueReminders(toRData(data, kits), { ...cfg, enabled: true }) : []), [data, kits, cfg]);
  const set = (k: Num, v: number) => edit({ ...doc, reminders: { ...cfg, [k]: Math.min(REMINDER_BOUNDS[k][1], Math.max(REMINDER_BOUNDS[k][0], Math.round(v) || 0)) } });

  return (
    <div className="space-y-4" data-testid="settings-reminders">
      <div className="rounded-2xl bg-white border border-paper-200 px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-ink-900">{t("التذكيرات الآلية للعميل", "Automatic client reminders")}</p>
          <p className="text-xs text-paper-500 mt-0.5 leading-[1.7]">{t("كل صباح يُحسب ما ينتظر العميل ولم يتحرك، ويصله تذكير بالبريد وواتساب مرة واحدة لكل محاولة. الدفعة المتأخرة تُسجَّل أيضًا مهمة تحصيل للفريق.", "Every morning the system works out what is waiting on the client and sends one email and WhatsApp reminder per attempt. An overdue installment also becomes a collection task for the team.")}</p>
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-ink-900">
          <input type="checkbox" checked={cfg.enabled} disabled={!editable} onChange={(e) => edit({ ...doc, reminders: { ...cfg, enabled: e.target.checked } })} className="w-4 h-4 accent-ink-900" data-testid="reminders-enabled" />
          {cfg.enabled ? t("مفعّلة", "On") : t("موقوفة", "Off")}
        </label>
      </div>

      <Card title={t("المهل وعدد المحاولات", "Delays and attempts")}>
        <ul className="px-5 pb-4 divide-y divide-paper-100">
          {FIELDS.map(([k, label, unit]) => (
            <li key={k} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-ink-900 min-w-0">{pick(label)}</span>
              <span className="inline-flex items-center gap-2 text-paper-600">
                <input type="number" min={REMINDER_BOUNDS[k][0]} max={REMINDER_BOUNDS[k][1]} value={cfg[k]} disabled={!editable} onChange={(e) => set(k, Number(e.target.value))} className={numFieldCls} aria-label={pick(label)} data-testid={`reminder-${k}`} />
                <span className="text-xs">{pick(unit)}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title={t(`يستحق التذكير الآن (${num(due.length)})`, `Due for a reminder now (${due.length})`)}>
        {due.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-paper-500" data-testid="reminders-none">{t("لا شيء متأخر عند العملاء بهذه المهل.", "Nothing is overdue with clients at these delays.")}</p>
        ) : (
          <ul className="px-5 pb-4 divide-y divide-paper-100" data-testid="reminders-due">
            {due.map((r) => (
              <li key={r.key} className="py-2.5 text-sm" data-kind={r.kind}>
                <p className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs ${r.audience === "team" ? "bg-[#FBEFE6] text-[#9A4B12]" : "bg-paper-100 text-paper-700"}`}>{pick(REMINDER_KIND_LABELS[r.kind as ReminderKind])}</span>
                  <span className="text-ink-900">{r.subject}</span>
                  {r.step > 1 && <span className="text-xs text-paper-500">{t(`المحاولة ${num(r.step)}`, `Attempt ${r.step}`)}</span>}
                </p>
                <p className="mt-1 text-xs text-paper-500">{r.audience === "team" ? t("مهمة للفريق", "Team task") : <span dir="ltr">{r.email}</span>}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="px-5 pb-4 text-xs text-paper-500">{supabase ? t("تُرسل تلقائيًا في التشغيل اليومي (9 صباحًا بتوقيت الرياض)، ولا تتكرر المحاولة نفسها.", "Sent automatically in the daily run (9:00 Riyadh time); the same attempt is never repeated.") : t("معاينة فقط: في النسخة التجريبية لا تُرسل رسائل.", "Preview only: the demo build sends no messages.")}</p>
      </Card>

      {log && (
        <Card title={t("آخر ما أُرسل", "Recently sent")}>
          {log.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-paper-500">{t("لم يُرسل تذكير بعد.", "No reminders sent yet.")}</p>
          ) : (
            <ul className="px-5 pb-4 divide-y divide-paper-100" data-testid="reminders-log">
              {log.map((r) => (
                <li key={r.key} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-ink-900 min-w-0">{r.subject}</span>
                  <span className="text-xs text-paper-500 whitespace-nowrap">{f.ago(r.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
