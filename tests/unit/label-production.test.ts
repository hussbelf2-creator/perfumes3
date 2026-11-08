// @ts-nocheck — خامة الملصق وتأثيراته وطقمه والنقش: التنقية والتسعير والسطور المقروءة
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanProduction, paperColor, MATERIALS, EFFECTS, LABEL_SET, ENGRAVE_METHODS } from "../../src/studio/label/types";
import { estimateLabel, labelProductionFields, labelProductionLines } from "../../src/studio/spec";
import { briefLines } from "../../src/start/briefs";

const pick = (b) => b.ar;
const t = (ar) => ar;
const label = (extra = {}) => ({ enabled: true, shape: "rect", widthMm: 60, heightMm: 40, centerYmm: 40, paper: "white", customColor: "#fff", finish: "matte", border: { enabled: false, color: "#000", foil: "none" }, texts: [{ id: "brand", text: "Maison", foil: "none" }, { id: "name", text: "عود", foil: "none" }, { id: "details", text: "EDP 50 ml", foil: "none" }], logo: null, ...extra });

test("cleanProduction: defaults, unknown values dropped, engrave text capped", () => {
  const d = cleanProduction({});
  assert.deepEqual(d, { material: "coated", effects: [], adhesive: "permanent", set: [], engrave: { enabled: false, text: "", position: "front", method: "laser", sizeMm: 5 } });
  const x = cleanProduction({ material: "gold", effects: ["emboss", "nope", "emboss"], adhesive: "waterproof", set: ["back", "zzz"], engrave: { enabled: true, text: "x".repeat(80), position: "top", method: "sandblast" } });
  assert.equal(x.material, "coated");
  assert.deepEqual(x.effects, ["emboss"]);
  assert.deepEqual(x.set, ["back"]);
  assert.equal(x.engrave.text.length, 30);
  assert.equal(x.engrave.position, "front");
  assert.equal(x.engrave.method, "sandblast");
  for (const m of [MATERIALS, EFFECTS, LABEL_SET, ENGRAVE_METHODS]) assert.ok(Object.keys(m).length >= 3);
});

test("paperColor: metallic and wood force their colour, clear PP hides the paper", () => {
  assert.equal(paperColor({ paper: "white", customColor: "#000000" }), "#fbfaf7");
  assert.equal(paperColor({ paper: "white", customColor: "#000000", material: "metallic" }), "#d8d2bf");
  assert.equal(paperColor({ paper: "black", customColor: "#000000", material: "pp_clear" }), null);
  assert.equal(paperColor({ paper: "custom", customColor: "#123456", material: "coated" }), "#123456");
});

test("estimateLabel: base only for a plain label; stock, effects, set, foil and engraving add up; setup spreads over qty", () => {
  const plain = estimateLabel(label(), 1000);
  assert.equal(plain.unit, 0.35);
  assert.equal(plain.setupTotal, 0);
  const rich = estimateLabel(label({ material: "metallic", effects: ["emboss", "laminate"], set: ["back", "batch"], adhesive: "waterproof", shape: "arch", engrave: { enabled: true, text: "Sara", position: "front", method: "laser" }, texts: [{ id: "brand", text: "M", foil: "gold" }] }), 1000);
  const v = Object.fromEntries(rich.variable.map((l) => [l.key, l.value]));
  assert.equal(v.material, 0.3);
  assert.equal(v.fx_emboss, 0.12);
  assert.equal(v.set_back, 0.14);
  assert.equal(v.adhesive, 0.05);
  assert.equal(v.foil, 0.12);
  assert.equal(v.engrave, 2.2);
  assert.equal(rich.setupTotal, 150 + 220 + 350);
  assert.equal(rich.unit, Math.round((rich.variableTotal + rich.setupTotal / 1000) * 100) / 100);
  assert.ok(estimateLabel(label({ shape: "arch" }), 100).unit > estimateLabel(label({ shape: "arch" }), 10000).unit, "setup per unit falls with volume");
});

test("summary lines and request fields carry the production choices; the team reads them back", () => {
  const d = label({ material: "cotton", effects: ["spot_uv"], set: ["back", "neck"], engrave: { enabled: true, text: "لسارة", position: "base", method: "laser" } });
  const lines = labelProductionLines(d, pick, t);
  assert.ok(lines.some((l) => l.includes("ورق قطني")));
  assert.ok(lines.some((l) => l.includes("ورنيش UV")));
  assert.ok(lines.some((l) => l.includes("القاعدة") && l.includes("لسارة")));
  const f = labelProductionFields(d);
  assert.equal(f.label_material, "cotton");
  assert.equal(f.label_set, "back,neck");
  assert.equal(f.engrave_text, "لسارة");
  assert.deepEqual(labelProductionFields({ ...d, enabled: false }), {});
  const brief = briefLines({ track: "F", a_items: "labels", ...f, label_effects: "spot_uv,bogus" }, pick, t);
  const stock = brief.find((l) => l.q.startsWith("الملصق"));
  assert.ok(stock && stock.a.includes("ورق قطني") && stock.a.includes("ورنيش UV") && !stock.a.includes("bogus"), JSON.stringify(brief));
  assert.equal(brief.find((l) => l.q === "طقم الملصقات").a, "ملصق خلفي (INCI)، ملصق أو بطاقة عنق");
  assert.match(brief.find((l) => l.q === "نقش على الزجاج").a, /ليزر.*القاعدة.*لسارة/);
});
