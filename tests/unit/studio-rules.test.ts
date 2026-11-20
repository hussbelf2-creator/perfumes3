// @ts-nocheck — اختبار سلوك
import { test } from "node:test";
import assert from "node:assert/strict";
import { SEED_MODELS } from "@/studio/seed";
import { KITS, KIT_GROUPS, applyKit, kitTier } from "@/studio/kits";
import { checkDesign, autoFixAll, refitLabel, labelLimits, bestCap, readiness, applyPatchToInput } from "@/studio/rules";
import { productFit, totalHeight, productWeight } from "@/studio/fit";
import { DEFAULT_BOTTLE_SPEC, fitStatus, parseBottleSpec } from "@/studio/spec";
import { defaultBox, fitFor, STYLE_IDS } from "@/studio/box/types";
import { makeTemplate } from "@/studio/label/templates";
import { estimateCapacityMl } from "@/studio/profile";

const bottles = SEED_MODELS.filter((m) => m.kind === "bottle");
const caps = SEED_MODELS.filter((m) => m.kind === "cap");
const B = (id) => bottles.find((b) => b.id === id);
const C = (id) => caps.find((c) => c.id === id);
const input = (o = {}) => ({ bottle: B("B-ATLAS"), cap: C("C-CYL"), caps, glass: "clear", spec: { ...DEFAULT_BOTTLE_SPEC }, label: null, box: null, qty: 1000, ...o });
const ids = (xs) => xs.map((x) => x.id);

test("catalogue: 17 bottles and 10 caps, nominal capacity sits just under brimful", () => {
  assert.equal(bottles.length, 17);
  assert.equal(caps.length, 10);
  for (const b of bottles) {
    const brim = estimateCapacityMl(b.profile, { squareness: b.squareness, depthRatio: b.depthRatio, neckMm: b.neckMm });
    assert.ok(brim >= b.capacityMl && brim <= b.capacityMl * 1.25, `${b.id}: nominal ${b.capacityMl} vs brimful ${brim}`);
    assert.equal(b.heightMm, Math.max(...b.profile.map((p) => p[1])), b.id);
  }
  assert.equal(new Set(SEED_MODELS.map((m) => m.id)).size, SEED_MODELS.length);
});

test("72 kits in 12 groups of six; unique ids; every referenced bottle and cap exists", () => {
  assert.equal(KITS.length, 72);
  assert.equal(KIT_GROUPS.length, 12);
  for (const g of KIT_GROUPS) assert.equal(KITS.filter((k) => k.group === g.id).length, 6, g.id);
  assert.equal(new Set(ids(KITS)).size, 72);
  assert.equal(new Set(KITS.map((k) => k.name.ar)).size, 72, "names are unique");
  for (const k of KITS) {
    assert.ok(B(k.bottle), `${k.id} bottle ${k.bottle}`);
    assert.ok(!k.cap || C(k.cap), `${k.id} cap ${k.cap}`);
    assert.ok([1, 2, 3].includes(kitTier(k)));
  }
});

test("every kit applies to a coherent product: no compatibility errors or warnings, box hugs the bottle", () => {
  for (const k of KITS) {
    const a = applyKit(k, SEED_MODELS);
    assert.ok(a, k.id);
    const spec = parseBottleSpec((key) => a.params[key] || null);
    assert.deepEqual(spec, { ...DEFAULT_BOTTLE_SPEC, ...k.spec }, `${k.id} spec is valid as designed`);
    const issues = checkDesign({ bottle: a.bottle, cap: a.cap, caps, glass: k.glass, spec, label: a.label, box: a.box, qty: 1000 }).filter((i) => i.level !== "tip");
    assert.deepEqual(ids(issues), [], `${k.id}: ${issues.map((i) => i.id + " " + i.text.ar).join(" | ")}`);
    assert.equal(a.params.b, k.bottle);
    if (a.box) {
      assert.deepEqual({ L: a.box.L, W: a.box.W, H: a.box.H }, fitFor(a.box.style, productFit(a.bottle, a.cap)), `${k.id} box follows the bottle`);
      assert.equal(a.box.brand, k.brand);
    }
    if (a.label) {
      const lim = labelLimits(a.bottle);
      assert.ok(a.label.widthMm <= lim.maxW && a.label.heightMm <= lim.maxH, `${k.id} label inside the body`);
      assert.match(a.label.texts.find((t) => t.id === "details").text, new RegExp(`${a.bottle.capacityMl}\\s*(ML|مل)`), `${k.id} states the volume`);
    }
  }
});

test("a kit falls back to the nearest bottle when the catalogue lacks its shape", () => {
  const only = SEED_MODELS.filter((m) => ["B-ATLAS", "B-NOOR", "C-CYL"].includes(m.id));
  const a = applyKit(KITS.find((k) => k.id === "travel-atomiser"), only);
  assert.equal(a.bottle.id, "B-ATLAS");
  assert.equal(a.cap.id, "C-CYL");
  assert.deepEqual(ids(checkDesign({ bottle: a.bottle, cap: a.cap, caps: only, glass: "clear", spec: DEFAULT_BOTTLE_SPEC, label: a.label, box: a.box, qty: 1000 }).filter((i) => i.level === "error")), []);
});

test("big bottle in a small box is an error with a one-click fit; oversized box warns", () => {
  const small = { ...defaultBox(productFit(B("B-SQ30"), C("C-CYL"))), autoFit: false };
  const big = input({ bottle: B("B-TOWER"), cap: C("C-PYR"), box: small });
  const tight = checkDesign(big).find((i) => i.id === "box.tight");
  assert.equal(tight.level, "error");
  assert.match(tight.text.ar, /العلبة أصغر من العبوة/);
  const fixed = applyPatchToInput(big, tight.fix.patch);
  assert.equal(fitStatus(fixed.box, productFit(big.bottle, big.cap)).level, "ok");
  assert.equal(fixed.box.autoFit, true);
  const huge = input({ bottle: B("B-MINI"), cap: C("C-MINI"), box: { ...defaultBox(productFit(B("B-TOWER"), C("C-PYR"))), autoFit: false } });
  assert.equal(checkDesign(huge).find((i) => i.id === "box.loose").level, "warn");
  assert.equal(readiness(checkDesign(big)).ready, false);
});

test("cap rules: a cap narrower than the neck is rejected, a far wider one warned, with a fitting alternative", () => {
  const narrow = { ...C("C-MINI"), id: "C-X", profile: [[5, 0], [5, 17]] };
  const i = checkDesign(input({ cap: narrow, caps: [...caps, narrow] })).find((x) => x.id === "cap.neck");
  assert.equal(i.level, "error");
  assert.ok(i.fix.patch.params.c);
  const wide = checkDesign(input({ bottle: B("B-TRAVEL"), cap: C("C-DISC") }));
  assert.ok(ids(wide).includes("cap.wide"));
  assert.equal(bestCap(B("B-TRAVEL"), caps).id, "C-MINI");
  assert.equal(bestCap(B("B-MINI"), caps).id, "C-MINI");
  assert.equal(totalHeight(B("B-ATLAS"), C("C-CYL")), 96 + 30 - 13);
  assert.ok(productWeight(B("B-TOWER"), true) > productWeight(B("B-TOWER")));
});

test("pump and mould logic: roll-on only for small oils, crimp needs a spray pump, private mould needs volume", () => {
  assert.equal(checkDesign(input({ spec: { ...DEFAULT_BOTTLE_SPEC, pump: "rollon" } })).find((i) => i.id === "pump.rollon").level, "error");
  assert.equal(checkDesign(input({ bottle: B("B-ATTAR"), cap: C("C-MINI"), spec: { ...DEFAULT_BOTTLE_SPEC, pump: "rollon" } })).some((i) => i.id === "pump.rollon"), false);
  assert.ok(ids(checkDesign(input({ spec: { ...DEFAULT_BOTTLE_SPEC, cap: "crimp", pump: "none" } }))).includes("cap.crimp"));
  const m = checkDesign(input({ spec: { ...DEFAULT_BOTTLE_SPEC, mould: "private" }, qty: 1000 })).find((i) => i.id === "mould.moq");
  assert.equal(m.level, "error");
  assert.deepEqual(m.fix.patch, { params: { md: "" } });
  assert.equal(checkDesign(input({ qty: 200 })).find((i) => i.id === "mould.moq").fix.patch.qty, 500);
  assert.ok(ids(checkDesign(input({ glass: "black", spec: { ...DEFAULT_BOTTLE_SPEC, deco: "frost" } }))).includes("deco.redundant"));
});

test("label rules: oversized label refits inside the straight wall keeping proportions; legal line, tiny text and thin foil fixed", () => {
  const b = B("B-ATLAS");
  const l = { ...makeTemplate("luxury", b), widthMm: 200, heightMm: 90 };
  const zone = checkDesign(input({ label: l })).find((i) => i.id === "label.zone");
  assert.equal(zone.level, "error");
  const r = refitLabel(l, b), lim = labelLimits(b);
  assert.ok(r.widthMm <= lim.maxW && r.heightMm <= lim.maxH);
  assert.ok(r.texts[0].sizeMm < l.texts[0].sizeMm, "text scales with the label");
  assert.equal(refitLabel(r, b), r, "refit is idempotent");
  const wrong = makeTemplate("minimal", b); // «100 ML» على عبوة 50 مل
  const legal = checkDesign(input({ label: wrong })).find((i) => i.id === "label.legal");
  assert.match(legal.text.ar, /لا يطابق العبوة/);
  assert.match(applyPatchToInput(input({ label: wrong }), legal.fix.patch).label.texts.find((t) => t.id === "details").text, /50 ML/);
  const done = autoFixAll(input({ label: l }));
  assert.deepEqual(ids(checkDesign(done.input).filter((i) => i.level !== "tip")), []);
  assert.ok(done.fixed.includes("label.zone"));
  const flat = labelLimits(B("B-NOOR"));
  assert.equal(flat.flat, true);
  assert.ok(flat.maxW < flat.perimeter / 2, "a flat bottle's label stays on its face");
});

test("box style logic: round box for a flat bottle, hang tab for a heavy one, rigid without insert, brand mismatch", () => {
  const flat = B("B-NOOR"), fit = productFit(flat, C("C-CUBE"));
  const tube = { ...defaultBox(fit), style: "tube", ...fitFor("tube", fit) };
  const round = checkDesign(input({ bottle: flat, cap: C("C-CUBE"), box: tube })).find((i) => i.id === "box.round");
  assert.equal(round.level, "warn");
  assert.notEqual(round.fix.patch.box.style, "tube");
  const hang = { ...defaultBox(fit), style: "hang", ...fitFor("hang", fit) };
  assert.ok(ids(checkDesign(input({ bottle: flat, cap: C("C-CUBE"), box: hang }))).includes("box.hang"));
  const rigid = { ...defaultBox(fit), style: "magnetic", ...fitFor("magnetic", fit), extras: [] };
  const ins = checkDesign(input({ bottle: flat, cap: C("C-CUBE"), box: rigid })).find((i) => i.id === "box.insert");
  assert.deepEqual(ins.fix.patch.box.extras, ["insert_eva"]);
  const lbl = { ...makeTemplate("minimal", flat, "نور", "عود"), };
  const mis = checkDesign(input({ bottle: flat, cap: C("C-CUBE"), label: lbl, box: { ...defaultBox(fit), brand: "Maison" } })).find((i) => i.id === "box.brand");
  assert.equal(mis.fix.patch.box.brand, "نور");
  for (const s of STYLE_IDS) assert.doesNotThrow(() => checkDesign(input({ box: { ...defaultBox(productFit(B("B-ATLAS"), C("C-CYL"))), style: s, ...fitFor(s, productFit(B("B-ATLAS"), C("C-CYL"))) } })), s);
});
