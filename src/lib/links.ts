/** رابط مطلق لمسار داخل المنصة يصلح للمشاركة والطباعة ورموز QR (يراعي وضع hash في النسخ المضمّنة) */
export function absoluteUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (import.meta.env.VITE_ROUTER === "hash") return `${window.location.origin}${window.location.pathname}#${p}`;
  return `${window.location.origin}${__BASE_PATH__.replace(/\/$/, "")}${p}`;
}
