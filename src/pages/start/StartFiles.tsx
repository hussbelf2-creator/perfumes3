import { useRef, useState } from "react";
import { useI18n } from "@/i18n/context";
import { ATTACHMENT_ACCEPT, MAX_ATTACHMENTS, attachmentIcon, fileSize } from "@/creatives/images";
import { dropPending, listPending, stashFile, type PendingFile } from "@/projects/pendingFiles";

// مرفقات الطلب في «ابدأ مسارك»: مراجع وصور وملفات تُحفظ في المتصفح وتنتقل إلى ملاحظات المشروع عند فتح الحساب.
export default function StartFiles() {
  const { t, num } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<PendingFile[]>(listPending);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const add = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    setErr("");
    for (const f of Array.from(list)) {
      try {
        setFiles(await stashFile(f));
      } catch (e) {
        const code = e instanceof Error ? e.message : "";
        setErr(code === "too_many" ? t(`${num(MAX_ATTACHMENTS)} مرفقات كحد أقصى.`, `Up to ${MAX_ATTACHMENTS} attachments.`) : code === "too_large" ? t(`«${f.name}» أكبر من 15 م.ب.`, `“${f.name}” is over 15 MB.`) : code === "bad_type" ? t(`نوع «${f.name}» غير مقبول. المقبول: صور، PDF، Word، Excel، PowerPoint، نص، ZIP.`, `“${f.name}” isn't an accepted type. Accepted: images, PDF, Word, Excel, PowerPoint, text, ZIP.`) : t(`تعذّر حفظ «${f.name}».`, `Couldn't save “${f.name}”.`));
        if (code === "too_many") break;
      }
    }
    setBusy(false);
    if (input.current) input.current.value = "";
  };
  return (
    <div data-testid="start-files">
      <p className="block text-sm text-paper-600 mb-2">{t("مرفقات (اختياري): صور مرجعية، شعار، مواصفات", "Attachments (optional): reference images, logo, specs")}</p>
      <input ref={input} type="file" multiple accept={ATTACHMENT_ACCEPT} className="sr-only" onChange={(e) => void add(e.target.files)} disabled={busy} aria-label={t("أرفق ملفات", "Attach files")} data-testid="start-files-input" />
      <button type="button" onClick={() => input.current?.click()} disabled={busy || files.length >= MAX_ATTACHMENTS} className="inline-flex items-center gap-1.5 rounded-full border border-paper-300 bg-white px-4 py-2.5 text-sm text-ink-900 hover:border-ink-900 disabled:opacity-50">
        <i className={busy ? "ri-loader-4-line animate-spin" : "ri-attachment-2"} aria-hidden="true"></i>
        {t("أرفق ملفًا أو صورة", "Attach a file or image")}
      </button>
      {files.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2" data-testid="start-files-list">
          {files.map((f) => (
            <li key={f.key} className="inline-flex items-center gap-2 rounded-lg border border-paper-200 bg-paper-50 ps-3 pe-1 py-1 text-xs text-ink-900 max-w-full">
              <i className={`${attachmentIcon(f)} shrink-0`} aria-hidden="true"></i>
              <span className="truncate max-w-[10rem]" dir="auto">{f.name}</span>
              <span className="text-paper-500" dir="ltr">{fileSize(f.size)}</span>
              <button type="button" onClick={() => setFiles(dropPending(f.key))} className="w-6 h-6 rounded-full hover:bg-paper-200" aria-label={t(`أزل ${f.name}`, `Remove ${f.name}`)}><i className="ri-close-line" aria-hidden="true"></i></button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-paper-500">{t("تظهر في ملاحظات مشروعك فور فتح حسابك، ويراها فريق المصنع.", "They appear in your project notes as soon as your account opens, for the factory team to see.")}</p>
      {err && <p role="alert" className="mt-1.5 text-xs text-red-700">{err}</p>}
    </div>
  );
}
