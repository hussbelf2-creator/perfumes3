// @ts-nocheck — أشكال الملصق الأربعون وتموضعه حول العبوة والنقش والهوية وطرق الطباعة
import { test } from "node:test";
import assert from "node:assert/strict";
import { SHAPES, SHAPE_GROUPS, shapePoints, shapeArea, shapeById } from "../../src/studio/label/shapes";
import { buildLabelGeometry, labelZone, perimeter } from "../../src/studio/label/geometry";
import { MATERIALS, SIDE_OFFSET, cleanProduction, labelShapeOf, labelSide } from "../../src/studio/label/types";
import { estimateLabel, labelProductionFields, labelProductionLines } from "../../src/studio/spec";
import { ARTWORK_REQUIREMENTS, PRINT_METHODS, recommendPrintMethod } from "../../src/data/printing";
import { applyBrandToBox, applyBrandToLabel, brandFields, cleanBrand, inkOn } from "../../src/studio/brand";
import { defaultBox } from "../../src/studio/box/types";
import { briefLines } from "../../src/start/briefs";
import { techPackGroups } from "../../src/studio/techpack";
import { DEFAULT_BOX_RATES } from "../../src/studio/box/pricing";

const pick = (b) => b.ar;
const t = (ar) => ar;
const num = (n, d = 0) => Number(n).toFixed(d);
const label = (extra = {}) => ({ enabled: true, shape: "rect", widthMm: 60, heightMm: 40, centerYmm: 40, paper: "white", customColor: "#fff", finish: "matte", border: { enabled: false, color: "#000", foil: "none" }, texts: [{ id: "brand", text: "Maison", font: "readex", sizeMm: 6, weight: 700, color: "#111", foil: "none", y: 0.4, trackingMm: 0 }, { id: "name", text: "عود", font: "readex", sizeMm: 4, weight: 400, color: "#111", foil: "none", y: 0.6, trackingMm: 0 }, { id: "details", text: "EDP 50 ml", font: "readex", sizeMm: 2, weight: 400, color: "#111", foil: "none", y: 0.8, trackingMm: 0 }], logo: null, ...extra });

test("forty shapes in six groups, each a closed polygon inside its box with a sensible area", () => {
  assert.equal(SHAPES.length, 40);
  assert.equal(SHAPE_GROUPS.length, 6);
  for (const g of SHAPE_GROUPS) assert.ok(SHAPES.some((s) => s.group === g.id), g.id);
  for (const [w, h] of [[60, 40], [30, 30], [25, 70]]) {
    for (const s of SHAPES) {
      const pts = shapePoints(s.id, w, h, 4);
      assert.ok(pts.length >= 3, `${s.id}: ${pts.length} points`);
      for (const [x, y] of pts) {
        assert.ok(Number.isFinite(x) && Number.isFinite(y), `${s.id}: NaN`);
        assert.ok(x >= -0.01 && x <= w + 0.01 && y >= -0.01 && y <= h + 0.01, `${s.id} ${w}x${h}: point out of box (${x.toFixed(1)},${y.toFixed(1)})`);
      }
      const a = shapeArea(pts);
      assert.ok(a > Math.min(w, h) ** 2 * 0.3 && a <= w * h + 0.01, `${s.id} ${w}x${h}: area ${a.toFixed(0)} of ${w * h}`);
    }
  }
  assert.equal(shapeArea(shapePoints("rect", 60, 40)), 2400);
  assert.ok(Math.abs(shapeArea(shapePoints("oval", 60, 40)) - Math.PI * 30 * 20) < 30);
  assert.equal(shapeById("rect").die, false);
  assert.equal(shapeById("rounded").die, false);
  assert.ok(shapeById("badge").die && shapeById("unknown").id === "rect");
  assert.equal(labelShapeOf({ shape: "ogee" }), "ogee");
  assert.equal(labelShapeOf({ shape: "nope" }), "rect", "old or broken shapes fall back to rectangle");
});

const profile = [[20, 0], [20, 80], [10, 90], [8, 100]];
const rowLen = (g, segU, row) => {
  const p = g.getAttribute("position");
  let len = 0;
  for (let i = 1; i <= segU; i++) {
    const a = row * (segU + 1) + i - 1, b = a + 1;
    len += Math.hypot(p.getX(b) - p.getX(a), p.getY(b) - p.getY(a), p.getZ(b) - p.getZ(a));
  }
  return len;
};

test("label placement: offset moves the label around the bottle, back lands behind, rotation tilts it", () => {
  const base = buildLabelGeometry(profile, 2, 1, { widthMm: 50, heightMm: 30, centerYmm: 40 }, 64, 4);
  const per = perimeter(20, 2, 1);
  const right = buildLabelGeometry(profile, 2, 1, { widthMm: 50, heightMm: 30, centerYmm: 40, offsetXmm: per * 0.25 }, 64, 4);
  const back = buildLabelGeometry(profile, 2, 1, { widthMm: 50, heightMm: 30, centerYmm: 40, offsetXmm: per * 0.5 }, 64, 4);
  const mid = 2 * 65 + 32;
  const pb = base.getAttribute("position"), pr = right.getAttribute("position"), pk = back.getAttribute("position");
  assert.ok(pb.getZ(mid) > 19, "front label centre at +z");
  assert.ok(pr.getX(mid) > 19 && Math.abs(pr.getZ(mid)) < 1.5, `right label centre at +x (${pr.getX(mid).toFixed(1)}, ${pr.getZ(mid).toFixed(1)})`);
  assert.ok(pk.getZ(mid) < -19, "back label centre at -z");
  assert.ok(Math.abs(rowLen(right, 64, 2) - 50) < 0.2, "width is preserved when shifted");
  // الميل: الصف الأوسط لم يعد أفقياً
  const tilt = buildLabelGeometry(profile, 2, 1, { widthMm: 50, heightMm: 30, centerYmm: 40, rotateDeg: 20 }, 64, 4);
  const pt = tilt.getAttribute("position");
  const yL = pt.getY(2 * 65), yR = pt.getY(2 * 65 + 64);
  assert.ok(Math.abs((yR - yL) - 50 * Math.sin((20 * Math.PI) / 180)) < 0.6, `tilt raises one end by ~17 mm (${(yR - yL).toFixed(1)})`);
  // الجهة من الإزاحة
  assert.equal(labelSide(0, per), "front");
  assert.equal(labelSide(per * SIDE_OFFSET.right, per), "right");
  assert.equal(labelSide(-per * 0.25, per), "left");
  assert.equal(labelSide(per * 0.5, per), "back");
  assert.equal(labelSide(per * 1.5, per), "back", "offsets wrap around");
  const z = labelZone(profile, 10);
  assert.ok(z.height > 40);
});

test("materials carry a preview appearance and engraving options are cleaned with size and height", () => {
  for (const m of Object.values(MATERIALS)) assert.ok(m.roughness >= 0 && m.roughness <= 1 && m.metalness >= 0 && m.metalness <= 1 && m.texture);
  assert.ok(MATERIALS.metallic.metalness > 0.5 && MATERIALS.textured.texture === "linen" && MATERIALS.wood.texture === "grain");
  const e = cleanProduction({ engrave: { enabled: true, text: "Sara", method: "laser", position: "base", sizeMm: 99, yMm: -3 } }).engrave;
  assert.equal(e.sizeMm, 20, "letter height is capped");
  assert.equal(e.yMm, 0, "height from base is never negative");
  assert.equal(cleanProduction({}).engrave.sizeMm, 5);
});

test("print methods: recommendation follows quantity and stock; an explicit choice changes the estimate; artwork requirements filter by method", () => {
  assert.equal(PRINT_METHODS.length, 5);
  assert.equal(recommendPrintMethod({ qty: 300, material: "coated", effects: [] }).id, "digital");
  assert.equal(recommendPrintMethod({ qty: 8000, material: "coated", effects: [] }).id, "flexo");
  assert.equal(recommendPrintMethod({ qty: 2000, material: "coated", effects: ["emboss"] }).id, "offset");
  assert.equal(recommendPrintMethod({ qty: 2000, material: "pp_clear", effects: [] }).id, "screen");
  assert.equal(recommendPrintMethod({ qty: 2000, material: "cotton", effects: [] }).id, "letterpress");
  assert.equal(recommendPrintMethod({ qty: 5000, material: "coated", effects: [], variable: true }).id, "digital");
  const plain = estimateLabel(label(), 1000);
  assert.equal(plain.unit, 0.35, "no explicit method: digital baseline keeps the plain estimate");
  const flexo = estimateLabel(label({ printMethod: "flexo" }), 10000);
  assert.ok(flexo.variable.find((l) => l.key === "base").value < 0.3, "flexo lowers the unit");
  assert.ok(flexo.setup.some((l) => l.key === "plates"), "flexo adds plates");
  assert.ok(ARTWORK_REQUIREMENTS.filter((r) => !r.methods || r.methods.includes("digital")).length < ARTWORK_REQUIREMENTS.length);
  const f = labelProductionFields(label({ printMethod: "offset", shape: "shield", offsetMm: 33 }));
  assert.equal(f.label_print, "offset");
  assert.equal(f.label_shape, "shield");
  assert.equal(f.label_offset, "33");
  assert.ok(labelProductionLines(label({ printMethod: "offset" }), pick, t).some((l) => l.includes("أوفست")));
  const brief = briefLines({ track: "F", label_material: "coated", label_shape: "shield", label_print: "offset", label_offset: "33", brand_primary: "#15101D", brand_secondary: "#D4A853", brand_font: "amiri", brand_foil: "gold", brand_name: "نور", brand_logo: "attached" }, pick, t);
  assert.match(brief.find((l) => l.q === "شكل الملصق وطباعته").a, /درع.*أوفست.*33/);
  assert.match(brief.find((l) => l.q === "الهوية البصرية").a, /نور.*#15101D.*أميري|نور.*#15101D/);
});

test("brand kit: cleaned, applied to label and box consistently, and attached as fields", () => {
  const b = cleanBrand({ primary: "#15101D", secondary: "#D4A853", font: "amiri", foil: "gold", name: "دار نور", logo: "javascript:alert(1)" });
  assert.equal(b.logo, null, "only image data URLs are kept");
  assert.equal(cleanBrand({ primary: "red" }).primary, "#15101D");
  const l = applyBrandToLabel(label(), b);
  assert.equal(l.paper, "custom");
  assert.equal(l.customColor, "#15101D");
  assert.equal(l.texts.find((x) => x.id === "brand").foil, "gold");
  assert.equal(l.texts.find((x) => x.id === "brand").text, "دار نور");
  assert.equal(l.texts.find((x) => x.id === "name").color, inkOn("#15101D"));
  assert.ok(l.texts.every((x) => x.font === "amiri"));
  const bx = applyBrandToBox(defaultBox(), b);
  assert.equal(bx.board, "custom");
  assert.equal(bx.customColor, "#15101D");
  assert.equal(bx.foil, "gold");
  assert.equal(bx.brand, "دار نور");
  assert.deepEqual(brandFields(b), { brand_primary: "#15101D", brand_secondary: "#D4A853", brand_font: "amiri", brand_foil: "gold", brand_name: "دار نور" });
  assert.deepEqual(brandFields(null), {});
});

test("tech pack reads shape, placement, print method, engraving size and the artwork checklist", () => {
  const bottle = { id: "b", name: { ar: "أطلس", en: "Atlas" }, source: "catalogue", profile, squareness: 2, depthRatio: 1, neckMm: 10, heightMm: 100, capacityMl: 50, section: "round" };
  const tp = techPackGroups({ bottle, cap: null, glass: "clear", capFinish: "gold", liquid: "amber", spec: { cap: "screw", pump: "standard", deco: "none", mould: "catalogue", weight: "standard" }, label: label({ shape: "hexagon", offsetMm: 31, rotateDeg: 10, printMethod: "flexo", engrave: { enabled: true, text: "لسارة", method: "laser", position: "front", sizeMm: 6, yMm: 20 } }), box: null }, pick, t, num, DEFAULT_BOX_RATES, []);
  const g = tp.groups.find((x) => x.title === "الملصق الأمامي");
  const v = Object.fromEntries(g.rows.map((r) => [r.k, r.v]));
  assert.match(v["الشكل"], /سداسي.*قالب قص/);
  assert.match(v["الموضع"], /اليمين.*31.*10°/);
  assert.match(v["طريقة الطباعة"], /فلكسو/);
  assert.match(v["نقش على الزجاج"], /لسارة.*6.*20/);
  assert.ok(tp.groups.some((x) => x.title === "متطلبات ملفات الطباعة" && x.rows.length >= 6));
});

test("templates: fifteen in five groups, each builds a valid label; custom templates save, cap, apply and clean", async () => {
  const { TEMPLATES, TEMPLATE_GROUPS, makeTemplate, isTemplateId } = await import("../../src/studio/label/templates");
  const { cleanTemplate, saveCustomTemplate, listCustomTemplates, deleteCustomTemplate, applyCustomTemplate, MAX_TEMPLATES } = await import("../../src/studio/label/customTemplates");
  assert.equal(TEMPLATES.length, 15);
  assert.equal(TEMPLATE_GROUPS.length, 5);
  for (const g of TEMPLATE_GROUPS) assert.ok(TEMPLATES.filter((x) => x.group === g.id).length >= 3, g.id);
  const bottle = { id: "b", name: { ar: "أطلس", en: "Atlas" }, source: "catalogue", profile, squareness: 2, depthRatio: 1, neckMm: 10, heightMm: 100, capacityMl: 50, section: "round" };
  for (const tp of TEMPLATES) {
    const d = makeTemplate(tp.id, bottle, "دار", "عطر");
    assert.ok(d.enabled && d.widthMm > 15 && d.heightMm > 8 && d.texts.length === 3 && shapeById(d.shape).id === d.shape, tp.id);
    assert.equal(d.texts[0].text, "دار");
  }
  assert.ok(isTemplateId("andalus") && !isTemplateId("x"));
  // تخزين محلي وهمي
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  const d0 = { ...label({ shape: "badge", paper: "black" }), heightMm: 70, centerYmm: 60 };
  let list = saveCustomTemplate("قالب الليل", d0, new Date("2026-01-01T00:00:00Z"));
  assert.equal(list.length, 1);
  assert.equal(list[0].name, "قالب الليل");
  for (let i = 0; i < MAX_TEMPLATES + 3; i++) list = saveCustomTemplate(`t${i}`, d0, new Date(2026, 0, 2 + i));
  assert.equal(listCustomTemplates().length, MAX_TEMPLATES, "capped at twenty");
  const first = listCustomTemplates()[0];
  const applied = applyCustomTemplate(first, bottle, { logo: null });
  assert.equal(applied.shape, "badge");
  assert.ok(applied.heightMm <= Math.floor(labelZone(profile, 10).height), "height clamped to the body");
  assert.ok(applied.centerYmm - applied.heightMm / 2 >= labelZone(profile, 10).bottom - 0.01, "stays above the base");
  assert.equal(deleteCustomTemplate(first.id).length, MAX_TEMPLATES - 1);
  assert.equal(cleanTemplate({ id: "x", name: " ", design: d0 }), null, "a blank name is rejected");
  assert.equal(cleanTemplate({ id: "x", name: "ok", design: { ...d0, shape: "zzz", artwork: { dataUrl: "javascript:1", fit: "cover" } } }).design.shape, "rect");
  assert.equal(cleanTemplate({ id: "x", name: "ok", design: { ...d0, artwork: { dataUrl: "javascript:1", fit: "cover" } } }).design.artwork, undefined, "non-image artwork dropped");
  const f = labelProductionFields(label({ artwork: { dataUrl: "data:image/png;base64,AAAA", fit: "contain", hideTexts: true } }));
  assert.equal(f.label_artwork, "contain");
});
