import { CAP_FINISH, GLASS, LIQUID } from "../materials";
import type { PackModel } from "../types";
import type { Kit } from "../kits";
import { BOARDS } from "../box/types";
import { TEMPLATES } from "../label/templates";
import { FOILS, PAPERS } from "../label/types";
import { labelZone } from "../label/geometry";

// مصغّرة الطقم: رسم SVG خفيف من مقطع العبوة وألوان الطقم (بلا three.js) — عشرات البطاقات بلا كلفة

const half = (m: PackModel, cx: number, base: number, s: number, dy = 0) => {
  const pts = [...m.profile].sort((a, b) => a[1] - b[1]);
  const Y = (y: number) => base - (y + dy) * s;
  const right = pts.map(([r, y]) => `${cx + r * s},${Y(y)}`);
  const left = [...pts].reverse().map(([r, y]) => `${cx - r * s},${Y(y)}`);
  return `M${right.join(" L")} L${left.join(" L")} Z`;
};

export default function KitThumb({ kit, bottle, cap, className = "" }: { kit: Kit; bottle: PackModel | null; cap: PackModel | null; className?: string }) {
  const glass = GLASS.find((g) => g.id === kit.glass) ?? GLASS[0];
  const liquid = LIQUID.find((l) => l.id === kit.liquid);
  const finish = CAP_FINISH.find((f) => f.id === kit.capFinish) ?? CAP_FINISH[0];
  const tpl = kit.label ? TEMPLATES.find((x) => x.id === kit.label!.template) : null;
  const labelBg = kit.label?.color ?? (kit.label?.paper && kit.label.paper !== "custom" ? PAPERS[kit.label.paper].color ?? "#fbfaf7" : tpl?.swatch[0] ?? "#fbfaf7");
  const labelFg = tpl?.swatch[1] ?? "#151515";
  const boxColor = kit.box ? (kit.box.board === "custom" ? kit.box.color ?? "#3b2f2a" : BOARDS[kit.box.board].color) : null;
  const foil = kit.box && kit.box.foil !== "none" ? FOILS[kit.box.foil].color : null;
  const opaque = glass.transmission === 0;
  const body = opaque ? glass.color : liquid && liquid.color !== "transparent" ? liquid.color : "#eef0ee";
  const tint = !opaque && glass.attenuationColor !== "#ffffff" ? glass.attenuationColor : null;
  const W = 120, H = 120, base = 108;
  if (!bottle) return <svg viewBox={`0 0 ${W} ${H}`} className={className} aria-hidden="true"><rect width={W} height={H} fill="#f3f1ec" /></svg>;
  const capDy = bottle.heightMm - bottle.neckMm;
  const total = cap ? Math.max(bottle.heightMm, capDy + cap.heightMm) : bottle.heightMm;
  const maxR = Math.max(...bottle.profile.map((p) => p[0]), ...(cap ? cap.profile.map((p) => p[0]) : [0]));
  const s = Math.min(88 / total, 46 / (maxR * 2));
  const cx = kit.box ? 76 : 60;
  const z = labelZone(bottle.profile, bottle.neckMm);
  const lw = Math.min(z.radius * 2 * 0.78, 40) * s;
  const lh = Math.min(z.height * 0.56, 46) * s;
  const ly = base - z.center * s - lh / 2;
  // العلبة خلف العبوة: بارتفاع المنتج مع هامش، كما ستُصنع
  const bw = (maxR * 2 + 8) * s, bh = (total + 8) * s;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} aria-hidden="true">
      <rect width={W} height={H} fill="#f3f1ec" />
      <ellipse cx={cx} cy={base + 1.5} rx={maxR * s * 1.25} ry={2.6} fill="#000" opacity={0.08} />
      {boxColor && (
        <g>
          <rect x={30 - bw / 2} y={base - bh} width={bw} height={bh} fill={boxColor} stroke="#00000022" strokeWidth={0.5} />
          <rect x={30 + bw / 2} y={base - bh + 2} width={3} height={bh - 2} fill="#000" opacity={0.12} />
          {foil && <rect x={30 - bw / 2 + 2.5} y={base - bh + 2.5} width={bw - 5} height={bh - 5} fill="none" stroke={foil} strokeWidth={0.7} />}
          <rect x={30 - bw * 0.28} y={base - bh * 0.56} width={bw * 0.56} height={1.6} fill={foil ?? (boxColor === "#1b1a19" ? "#f6f1e8" : "#1d1b19")} opacity={0.85} />
          <rect x={30 - bw * 0.18} y={base - bh * 0.56 + 4} width={bw * 0.36} height={1} fill={foil ?? (boxColor === "#1b1a19" ? "#f6f1e8" : "#1d1b19")} opacity={0.5} />
        </g>
      )}
      <path d={half(bottle, cx, base, s)} fill={body} opacity={opaque ? 1 : 0.92} stroke="#00000030" strokeWidth={0.6} />
      {tint && <path d={half(bottle, cx, base, s)} fill={tint} opacity={0.38} />}
      {glass.id === "frosted" && <path d={half(bottle, cx, base, s)} fill="#fff" opacity={0.45} />}
      <rect x={cx - maxR * s * 0.55} y={base - (bottle.heightMm - bottle.neckMm) * s * 0.9} width={1.6} height={(bottle.heightMm - bottle.neckMm) * s * 0.7} fill="#fff" opacity={0.35} rx={0.8} />
      {kit.label && (
        <g>
          <rect x={cx - lw / 2} y={ly} width={lw} height={lh} rx={1.2} fill={labelBg} stroke="#00000018" strokeWidth={0.4} />
          <rect x={cx - lw * 0.3} y={ly + lh * 0.36} width={lw * 0.6} height={Math.max(1.2, lh * 0.09)} fill={labelFg} />
          <rect x={cx - lw * 0.2} y={ly + lh * 0.58} width={lw * 0.4} height={Math.max(0.7, lh * 0.045)} fill={labelFg} opacity={0.6} />
        </g>
      )}
      {cap && <path d={half(cap, cx, base, s, capDy)} fill={finish.color} stroke="#00000030" strokeWidth={0.5} />}
    </svg>
  );
}
