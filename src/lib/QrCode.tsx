import { qrMatrix, qrPath } from "./qr";

// رمز QR يُرسم SVG داخل الصفحة: يُطبع بوضوح وبلا خدمة خارجية.
export function QrCode({ value, size = 160, level = "M", title, className = "" }: { value: string; size?: number; level?: "L" | "M" | "Q" | "H"; title?: string; className?: string }) {
  const m = qrMatrix(value, level);
  const quiet = 4;
  const n = m.length + quiet * 2;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${n} ${n}`} width={size} height={size} role="img" aria-label={title ?? "QR"} className={className} shapeRendering="crispEdges" data-qr={value}>
      <rect width={n} height={n} fill="#fff" />
      <path d={qrPath(m, quiet)} fill="#000" />
    </svg>
  );
}
