// @ts-nocheck — اختبار سلوك
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PLAN } from "../../src/production/plan";
import { aqlPlan, qcVerdict, bomRequired, fillFrom, progressOf, stepBlock, stepsFor, batchNumber, currentStep } from "../../src/production/types";
import { newOrder, applyStep, applyPoPatch, pendingIssues, yieldPct, PoError } from "../../src/production/logic";

const QC = [
  { id: "leak", cls: "critical", text: { ar: "لا تسرّب", en: "No leak" } },
  { id: "fill", cls: "major", text: { ar: "مستوى التعبئة", en: "Fill level" } },
  { id: "carton", cls: "minor", text: { ar: "العلبة سليمة", en: "Carton clean" } },
];
const cfg = { ...DEFAULT_PLAN, qc: QC, wastagePct: 3 };
const t0 = new Date("2026-11-14T08:00:00Z");
const day = (n) => new Date(t0.getTime() + n * 864e5);
const make = (o = {}) => newOrder({ projectId: "P1", projectTitle: "مسك الليل", kind: "perfume", product: "مسك الليل EDP 50 مل", qty: 2000, fillMl: 50, concentration: "edp", oud: false, dueAt: null, ...o }, cfg, { ref: 7, batch: 2 }, t0, "id1");
const code = (fn) => { try { fn(); return null; } catch (e) { return e.code; } };
const run = (o, ids, at = t0) => ids.reduce((acc, id) => applyStep(acc, id, true, "U1", at), o);

test("AQL level II: sample size and accept numbers by lot size (critical always 0)", () => {
  assert.deepEqual(aqlPlan(5000), { sample: 200, accept: { critical: 0, major: 10, minor: 14 } });
  assert.deepEqual(aqlPlan(1000), { sample: 80, accept: { critical: 0, major: 5, minor: 7 } });
  assert.deepEqual(aqlPlan(300), { sample: 50, accept: { critical: 0, major: 3, minor: 5 } });
  assert.equal(aqlPlan(20).sample, 5);
  assert.equal(aqlPlan(3).sample, 2);
  assert.equal(aqlPlan(1).sample, 1, "never sample more than the lot");
  assert.equal(aqlPlan(1e7).sample, 1250);
});

test("a new order: reference, batch number, steps by kind, QC list and maceration days from settings", () => {
  const o = make();
  assert.equal(o.ref, "PO-2611-007");
  assert.equal(o.batchNo, "B261114-02");
  assert.equal(batchNumber(new Date("2027-01-05T00:00:00Z"), 11), "B270105-11");
  assert.deepEqual(o.steps.map((s) => s.id), ["materials", "golden", "compound", "maceration", "filter", "fill", "pack", "qc", "release"]);
  assert.equal(o.status, "planned");
  assert.equal(o.macerationDays, DEFAULT_PLAN.maceration.edp[0]);
  assert.equal(make({ concentration: "extrait", oud: true }).macerationDays, 28 + 14);
  assert.deepEqual(o.qc.map((q) => [q.id, q.defects]), [["leak", null], ["fill", null], ["carton", null]]);
  const pk = make({ kind: "packaging", fillMl: 0 });
  assert.deepEqual(pk.steps.map((s) => s.id), ["materials", "golden", "pack", "qc", "release"]);
  assert.deepEqual(stepsFor("packaging"), ["materials", "golden", "pack", "qc", "release"]);
  assert.equal(pk.macerationDays, 0);
  assert.equal(code(() => make({ product: " " })), "product");
  assert.equal(code(() => make({ qty: 0 })), "qty");
  assert.equal(code(() => make({ fillMl: 0 })), "fill_ml");
});

test("steps go in order; the golden sample needs a signature; compounding starts the maceration clock", () => {
  let o = make();
  assert.equal(code(() => applyStep(o, "compound", true, "U1", t0)), "step_order");
  o = applyStep(o, "materials", true, "U1", t0, "ورد كل شيء");
  assert.equal(o.status, "in_progress");
  assert.deepEqual({ by: o.steps[0].by, note: o.steps[0].note, at: o.steps[0].doneAt }, { by: "U1", note: "ورد كل شيء", at: t0.toISOString() });
  assert.equal(code(() => applyStep(o, "golden", true, "U1", t0)), "golden_required");
  o = applyPoPatch(o, { goldenAt: t0.toISOString() }, t0);
  o = run(o, ["golden", "compound"], day(1));
  assert.equal(o.macerationStart, day(1).toISOString());
  assert.equal(fillFrom(o).toISOString(), day(1 + 21).toISOString());
  assert.equal(currentStep(o), "maceration");
});

test("maceration can't be cut short without a logged deviation", () => {
  let o = applyPoPatch(make(), { goldenAt: t0.toISOString() }, t0);
  o = run(o, ["materials", "golden", "compound"], t0);
  assert.equal(stepBlock(o, "maceration", day(10)), "maceration_running");
  assert.equal(code(() => applyStep(o, "maceration", true, "U1", day(10))), "maceration_running");
  assert.equal(stepBlock(o, "maceration", day(21)), null);
  const dev = applyPoPatch(o, { deviation: "طلب العميل التسليم المبكر، وافق مدير الجودة" }, day(10));
  assert.equal(applyStep(dev, "maceration", true, "U1", day(10)).steps[3].done, true);
  // التراجع عن التحضير يصفّر الساعة، ولا يُتراجع إلا عن آخر خطوة
  assert.equal(code(() => applyStep(o, "materials", false, "U1", t0)), "undo_last_only");
  const back = applyStep(o, "compound", false, "U1", t0);
  assert.equal(back.macerationStart, null);
  assert.equal(back.steps[2].done, false);
});

test("release needs a complete QC inside AQL limits and a recorded yield; then the record locks", () => {
  let o = applyPoPatch(make(), { goldenAt: t0.toISOString() }, t0);
  o = run(o, ["materials", "golden", "compound"], t0);
  o = run(o, ["maceration", "filter", "fill", "pack", "qc"], day(22));
  assert.equal(stepBlock(o, "release", day(23)), "qc_incomplete");
  o = applyPoPatch(o, { qc: [{ id: "leak", defects: 1 }, { id: "fill", defects: 2 }, { id: "carton", defects: 3 }] }, day(23));
  assert.deepEqual(qcVerdict(o).defects, { critical: 1, major: 2, minor: 3 });
  assert.equal(qcVerdict(o).pass, false, "one critical defect fails the lot");
  assert.equal(stepBlock(o, "release", day(23)), "qc_failed");
  o = applyPoPatch(o, { qc: [{ id: "leak", defects: 0 }] }, day(23));
  assert.equal(qcVerdict(o).pass, true);
  assert.equal(qcVerdict(o).sample, 125);
  assert.equal(stepBlock(o, "release", day(23)), "yield_required");
  o = applyPoPatch(o, { goodUnits: 1964, rejects: 36 }, day(23));
  assert.equal(yieldPct(o), 98.2);
  o = applyStep(o, "release", true, "QA1", day(23));
  assert.equal(o.status, "released");
  assert.equal(o.releasedBy, "QA1");
  assert.equal(o.releasedAt, day(23).toISOString());
  assert.equal(code(() => applyPoPatch(o, { qty: 5 }, day(24))), "order_closed");
  assert.equal(code(() => applyStep(o, "release", false, "U1", day(24))), "order_closed");
  assert.equal(applyPoPatch(o, { note: "شُحنت" }, day(24)).note, "شُحنت");
  // فوق حد القبول للرئيسي
  const many = { ...make({ qty: 1000 }), qc: [{ id: "fill", cls: "major", text: QC[1].text, defects: 6 }] };
  assert.equal(qcVerdict(many).pass, false);
  assert.equal(qcVerdict({ ...many, qc: [{ ...many.qc[0], defects: 5 }] }).pass, true);
});

test("BOM: required = per unit × qty × (1 + wastage); issued is only set by stock issues; hold pauses the steps", () => {
  let o = make();
  o = applyPoPatch(o, { bom: [{ id: "l1", itemId: "I1", name: "زجاجة 50 مل", perUnit: 1, wastagePct: 3, issued: 999, source: "factory" }, { id: "l2", itemId: null, name: "علبة من العميل", perUnit: 1, wastagePct: 0, issued: 0, source: "client" }, { id: "l3", itemId: "I3", name: "زيت عطري (كغ)", perUnit: 0.0075, wastagePct: 2, issued: 0, source: "factory" }] }, t0);
  assert.equal(o.bom[0].issued, 0, "issued can't be forged from the form");
  assert.equal(bomRequired(o.bom[0], o.qty), 2060);
  assert.equal(bomRequired(o.bom[2], o.qty), 15.3);
  assert.deepEqual(pendingIssues(o).map((x) => [x.line.id, x.qty]), [["l1", 2060], ["l3", 15.3]]);
  const part = { ...o, bom: o.bom.map((l) => (l.id === "l1" ? { ...l, issued: 2000 } : l)) };
  assert.deepEqual(pendingIssues(part).map((x) => [x.line.id, x.qty]), [["l1", 60], ["l3", 15.3]]);
  assert.equal(code(() => applyPoPatch(o, { bom: [{ id: "x", name: "", perUnit: 1, wastagePct: 0 }] }, t0)), "bom_name");
  assert.equal(code(() => applyPoPatch(o, { bom: [{ id: "x", name: "a", perUnit: 0, wastagePct: 0 }] }, t0)), "bom_per_unit");
  const held = applyPoPatch(o, { hold: true }, t0);
  assert.equal(held.status, "on_hold");
  assert.equal(code(() => applyStep(held, "materials", true, "U1", t0)), "order_on_hold");
  assert.equal(applyPoPatch(held, { hold: false }, t0).status, "planned");
  assert.deepEqual(applyPoPatch(o, { docs: { ifra: "51st!", sds: 1, allergens: 0, ghad: "GHAD 123/45" } }, t0).docs, { ifra: "51st", sds: true, allergens: false, ghad: "GHAD12345" });
});

test("what the client sees: four simple phases, the maceration date, never the internals", () => {
  let o = applyPoPatch(make(), { goldenAt: t0.toISOString() }, t0);
  let p = progressOf(o);
  assert.deepEqual(p.phases.map((x) => [x.id, x.done, x.current]), [["pack", false, true], ["juice", false, false], ["produce", false, false], ["deliver", false, false]]);
  o = run(o, ["materials", "golden", "compound"], t0);
  p = progressOf(o);
  assert.deepEqual(p.phases.map((x) => [x.id, x.done, x.current]), [["pack", true, false], ["juice", false, true], ["produce", false, false], ["deliver", false, false]]);
  assert.equal(p.step, "maceration");
  assert.equal(p.fillFrom, day(21).toISOString());
  assert.deepEqual(Object.keys(p).sort(), ["batchNo", "dueAt", "fillFrom", "phases", "product", "qty", "ref", "releasedAt", "status", "step"]);
  assert.deepEqual(progressOf(make({ kind: "packaging", fillMl: 0 })).phases.map((x) => x.id), ["pack", "produce", "deliver"]);
  assert.ok(new PoError("x") instanceof Error);
});
