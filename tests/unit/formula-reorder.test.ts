// @ts-nocheck — اختبار سلوك: الإفصاح عن المكوّنات، اعتماد التركيبة، أمر الإنتاج، وإعادة الطلب
import { test } from "node:test";
import assert from "node:assert/strict";

const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, String(v)), removeItem: (k: string) => store.delete(k), clear: () => store.clear() };

const { DISCLOSURES, DISCLOSURE_LABELS, DISCLOSURE_HINTS, isDisclosure, revealAmounts, samplesView, sanitizeSamples } = await import("@/kits/types");
const { applyApprove, applyPatch, formulaOf, orderFromLead } = await import("@/kits/repo");
const { stageAfterFormula, reorderStage } = await import("@/projects/stages");
const { projectsRepo, localSetFormula, localFormulaOf, localContractSigned } = await import("@/projects/repo");
const { formulaBatch, formulaLabel } = await import("@/production/types");
const { newOrder } = await import("@/production/logic");
const { DEFAULTS } = await import("@/cms/schema");
const { referenceQty, reorderEligible, reorderProblem, reorderSchedule, reorderSource, reorderTitle, scaleLines, scaleSpecs } = await import("@/projects/reorder");
const { percentTotal, installmentAmounts } = await import("@/contracts/finance");

const S = (over = {}) => ({ id: "s1", code: "A", name: "مسك الليل", concentration: "EDP 18%", notes: "دافئ", ingredients: [{ name: "مسك", amount: 12, unit: "%" }, { name: "عود", amount: 3.5, unit: "%" }], ...over });
const lead = { id: "L1", contactId: "C1", createdAt: "2026-11-01T08:00:00.000Z", payload: { firstName: "نورة", email: "a@x.sa", city: "Riyadh", order_ref: "KIT-7F3K9Q" } };

test("disclosure: four levels, each labelled; amounts show always, after the contract, or never", () => {
  for (const d of DISCLOSURES) assert.ok(DISCLOSURE_LABELS[d].ar && DISCLOSURE_LABELS[d].en && DISCLOSURE_HINTS[d].ar && isDisclosure(d), d);
  assert.ok(!isDisclosure("public"));
  assert.equal(revealAmounts("full", false), true);
  assert.equal(revealAmounts("contract", false), false);
  assert.equal(revealAmounts("contract", true), true, "signing the contract reveals the amounts");
  assert.equal(revealAmounts("names", true), false);
  assert.equal(revealAmounts("hidden", true), false);
});

test("the client view masks amounts or drops ingredients, and never mutates the perfumer's data", () => {
  const samples = [S(), S({ id: "s2", name: "ورد", decision: "accepted", comment: "جميلة" })];
  const names = samplesView(samples, "contract", false);
  assert.deepEqual(names[0].ingredients.map((g) => [g.name, g.amount, g.masked]), [["مسك", 0, true], ["عود", 0, true]]);
  assert.equal(names[1].decision, "accepted", "the client's own decision stays");
  assert.equal(samples[0].ingredients[0].amount, 12, "source untouched");
  assert.equal(samplesView(samples, "contract", true)[0].ingredients[0].amount, 12);
  assert.equal(samplesView(samples, "full", false)[0].ingredients[1].amount, 3.5);
  assert.deepEqual(samplesView(samples, "hidden", true)[0].ingredients, []);
  assert.equal(samplesView(samples, "hidden", true)[0].notes, "دافئ", "name and description remain");
  // ما يعيده الخادم لعميل محجوبة عنه الكميات: اسم بلا amount
  const fromServer = sanitizeSamples([{ id: "s1", name: "مسك", ingredients: [{ name: "مسك" }, { name: "عود", amount: 3, unit: "%" }] }]);
  assert.equal(fromServer[0].ingredients[0].masked, true); assert.equal(fromServer[0].ingredients[1].masked, undefined);
});

test("approving a formula: the client only an accepted sample after shipping; the team never a rejected one", () => {
  let o = { ...orderFromLead(lead), projectId: "p1", samples: [S({ decision: "accepted" }), S({ id: "s2", name: "ورد", decision: "rejected" }), S({ id: "s3", name: "خشب" })] };
  assert.equal(o.disclosure, "contract", "new shipments protect the formula by default");
  assert.throws(() => applyApprove(o, "s1", "client"), /kit_not_shipped/);
  o = applyPatch(o, { status: "shipped", carrier: "SMSA" }, "u1");
  assert.throws(() => applyApprove(o, "s2", "client"), /kit_sample_not_accepted/);
  assert.throws(() => applyApprove(o, "s3", "client"), /kit_sample_not_accepted/, "unrated is not accepted");
  assert.throws(() => applyApprove(o, "zz", "client"), /kit_sample_not_found/);
  const done = applyApprove(o, "s1", "client", "2026-11-10T00:00:00Z");
  assert.equal(done.approvedSample, "s1"); assert.equal(done.approvedAt, "2026-11-10T00:00:00Z");
  assert.throws(() => applyApprove(o, "s2", "team"), /kit_sample_rejected/);
  assert.equal(applyApprove(o, "s3", "team").approvedSample, "s3", "the team may set an unrated sample (approved by phone)");
  assert.throws(() => applyApprove({ ...o, projectId: null }, "s1", "team"), /kit_no_project/);
  const f = formulaOf(done, "client");
  assert.equal(f.projectId, "p1"); assert.equal(f.ref, "KIT-7F3K9Q"); assert.equal(f.name, "مسك الليل"); assert.equal(f.ingredients.length, 2); assert.equal(f.ingredients[0].amount, 12, "the full formula, not the client view");
  assert.equal(formulaOf({ ...done, projectId: null }, "client"), null);
  // تعديل الفريق لا يمسح الاعتماد، وتغيير مفتاح الإفصاح يُحفظ
  const edited = applyPatch(done, { disclosure: "full", samples: done.samples }, "u1");
  assert.equal(edited.approvedSample, "s1"); assert.equal(edited.disclosure, "full");
  assert.throws(() => applyPatch(done, { disclosure: "everyone" }, "u1"), /disclosure/);
});

test("approving the formula ends the sampling stage where the track has one", () => {
  assert.equal(stageAfterFormula("A", "formula"), "identity");
  assert.equal(stageAfterFormula("B", "first_round"), "approval");
  assert.equal(stageAfterFormula("B", "refinement"), "approval");
  assert.equal(stageAfterFormula("P", "sampling"), "bottling");
  assert.equal(stageAfterFormula("A", "production"), null, "later stages don't move back");
  assert.equal(stageAfterFormula("E", "sourcing"), null);
  assert.equal(stageAfterFormula(null, "sampling"), null);
});

const owner = { id: "u-owner", role: "owner" as const, email: "owner@x.sa", name: "o" };
const client = { id: "u-a", role: "client" as const, email: "a@x.sa", name: "a" };
const other = { id: "u-b", role: "client" as const, email: "b@x.sa", name: "b" };
const blank = { title: "عطر الليل", track: "A", contactId: null, designerId: null, ownerId: null, stage: "formula", status: "active", dueDate: null } as const;
const formula = (projectId) => ({ projectId, ref: "SMP-ABC234", sampleId: "s1", code: "A", name: "مسك الليل", concentration: "EDP 18%", notes: "", ingredients: [{ name: "مسك", amount: 12, unit: "%" }, { name: "كحول", amount: 82, unit: "%" }, { name: "صبغة", amount: 2, unit: "drops" }], approvedAt: "2026-11-10T00:00:00Z", by: "client" as const });

test("project formula: summary for the client, ingredients for the team only, stage advances, a system note is posted", async () => {
  const p = await projectsRepo.createProject({ ...blank, clientEmail: "a@x.sa" }, owner);
  assert.equal(localFormulaOf(p.id), null);
  const next = localSetFormula(formula(p.id));
  assert.equal(next.stage, "identity"); assert.equal(next.formula.name, "مسك الليل"); assert.equal(next.formula.ingredients, undefined, "the summary carries no ingredients");
  const team = await projectsRepo.load(owner);
  assert.equal(team.formulas.find((f) => f.projectId === p.id).ingredients.length, 3);
  const mine = await projectsRepo.load(client);
  assert.equal(mine.formulas.length, 0, "the client never receives the ingredient table");
  assert.equal(mine.projects.find((x) => x.id === p.id).formula.ref, "SMP-ABC234");
  assert.ok(mine.comments.some((c) => c.body.includes("اعتمد العميل العينة A · «مسك الليل»") && !c.fromClient));
  assert.equal(localSetFormula(formula("nope")), null);
  assert.equal(localContractSigned(p.id), false); assert.equal(localContractSigned(null), false);
});

test("a production order carries a fixed snapshot of the formula and the batch quantities", () => {
  const f = { kitRef: "SMP-ABC234", sampleId: "s1", code: "A", name: "مسك الليل", concentration: "EDP 18%", ingredients: formula("p").ingredients, approvedBy: "client" as const, approvedAt: "2026-11-10T00:00:00Z" };
  const o = newOrder({ projectId: "p", projectTitle: "عطر", kind: "perfume", product: "مسك 50", qty: 1000, fillMl: 50, concentration: "edp", oud: false, dueAt: null }, DEFAULTS.ops.production, { ref: 1, batch: 1 }, new Date("2026-11-12T09:00:00Z"), "id1", f);
  assert.equal(o.formula.name, "مسك الليل"); assert.equal(o.formulaRef, "SMP-ABC234 · A · مسك الليل"); assert.equal(formulaLabel(f), o.formulaRef);
  const rows = formulaBatch(o.formula, o.qty, o.fillMl);
  assert.equal(rows[0].batchMl, 6000, "12% of 50 L"); assert.equal(rows[1].batchMl, 41000); assert.equal(rows[2].batchMl, null, "non-percent units are not scaled");
  assert.equal(formulaBatch(o.formula, 1000, 50, 3)[0].batchMl, 6180, "with 3% wastage");
  const plain = newOrder({ projectId: null, projectTitle: "", kind: "perfume", product: "داخلي", qty: 10, fillMl: 50, concentration: "edp", oud: false, dueAt: null }, DEFAULTS.ops.production, { ref: 2, batch: 2 }, new Date(), "id2");
  assert.equal(plain.formula, null); assert.equal(plain.formulaRef, "");
  const pack = newOrder({ projectId: "p", projectTitle: "", kind: "packaging", product: "علب", qty: 10, fillMl: 0, concentration: "edp", oud: false, dueAt: null }, DEFAULTS.ops.production, { ref: 3, batch: 3 }, new Date(), "id3", f);
  assert.equal(pack.formulaRef, "", "a packaging-only order has no formula reference");
});

// ─── إعادة الطلب ───
test("reference quantity: the most repeated above one, ties to the larger; one-off lines stay", () => {
  assert.equal(referenceQty([1000, 1000, 1, 500]), 1000);
  assert.equal(referenceQty([500, 1000]), 1000);
  assert.equal(referenceQty([1, 1]), null);
  assert.equal(referenceQty([]), null);
  const lines = [{ label: "عطر", qty: 1000, unit: 10 }, { label: "علبة", qty: 1000, unit: 4 }, { label: "تصميم", qty: 1, unit: 3000 }, { label: "عينات", qty: 20, unit: 5 }];
  assert.deepEqual(scaleLines(lines, 1000, 2500).map((l) => l.qty), [2500, 2500, 1, 20]);
  assert.deepEqual(scaleLines(lines, 1000, null).map((l) => l.qty), [1000, 1000, 1, 20], "no new quantity = same order");
  const specs = scaleSpecs([{ id: "a", name: "زجاجة", description: "", qty: 1000, unit: "قطعة", images: ["sb:projects/old/x.webp"], files: ["sb:projects/old/y.pdf"] }], 1000, 3000);
  assert.equal(specs[0].qty, 3000); assert.deepEqual(specs[0].images, []); assert.deepEqual(specs[0].files, [], "files of the old project folder are not carried over");
});

test("reorder schedule: first installment follows the new deposit, the last takes the rest, old due dates drop", () => {
  const old = [{ id: "a", label: "مقدمة", percent: 30, due: "عند التوقيع", dueDate: "2026-01-01" }, { id: "b", label: "إنتاج", percent: 40, due: "" }, { id: "c", label: "نهائية", percent: 30, due: "" }];
  const s = reorderSchedule(old, 23000, 11500);
  assert.deepEqual(s.map((r) => r.percent), [50, 40, 10]); assert.equal(percentTotal(s), 100); assert.equal(s[0].dueDate, undefined);
  assert.equal(installmentAmounts(23000, s)[0], 11500);
  assert.equal(reorderSchedule(old, 23000, 16100).length, 2, "deposit + middle over 100: deposit and balance");
  assert.deepEqual(reorderSchedule(old, 23000, null).map((r) => r.percent), [30, 40, 30], "no quote: same percentages");
  assert.deepEqual(reorderSchedule([], 1000, 500), []);
  assert.equal(reorderTitle("عطر الليل", 1), "عطر الليل · إعادة طلب 1");
  assert.equal(reorderTitle("عطر الليل · إعادة طلب 1", 2), "عطر الليل · إعادة طلب 2", "the suffix does not stack");
  assert.equal(reorderProblem({ qty: 0, due: null, note: "" }), "reorder_qty");
  assert.equal(reorderProblem({ qty: null, due: "2020-01-01", note: "" }), "bad_date");
  assert.equal(reorderProblem({ qty: 500, due: null, note: "" }), null);
  assert.equal(reorderStage("A"), "production"); assert.equal(reorderStage("E"), "sourcing"); assert.equal(reorderStage("D"), "brief");
});

test("one-click reorder: a new linked project with the formula, a draft quote at the new quantity and a draft contract", async () => {
  const p = await projectsRepo.createProject({ ...blank, title: "عطر الفجر", clientEmail: "a@x.sa" }, owner);
  await assert.rejects(projectsRepo.reorder(p.id, { qty: 2000, due: null, note: "" }, client), /reorder_not_eligible/, "nothing contracted yet");
  localSetFormula(formula(p.id));
  const quote = await projectsRepo.saveQuote({ projectId: p.id, lines: [{ label: "عطر 50 مل", qty: 1000, unit: 10 }, { label: "رسوم تصميم", qty: 1, unit: 2000 }], depositPct: 50, validUntil: null, notes: "", discountKind: null, discountValue: 0 }, null, owner, { lines: [{ unitCost: 4 }, { unitCost: 0 }], extraCost: 100 });
  await projectsRepo.sendQuote(quote.id, owner);
  await projectsRepo.decideQuote(quote.id, "accepted", "", client);
  const total = (await projectsRepo.load(owner)).quotes.find((x) => x.id === quote.id).total;
  const c = await projectsRepo.saveContract({ projectId: p.id, quoteId: quote.id, title: "عقد عطر الفجر", company: { name: "المصنع", idLabel: "", idNumber: "", address: "", representative: "" }, client: { name: "العميل", idLabel: "", idNumber: "", address: "", representative: "" }, sections: [{ title: "الموضوع", body: "تصنيع" }], specs: [{ id: "x", name: "عطر 50 مل", description: "", qty: 1000, unit: "قطعة", images: [], files: [] }], total, vatRate: 15, schedule: [{ id: "a", label: "مقدمة", percent: 50, due: "", dueDate: "2026-12-01" }, { id: "b", label: "نهائية", percent: 50, due: "" }], file: null, fileName: null }, null, owner);
  await projectsRepo.sendContract(c.id, owner);
  const hash = (await projectsRepo.load(client)).contracts.find((x) => x.id === c.id).contentHash;
  await projectsRepo.signContract(c.id, "client", "idb:sig", "العميل", hash, client);

  await assert.rejects(projectsRepo.reorder(p.id, { qty: 2000, due: null, note: "" }, other), "another client cannot reorder it");
  await assert.rejects(projectsRepo.reorder(p.id, { qty: -1, due: null, note: "" }, client), /reorder_qty/);
  const id = await projectsRepo.reorder(p.id, { qty: 2500, due: "2099-03-01", note: "نفس العلبة بلون أغمق" }, client);
  const mine = await projectsRepo.load(client);
  const np = mine.projects.find((x) => x.id === id);
  assert.equal(np.title, "عطر الفجر · إعادة طلب 1"); assert.equal(np.reorderOf, p.id); assert.equal(np.stage, "production"); assert.equal(np.dueDate, "2099-03-01");
  assert.equal(np.formula.name, "مسك الليل", "the approved formula carries over"); assert.equal(np.brief.reorder_qty, "2500");
  assert.equal(mine.quotes.filter((x) => x.projectId === id).length, 0, "the client doesn't see the draft quote until it is sent");
  assert.ok(mine.comments.some((x) => x.projectId === id && x.fromClient && x.body.includes("الكمية 2,500") && x.body.includes("نفس العلبة")));

  const team = await projectsRepo.load(owner);
  const nq = team.quotes.find((x) => x.projectId === id);
  assert.equal(nq.status, "draft"); assert.deepEqual(nq.lines.map((l) => l.qty), [2500, 1], "the batch line scales; the one-off fee stays for the team to review");
  assert.equal(nq.subtotal, 27000); assert.equal(nq.total, 31050); assert.equal(nq.deposit, 15525); assert.notEqual(nq.ref, quote.ref);
  assert.equal(team.quoteCosts.find((x) => x.quoteId === nq.id).extraCost, 100, "internal costs copied so the margin shows");
  const nc = team.contracts.find((x) => x.projectId === id);
  assert.equal(nc.status, "draft"); assert.equal(nc.quoteId, nq.id); assert.equal(nc.total, 31050); assert.equal(nc.specs[0].qty, 2500); assert.equal(nc.clientSignature, null);
  assert.equal(installmentAmounts(nc.total, nc.schedule)[0], 15525, "first installment equals the new deposit"); assert.equal(nc.schedule[0].dueDate, undefined);
  assert.equal(team.formulas.find((f) => f.projectId === id).ingredients.length, 3);
  // الفريق يرسل العقد كما هو: لا تعارض مع العربون
  await projectsRepo.sendQuote(nq.id, owner);
  await projectsRepo.sendContract(nc.id, owner);

  // لا تتراكم طلبات لم تُسعَّر
  const id2 = await projectsRepo.reorder(p.id, { qty: null, due: null, note: "" }, client);
  assert.equal((await projectsRepo.load(client)).projects.find((x) => x.id === id2).title, "عطر الفجر · إعادة طلب 2");
  const id3 = await projectsRepo.reorder(p.id, { qty: null, due: null, note: "" }, owner);
  assert.ok(id3);
  await assert.rejects(projectsRepo.reorder(p.id, { qty: null, due: null, note: "" }, client), /reorder_pending/);
  assert.ok(reorderEligible(team.quotes.filter((x) => x.projectId === p.id), team.contracts.filter((x) => x.projectId === p.id)));
  assert.equal(reorderSource([], []).quote, null);
});

test("kit status hints: a named round never mentions payment or the three discovery directions", async () => {
  const { kitStatusHint, KIT_STATUS_HINTS } = await import("@/kits/types");
  assert.equal(kitStatusHint("new", "kit"), KIT_STATUS_HINTS.new);
  assert.equal(kitStatusHint("shipped", "round"), KIT_STATUS_HINTS.shipped);
  for (const s of ["new", "preparing", "delivered"] as const) {
    const h = kitStatusHint(s, "round");
    assert.ok(!/الدفع|الثلاثة|payment|three/.test(h.ar + h.en), s);
  }
});
