import { FONTS, ensureFonts } from "./fonts";
import { ENGRAVE_METHODS, FOILS, MATERIALS, hasArabic, labelShapeOf, paperColor, type Engrave, type Foil, type FontId, type LabelDesign } from "./types";
import { shapePath } from "./shapes";

export { shapePath };

// يرسم الملصق على لوحتين:
//   color: الألوان كما تُطبع
//   pbr:   خريطة الخامة لـ three.js — الأخضر = الخشونة، الأزرق = المعدنية (الفويل يلمع، الورق مطفأ)
// bleedMm > 0 للطباعة: الخلفية تمتد خارج خط القص.

export interface Rendered {
  color: HTMLCanvasElement;
  pbr: HTMLCanvasElement;
  /** هل الملصق بلا خلفية (طباعة مباشرة على الزجاج)؟ */
  clear: boolean;
}

const foilColor = (f: Foil, fallback: string) => (f === "none" ? fallback : FOILS[f].color);
// قيم خريطة الخامة: [R غير مستخدم، G خشونة، B معدنية]
const PBR_PAPER = { matte: "rgb(255,220,0)", gloss: "rgb(255,90,0)" } as const;
/** خريطة خامة الورق من مادة الملصق وتشطيبه: G = خشونة، B = معدنية */
const pbrFor = (d: LabelDesign) => {
  const m = MATERIALS[d.material ?? "coated"];
  const rough = d.finish === "gloss" ? Math.min(m.roughness, 0.35) : m.roughness;
  return `rgb(255,${Math.round(rough * 255)},${Math.round(m.metalness * 255)})`;
};
/** نسيج الخامة: كتّان، ألياف قطنية، خطوط معدنية مصقولة، عروق خشب — ثابت البذرة ليطابق الطباعة */
function drawTexture(g: CanvasRenderingContext2D, kind: string, cw: number, ch: number, k: number) {
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.save();
  if (kind === "linen") {
    g.strokeStyle = "rgba(0,0,0,0.045)";
    g.lineWidth = Math.max(1, k * 0.08);
    const step = Math.max(2, k * 0.5);
    for (let x = 0; x < cw; x += step) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, ch); g.stroke(); }
    for (let y = 0; y < ch; y += step) { g.beginPath(); g.moveTo(0, y); g.lineTo(cw, y); g.stroke(); }
  } else if (kind === "fibre") {
    for (let i = 0; i < (cw * ch) / 40; i++) {
      g.fillStyle = `rgba(${rnd() > 0.5 ? "60,50,40" : "255,255,255"},${0.03 + rnd() * 0.07})`;
      g.fillRect(rnd() * cw, rnd() * ch, 1 + rnd() * k * 0.3, 1);
    }
  } else if (kind === "brushed") {
    g.lineWidth = 1;
    for (let y = 0; y < ch; y += 1.5) {
      g.strokeStyle = `rgba(255,255,255,${0.04 + rnd() * 0.12})`;
      g.beginPath(); g.moveTo(0, y); g.lineTo(cw, y); g.stroke();
    }
  } else if (kind === "grain") {
    g.lineWidth = Math.max(1, k * 0.12);
    for (let i = 0; i < 28; i++) {
      const y0 = rnd() * ch;
      g.strokeStyle = `rgba(70,40,15,${0.08 + rnd() * 0.14})`;
      g.beginPath();
      for (let x = 0; x <= cw; x += cw / 12) g.lineTo(x, y0 + Math.sin(x / cw * Math.PI * (2 + rnd() * 2) + i) * ch * 0.03);
      g.stroke();
    }
  }
  g.restore();
}
const PBR_FOIL = "rgb(255,60,255)";
const PBR_INK = { matte: "rgb(255,200,0)", gloss: "rgb(255,80,0)" } as const;

async function loadImage(src: string) {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

export async function renderLabel(d: LabelDesign, pxPerMm: number, bleedMm = 0): Promise<Rendered> {
  await ensureFonts(d.texts.map((t) => t.font), d.texts.map((t) => t.text).join(" ") || "عطر");
  const k = pxPerMm;
  const b = bleedMm * k;
  const W = Math.round(d.widthMm * k), H = Math.round(d.heightMm * k);
  const cw = Math.round(W + 2 * b), ch = Math.round(H + 2 * b);
  const mk = () => {
    const c = document.createElement("canvas");
    c.width = cw;
    c.height = ch;
    return c;
  };
  const color = mk(), pbr = mk();
  const g = color.getContext("2d")!, p = pbr.getContext("2d")!;
  const paper = paperColor(d);
  const corner = 4 * k;

  // القص على شكل الملصق (مع الهامش عند الطباعة)
  const shape = labelShapeOf(d);
  for (const ctx of [g, p]) {
    ctx.save();
    shapePath(ctx, shape, 0, 0, cw, ch, corner + b);
    ctx.clip();
  }
  if (paper) {
    g.fillStyle = paper;
    g.fillRect(0, 0, cw, ch);
    drawTexture(g, MATERIALS[d.material ?? "coated"].texture, cw, ch, k);
    if (d.paper === "kraft") {
      // ألياف الكرافت: نقاط عشوائية ثابتة البذرة لتطابق المعاينة الطباعة
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < (cw * ch) / 60; i++) {
        g.fillStyle = `rgba(${rnd() > 0.5 ? "90,60,30" : "235,210,170"},${0.05 + rnd() * 0.12})`;
        g.fillRect(rnd() * cw, rnd() * ch, 1 + rnd() * 2 * (k / 8), 1);
      }
    }
    p.fillStyle = d.material && d.material !== "coated" ? pbrFor(d) : PBR_PAPER[d.finish];
    p.fillRect(0, 0, cw, ch);
  }

  // من هنا الإحداثيات نسبة لمنطقة القص (بدون الهامش)
  const ox = b, oy = b;

  // التصميم الجاهز (قالب العميل الخاص): يُفرَش على كامل الملصق بما فيه هامش القص
  if (d.artwork?.dataUrl) {
    try {
      const img = await loadImage(d.artwork.dataUrl);
      const k2 = d.artwork.fit === "contain" ? Math.min(cw / img.naturalWidth, ch / img.naturalHeight) : Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
      const dw = img.naturalWidth * k2, dh = img.naturalHeight * k2;
      g.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
      if (!paper) {
        p.fillStyle = PBR_PAPER[d.finish];
        p.fillRect((cw - dw) / 2, (ch - dh) / 2, dw, dh);
      }
    } catch {
      /* ملف تالف: نُبقي الورق */
    }
  }

  if (d.border.enabled) {
    const inset = 2.2 * k;
    for (const [ctx, style] of [[g, foilColor(d.border.foil, d.border.color)], [p, d.border.foil === "none" ? PBR_INK[d.finish] : PBR_FOIL]] as const) {
      ctx.lineWidth = Math.max(1, 0.35 * k);
      ctx.strokeStyle = style;
      shapePath(ctx, shape, ox + inset, oy + inset, W - 2 * inset, H - 2 * inset, Math.max(0, corner - inset));
      ctx.stroke();
    }
  }

  if (d.logo?.dataUrl) {
    try {
      const img = await loadImage(d.logo.dataUrl);
      const lw = d.logo.widthMm * k;
      const lh = (img.naturalHeight / img.naturalWidth) * lw;
      const lx = ox + (W - lw) / 2, ly = oy + d.logo.y * H - lh / 2;
      if (d.logo.foil === "none") {
        g.drawImage(img, lx, ly, lw, lh);
        p.globalAlpha = 1;
        p.globalCompositeOperation = "source-over";
      } else {
        // شعار مذهّب: نستخدم شكل الشعار (قناة الشفافية) ونلوّنه بلون الفويل
        const tmp = document.createElement("canvas");
        tmp.width = Math.max(1, Math.round(lw));
        tmp.height = Math.max(1, Math.round(lh));
        const tg = tmp.getContext("2d")!;
        tg.drawImage(img, 0, 0, tmp.width, tmp.height);
        tg.globalCompositeOperation = "source-in";
        tg.fillStyle = FOILS[d.logo.foil].color;
        tg.fillRect(0, 0, tmp.width, tmp.height);
        g.drawImage(tmp, lx, ly);
        tg.fillStyle = PBR_FOIL;
        tg.fillRect(0, 0, tmp.width, tmp.height);
        p.drawImage(tmp, lx, ly);
      }
    } catch {
      /* شعار تالف: نتجاهله ولا نوقف الرسم */
    }
  }

  for (const t of d.texts) {
    if (!t.text.trim() || d.artwork?.hideTexts) continue;
    const rtl = hasArabic(t.text);
    let px = t.sizeMm * k;
    const setFont = (ctx: CanvasRenderingContext2D) => {
      ctx.font = `${t.weight} ${px}px "${FONTS[t.font].family}", "IBM Plex Sans Arabic", sans-serif`;
      ctx.direction = rtl ? "rtl" : "ltr";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      // تباعد الحروف يكسر اتصال الحروف العربية — للاتينية فقط
      ctx.letterSpacing = rtl ? "0px" : `${t.trackingMm * k}px`;
    };
    setFont(g);
    // يُصغَّر النص تلقائياً ليبقى داخل الملصق بهامش 3 مم من كل جانب
    const maxW = W - 6 * k;
    const w = g.measureText(t.text).width;
    if (w > maxW) {
      px = (px * maxW) / w;
      setFont(g);
    }
    const x = ox + W / 2, y = oy + t.y * H;
    g.fillStyle = foilColor(t.foil, t.color);
    g.fillText(t.text, x, y);
    setFont(p);
    p.fillStyle = t.foil === "none" ? PBR_INK[d.finish] : PBR_FOIL;
    p.fillText(t.text, x, y);
  }

  g.restore();
  p.restore();
  return { color, pbr, clear: !paper };
}

export interface EngraveArt {
  color: HTMLCanvasElement;
  widthMm: number;
  heightMm: number;
  /** معدني (فويل حراري) أم محفور مطفأ */
  metallic: boolean;
}

/** يرسم نص النقش بشفافية: الليزر والرملي حفر أبيض مطفأ شبه شفاف، والفويل الحراري ذهبي معدني */
export async function renderEngraving(e: Engrave, font: FontId, pxPerMm: number, maxWidthMm: number): Promise<EngraveArt | null> {
  const text = e.text.trim();
  if (!e.enabled || !text) return null;
  await ensureFonts([font], text);
  const k = pxPerMm;
  const size = e.sizeMm ?? 5;
  const heightMm = size * 1.6;
  const c = document.createElement("canvas");
  const measure = c.getContext("2d")!;
  const setFont = (ctx: CanvasRenderingContext2D, px: number) => {
    ctx.font = `${e.method === "sandblast" ? 700 : 400} ${px}px "${FONTS[font].family}", "IBM Plex Sans Arabic", sans-serif`;
    ctx.direction = hasArabic(text) ? "rtl" : "ltr";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
  };
  let px = size * k;
  setFont(measure, px);
  let widthMm = measure.measureText(text).width / k + size * 0.8;
  if (widthMm > maxWidthMm) {
    px = (px * maxWidthMm) / widthMm;
    widthMm = maxWidthMm;
  }
  c.width = Math.max(2, Math.round(widthMm * k));
  c.height = Math.max(2, Math.round(heightMm * k));
  const g = c.getContext("2d")!;
  setFont(g, px);
  const metallic = e.method === "hotfoil";
  if (metallic) {
    g.fillStyle = FOILS.gold.color;
    g.fillText(text, c.width / 2, c.height / 2);
  } else {
    // حفر مطفأ: طبقة ناعمة منتشرة ثم الحروف فوقها
    g.filter = `blur(${Math.max(0.5, k * 0.12)}px)`;
    g.fillStyle = e.method === "sandblast" ? "rgba(245,245,243,0.95)" : "rgba(255,255,255,0.78)";
    g.fillText(text, c.width / 2, c.height / 2);
    g.filter = "none";
    g.fillStyle = e.method === "sandblast" ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.72)";
    g.fillText(text, c.width / 2, c.height / 2);
  }
  void ENGRAVE_METHODS;
  return { color: c, widthMm, heightMm, metallic };
}
