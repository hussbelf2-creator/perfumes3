import { getBlob, putBlob } from "@/studio/blobStore";
import { ATTACHMENT_TYPES, MAX_ATTACHMENTS, MAX_UPLOAD_BYTES, extOf, storeAttachment, type Attachment } from "@/creatives/images";

// مرفقات «ابدأ مسارك»: الزائر يرفقها قبل أن يكون له حساب أو مشروع، فتُحفظ في متصفحه (IndexedDB)
// ثم تُرفع إلى مشروعه كملاحظة أولى حين يتحول طلبه لمشروع عند فتح الحساب.

const KEY = "pp_start_files_v1";
export interface PendingFile {
  key: string;
  name: string;
  type: string;
  size: number;
}

export function listPending(): PendingFile[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]") as PendingFile[];
    return Array.isArray(v) ? v.filter((x) => x && typeof x.key === "string") : [];
  } catch {
    return [];
  }
}
const save = (list: PendingFile[]) => localStorage.setItem(KEY, JSON.stringify(list));
export const clearPending = () => localStorage.removeItem(KEY);

/** نوع مقبول؟ صور، أو مستند من القائمة */
export const acceptable = (f: { name: string; type: string; size: number }) => f.size <= MAX_UPLOAD_BYTES && (f.type.startsWith("image/") || !!ATTACHMENT_TYPES[extOf(f.name)]);

export async function stashFile(file: File): Promise<PendingFile[]> {
  const list = listPending();
  if (list.length >= MAX_ATTACHMENTS) throw new Error("too_many");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("too_large");
  if (!acceptable(file)) throw new Error("bad_type");
  const key = `start-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  await putBlob(key, file);
  const next = [...list, { key, name: file.name.slice(0, 160), type: file.type || ATTACHMENT_TYPES[extOf(file.name)] || "", size: file.size }];
  save(next);
  return next;
}
export function dropPending(key: string): PendingFile[] {
  const next = listPending().filter((x) => x.key !== key);
  save(next);
  return next;
}

/** يرفع المرفقات المعلّقة إلى المشروع ويعيدها جاهزة لتُرسل ملاحظةً أولى */
export async function uploadPending(projectId: string): Promise<Attachment[]> {
  const out: Attachment[] = [];
  for (const p of listPending()) {
    const blob = await getBlob(p.key).catch(() => null);
    if (!blob) continue;
    try {
      out.push(await storeAttachment(new File([blob], p.name, { type: p.type }), projectId));
    } catch {
      /* ملف لم يُقبل: نتجاوزه ولا نمنع البقية */
    }
  }
  return out;
}
