import { useRef, useState } from "react";
import { useI18n } from "@/i18n/context";
import { ATTACHMENT_ACCEPT, MAX_ATTACHMENTS, attachmentIcon, fileSize, resolveImage, storeAttachment, useImageSrc, type Attachment } from "@/creatives/images";

// مرفقات الملاحظات: صور ومستندات تُرفع مع الملاحظة وتُفتح من فقاعة الرسالة.

function Thumb({ a, onDark }: { a: Attachment; onDark: boolean }) {
  const { t } = useI18n();
  const url = useImageSrc(a.path);
  return (
    <a href={url ?? undefined} target="_blank" rel="noopener noreferrer" className={`block w-24 h-24 rounded-lg overflow-hidden border ${onDark ? "border-white/20 bg-white/10" : "border-paper-200 bg-paper-100"}`} title={a.name} data-testid="attachment" data-kind="image">
      {url ? <img src={url} alt={a.name} loading="lazy" className="w-full h-full object-cover" /> : <span className="w-full h-full flex items-center justify-center text-xs opacity-60">{t("صورة", "Image")}</span>}
    </a>
  );
}

function FileChip({ a, onDark }: { a: Attachment; onDark: boolean }) {
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    try {
      const url = await resolveImage(a.path);
      const el = document.createElement("a");
      el.href = url;
      el.target = "_blank";
      el.rel = "noopener noreferrer";
      // ملفات المتصفح (الوضع التجريبي) تُحمَّل باسمها الأصلي
      if (a.path.startsWith("idb:")) el.download = a.name;
      el.click();
    } catch {
      /* الملف غير متاح */
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" onClick={() => void open()} disabled={busy} className={`inline-flex items-center gap-2 max-w-full rounded-lg border px-3 py-2 text-start text-xs ${onDark ? "border-white/20 bg-white/10 hover:bg-white/20" : "border-paper-200 bg-white hover:border-ink-900"}`} title={a.name} data-testid="attachment" data-kind="file">
      <i className={`${busy ? "ri-loader-4-line animate-spin" : attachmentIcon(a)} text-base shrink-0`} aria-hidden="true"></i>
      <span className="min-w-0">
        <span className="block truncate max-w-[12rem]" dir="auto">{a.name}</span>
        <span className="block opacity-60" dir="ltr" style={{ textAlign: "start" }}>{fileSize(a.size)}</span>
      </span>
    </button>
  );
}

export function AttachmentList({ files, onDark = false }: { files: Attachment[]; onDark?: boolean }) {
  if (!files.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2" data-testid="attachments">
      {files.map((a) => (a.type.startsWith("image/") ? <Thumb key={a.path} a={a} onDark={onDark} /> : <FileChip key={a.path} a={a} onDark={onDark} />))}
    </div>
  );
}

/** زر الإرفاق + الملفات المختارة قبل الإرسال */
export function AttachPicker({ projectId, value, onChange, disabled = false }: { projectId: string; value: Attachment[]; onChange: (f: Attachment[]) => void; disabled?: boolean }) {
  const { t, num } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const add = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    setErr("");
    const next = [...value];
    for (const f of Array.from(list)) {
      if (next.length >= MAX_ATTACHMENTS) {
        setErr(t(`${num(MAX_ATTACHMENTS)} مرفقات كحد أقصى في الملاحظة.`, `Up to ${MAX_ATTACHMENTS} attachments per note.`));
        break;
      }
      try {
        next.push(await storeAttachment(f, projectId));
      } catch (e) {
        const code = e instanceof Error ? e.message : "";
        setErr(code === "too_large" ? t(`«${f.name}» أكبر من 15 م.ب.`, `“${f.name}” is over 15 MB.`) : code === "bad_type" ? t(`نوع «${f.name}» غير مقبول. المقبول: صور، PDF، Word، Excel، PowerPoint، نص، ZIP.`, `“${f.name}” isn't an accepted type. Accepted: images, PDF, Word, Excel, PowerPoint, text, ZIP.`) : t(`تعذّر رفع «${f.name}».`, `Couldn't upload “${f.name}”.`));
      }
    }
    onChange(next);
    setBusy(false);
    if (input.current) input.current.value = "";
  };
  return (
    <div className="min-w-0">
      <input ref={input} type="file" multiple accept={ATTACHMENT_ACCEPT} className="sr-only" onChange={(e) => void add(e.target.files)} disabled={disabled || busy} data-testid="attach-input" aria-label={t("أرفق ملفات", "Attach files")} />
      <button type="button" onClick={() => input.current?.click()} disabled={disabled || busy || value.length >= MAX_ATTACHMENTS} className="inline-flex items-center gap-1.5 rounded-full border border-paper-300 bg-white px-3.5 py-2 text-sm text-ink-900 hover:border-ink-900 disabled:opacity-50" data-testid="attach-button">
        <i className={busy ? "ri-loader-4-line animate-spin" : "ri-attachment-2"} aria-hidden="true"></i>
        {busy ? t("نرفع…", "Uploading…") : t("أرفق ملفًا أو صورة", "Attach a file or image")}
      </button>
      {value.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2" data-testid="attach-pending">
          {value.map((a) => (
            <li key={a.path} className="inline-flex items-center gap-2 rounded-lg border border-paper-200 bg-paper-50 ps-3 pe-1 py-1 text-xs text-ink-900 max-w-full">
              <i className={`${attachmentIcon(a)} shrink-0`} aria-hidden="true"></i>
              <span className="truncate max-w-[10rem]" dir="auto">{a.name}</span>
              <span className="text-paper-500" dir="ltr">{fileSize(a.size)}</span>
              <button type="button" onClick={() => onChange(value.filter((x) => x.path !== a.path))} className="w-6 h-6 rounded-full hover:bg-paper-200" aria-label={t(`أزل ${a.name}`, `Remove ${a.name}`)}><i className="ri-close-line" aria-hidden="true"></i></button>
            </li>
          ))}
        </ul>
      )}
      {err && <p role="alert" className="mt-1.5 text-xs text-red-700">{err}</p>}
    </div>
  );
}
