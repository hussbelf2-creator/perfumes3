import qrcode from "qrcode-generator";

// رموز QR تُرسم SVG داخل الصفحة: تُطبع بوضوح وبلا خدمة خارجية.

/** مصفوفة الرمز: true = مربع داكن */
export function qrMatrix(text: string, level: "L" | "M" | "Q" | "H" = "M"): boolean[][] {
  const q = qrcode(0, level);
  q.addData(text, "Byte");
  q.make();
  const n = q.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => q.isDark(r, c)));
}

/** مسار SVG للمربعات الداكنة (الأسطر المتجاورة تُدمج في مستطيل واحد) */
export function qrPath(m: boolean[][], quiet = 4): string {
  let d = "";
  m.forEach((row, r) => {
    let c = 0;
    while (c < row.length) {
      if (!row[c]) {
        c++;
        continue;
      }
      let w = 1;
      while (c + w < row.length && row[c + w]) w++;
      d += `M${c + quiet} ${r + quiet}h${w}v1h-${w}z`;
      c += w;
    }
  });
  return d;
}
