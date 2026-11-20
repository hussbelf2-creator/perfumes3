// @ts-nocheck — اختبار سلوك
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlan, DEFAULT_PLAN, planInputFromPayload, weeks, PHASES } from "../../src/production/plan";

const ids = (p) => p.stages.map((s) => s.id);
const S = (p, id) => p.stages.find((s) => s.id === id);
const start = new Date("2026-11-01T00:00:00Z");

test("full brand (A): every lane present, maceration follows compounding, QC waits for both the line and the regulatory file", () => {
  const p = buildPlan({ track: "A", qty: 1000, box: "rigid", labelPrint: "digital", concentration: "edp", start });
  for (const id of ["approve", "formula", "scent_ok", "regulatory", "compound", "maceration", "filter", "artwork", "artwork_ok", "bottle", "box", "label", "golden", "golden_ok", "fill", "packing", "qc", "delivery"]) assert.ok(S(p, id), id);
  assert.deepEqual(S(p, "maceration").start, S(p, "compound").end);
  assert.deepEqual(S(p, "maceration").days, DEFAULT_PLAN.maceration.edp);
  assert.ok(S(p, "qc").start[1] >= S(p, "packing").end[1] && S(p, "qc").start[1] >= S(p, "regulatory").end[1]);
  assert.ok(S(p, "fill").start[1] >= S(p, "filter").end[1] && S(p, "fill").start[1] >= S(p, "golden_ok").end[1]);
  assert.deepEqual(p.total, S(p, "delivery").end);
  assert.equal(p.eta[1].toISOString().slice(0, 10), new Date(start.getTime() + p.total[1] * 864e5).toISOString().slice(0, 10));
  assert.ok(p.total[0] >= 50 && p.total[1] <= 130, `A total ${p.total}`);
  assert.deepEqual(p.clientStages.map((s) => s.id), ["approve", "scent_ok", "artwork_ok", "golden_ok"]);
  assert.ok(p.clientStages.every((s) => s.needs));
});

test("the critical path names what drives the date: a private mould beats everything; otherwise the juice", () => {
  const cat = buildPlan({ track: "E", qty: 1000, formula: "ready", packaging: "no", box: "folding", labelPrint: "digital", start });
  const priv = buildPlan({ track: "E", qty: 5000, formula: "ready", packaging: "no", mould: "private", box: "folding", labelPrint: "digital", start });
  assert.equal(priv.driver.id, "bottle");
  assert.ok(priv.total[1] > cat.total[1] + 50);
  assert.ok(S(priv, "bottle").critical && !S(priv, "maceration").critical);
  const dev = buildPlan({ track: "A", qty: 1000, box: "folding", labelPrint: "digital", start });
  assert.equal(dev.driver.id, "formula");
  assert.ok(S(dev, "formula").critical);
  // المسار الحرج متصل من البداية للنهاية
  assert.ok(S(dev, "approve").critical && S(dev, "delivery").critical);
});

test("manufacturing (E) adapts to what the client already has", () => {
  const ready = buildPlan({ track: "E", qty: 1000, formula: "ready", packaging: "yes", start });
  assert.ok(S(ready, "receive") && !S(ready, "artwork") && !S(ready, "formula") && !S(ready, "bottle"));
  assert.match(S(ready, "receive").needs.ar, /ورّد/);
  const ref = buildPlan({ track: "E", qty: 1000, formula: "reference", packaging: "no", box: "folding", labelPrint: "flexo", start });
  assert.deepEqual(S(ref, "formula").days, DEFAULT_PLAN.days.formula_reference);
  assert.deepEqual(S(ref, "label").days, DEFAULT_PLAN.days.label_flexo);
  assert.ok(ready.total[1] < ref.total[1]);
  const oud = buildPlan({ track: "E", qty: 1000, formula: "ready", packaging: "yes", concentration: "extrait", oud: true, start });
  assert.deepEqual(S(oud, "maceration").days, [28 + 14, 42 + 14]);
  const oil = buildPlan({ track: "E", qty: 1000, formula: "ready", packaging: "yes", concentration: "oil", start });
  assert.ok(S(oil, "maceration").days[1] < S(ready, "maceration").days[0] + 1);
});

test("line time grows with quantity; decoration chains after the bottles", () => {
  const small = buildPlan({ track: "E", qty: 1000, formula: "ready", packaging: "no", box: "folding", labelPrint: "digital", start });
  const big = buildPlan({ track: "E", qty: 40000, formula: "ready", packaging: "no", box: "folding", labelPrint: "digital", deco: true, start });
  assert.deepEqual(S(small, "fill").days, [2, 4]);
  assert.deepEqual(S(big, "fill").days, [10, 12]);
  assert.deepEqual(S(big, "packing").days, [8, 10]);
  assert.deepEqual(S(big, "deco").start, S(big, "bottle").end);
});

test("other tracks: B ends with a spec file, C has no juice, D is design only, F is proof-gated, P is the personal scent", () => {
  const b = buildPlan({ track: "B", qty: 1, start });
  assert.deepEqual(ids(b), ["approve", "formula", "scent_ok", "stability", "handover"]);
  const c = buildPlan({ track: "C", qty: 2000, box: "rigid", labelPrint: "offset", start });
  assert.ok(!S(c, "maceration") && !S(c, "fill") && !S(c, "regulatory") && S(c, "golden") && S(c, "packing"));
  assert.equal(S(c, "packing").name.ar, "التجميع والتعبئة");
  const d = buildPlan({ track: "D", qty: 1, start });
  assert.deepEqual(ids(d), ["approve", "concepts", "concept_ok", "system", "handover"]);
  const f = buildPlan({ track: "F", qty: 5000, files: "design", labelPrint: "flexo", box: "folding", start });
  assert.deepEqual(ids(f), ["approve", "files", "proof", "proof_ok", "print", "box", "finishing", "delivery"]);
  assert.deepEqual(S(buildPlan({ track: "F", qty: 500, files: "ready", start }), "proof").start, S(f, "approve").end);
  const p = buildPlan({ track: "P", qty: 1, start });
  assert.deepEqual(ids(p), ["approve", "consult", "trial", "trial_ok", "bottling", "delivery"]);
  assert.ok(p.total[1] <= 28);
  for (const pl of [b, c, d, f, p]) for (const s of pl.stages) assert.ok(PHASES.some((x) => x.id === s.phase) && s.end[0] <= s.end[1] && s.start[0] <= s.start[1], s.id);
});

test("admin overrides change the dates; weeks are rounded for display", () => {
  const base = buildPlan({ track: "E", qty: 1000, formula: "ready", packaging: "yes", start });
  const cfg = { ...DEFAULT_PLAN, maceration: { ...DEFAULT_PLAN.maceration, edp: [40, 60] }, days: { ...DEFAULT_PLAN.days, qc: [5, 5] } };
  const slow = buildPlan({ track: "E", qty: 1000, formula: "ready", packaging: "yes", start }, cfg);
  assert.equal(slow.total[1] - base.total[1], 60 - 35 + 5 - 3);
  assert.deepEqual(weeks([20, 45]), [3, 6]);
  assert.deepEqual(weeks([2, 3]), [1, 1]);
});

test("plan input from a brief payload: quantity bands, formula, oud family, rigid box from the studio, print method", () => {
  const i = planInputFromPayload("E", { a_qty: "1000_5000", a_formula: "reference", a_packaging: "partly", a_family: "oud,musk", box_structure: "rigidSet|L=60", label_print: "flexo", spec_deco: "coat", spec_mould: "semi" });
  assert.deepEqual({ qty: i.qty, formula: i.formula, packaging: i.packaging, oud: i.oud, box: i.box, labelPrint: i.labelPrint, deco: i.deco, mould: i.mould }, { qty: 3000, formula: "reference", packaging: "partly", oud: true, box: "rigid", labelPrint: "flexo", deco: true, mould: "semi" });
  assert.equal(planInputFromPayload("C", { a_need: "bottle,box", a_qty: "gt5000" }).box, "folding");
  assert.equal(planInputFromPayload("C", { a_need: "bottle" }).box, null);
  assert.equal(planInputFromPayload("C", { calc_qty: "2500" }).qty, 2500);
  assert.equal(planInputFromPayload("Z", {}), null);
  assert.equal(planInputFromPayload("P", {}).qty, 1);
});
