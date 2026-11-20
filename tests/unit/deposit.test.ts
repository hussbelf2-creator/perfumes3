// @ts-nocheck — اختبار سلوك: العربون هو الدفعة الأولى من العقد، لا مبلغ ثانٍ
import { test } from "node:test";
import assert from "node:assert/strict";

const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, String(v)), removeItem: (k: string) => store.delete(k), clear: () => store.clear() };

const { contractMoney, depositMethod, depositMismatch, expectedDeposit, firstInstallmentAmount, installmentAmounts, matchDeposit, percentTotal, quoteMethod, scheduleFromQuote } = await import("@/contracts/finance");
const { newContract } = await import("@/contracts/template");
const { projectsRepo } = await import("@/projects/repo");

const row = (id, percent, label = "دفعة") => ({ id, label, percent, due: "" });
const q = (over = {}) => ({ id: "q1", ref: "QT-260001", status: "accepted", deposit: 5750, paidAmount: null, ...over });

test("expected deposit: the paid amount once paid, else the quote's deposit; unlinked or zero deposits don't bind", () => {
  assert.equal(expectedDeposit(q()), 5750);
  assert.equal(expectedDeposit(q({ status: "sent" })), 5750);
  assert.equal(expectedDeposit(q({ status: "paid", paidAmount: 6000 })), 6000);
  assert.equal(expectedDeposit(q({ status: "draft" })), null);
  assert.equal(expectedDeposit(q({ status: "void" })), null);
  assert.equal(expectedDeposit(q({ deposit: 0 })), null);
  assert.equal(expectedDeposit(null), null);
});

test("mismatch is detected to the halala and fixed in one click, keeping the middle installments", () => {
  const s = [row("a", 40), row("b", 30), row("c", 30)];
  assert.deepEqual(depositMismatch(11500, s, q()), { expected: 5750, first: 4600 });
  const fixed = matchDeposit(11500, s, 5750);
  assert.deepEqual(fixed.map((r) => r.percent), [50, 30, 20]);
  assert.equal(percentTotal(fixed), 100);
  assert.equal(depositMismatch(11500, fixed, q()), null);
  assert.equal(depositMismatch(11500, [], q()), null, "no schedule, nothing to match");
  assert.equal(depositMismatch(11500, s, null), null, "no linked quote");
});

test("an odd paid amount still matches exactly (six-decimal percentage); a schedule that can't absorb it becomes two rows", () => {
  const fixed = matchDeposit(19550, [row("a", 50), row("b", 50)], 10000);
  assert.equal(installmentAmounts(19550, fixed)[0], 10000);
  assert.equal(installmentAmounts(19550, fixed)[1], 9550);
  assert.equal(percentTotal(fixed), 100);
  const tight = matchDeposit(1000, [row("a", 10), row("b", 60), row("c", 30)], 500);
  assert.equal(tight.length, 2, "middle + deposit exceed 100: collapse to deposit + balance");
  assert.deepEqual(installmentAmounts(1000, tight), [500, 500]);
  assert.deepEqual(matchDeposit(1000, [row("a", 50), row("b", 50)], 1000).map((r) => r.percent), [100], "fully prepaid = single installment");
  assert.equal(matchDeposit(1000, [], 300).length, 2, "an empty schedule gets deposit + balance");
});

test("a contract drafted from a quote starts with the deposit as its first installment (the paid amount if already paid)", () => {
  const project = { id: "p1", title: "عطر", dueDate: null };
  const site = { billing: { legalName: "المصنع", cr: "1010" }, address: { ar: "الرياض" } };
  const quote = { id: "q1", ref: "QT-260001", status: "accepted", lines: [], total: 11500, subtotal: 10000, deposit: 3450, vatRate: 15 };
  const c = newContract({ project, quote, site, clientName: "نورة" });
  assert.equal(firstInstallmentAmount(c.total, c.schedule), 3450);
  const paid = newContract({ project, quote: { ...quote, status: "paid", paidAmount: 5000 }, site, clientName: "نورة" });
  assert.equal(firstInstallmentAmount(paid.total, paid.schedule), 5000);
  assert.equal(percentTotal(scheduleFromQuote(19550, 10000)), 100);
});

test("payment methods map both ways between the quote and the invoice", () => {
  assert.equal(depositMethod("moyasar"), "online"); assert.equal(depositMethod("cash"), "cash"); assert.equal(depositMethod("bank"), "bank"); assert.equal(depositMethod(null), "bank");
  assert.equal(quoteMethod("online"), "moyasar"); assert.equal(quoteMethod("card"), "bank"); assert.equal(quoteMethod("cash"), "cash");
});

const owner = { id: "u-owner", role: "owner" as const, email: "owner@x.sa", name: "o" };
const client = { id: "u-a", role: "client" as const, email: "a@x.sa", name: "a" };
const blank = { title: "مشروع", track: "A", contactId: null, designerId: null, ownerId: null, stage: "brief", status: "active", dueDate: null } as const;
const draft = (projectId, quoteId, schedule) => ({ projectId, quoteId, title: "عقد", company: { name: "المصنع", idLabel: "", idNumber: "", address: "", representative: "" }, client: { name: "العميل", idLabel: "", idNumber: "", address: "", representative: "" }, sections: [{ title: "الموضوع", body: "تصنيع" }], specs: [], total: 11500, vatRate: 15, schedule, file: null, fileName: null });
async function setup(schedule = [row("a", 50, "دفعة مقدمة"), row("b", 50, "الدفعة النهائية")]) {
  const p = await projectsRepo.createProject({ ...blank, clientEmail: "a@x.sa" }, owner);
  // 10,000 قبل الضريبة → 11,500، عربون 50% = 5,750
  const quote = await projectsRepo.saveQuote({ projectId: p.id, lines: [{ label: "عطر", qty: 1000, unit: 10 }], depositPct: 50, validUntil: null, notes: "", discountKind: null, discountValue: 0 }, null, owner);
  await projectsRepo.sendQuote(quote.id, owner);
  await projectsRepo.decideQuote(quote.id, "accepted", "", client);
  const c = await projectsRepo.saveContract(draft(p.id, quote.id, schedule), null, owner);
  return { p, quote, c };
}
const sign = async (c) => {
  const hash = (await projectsRepo.load(client)).contracts.find((x) => x.id === c.id).contentHash;
  return projectsRepo.signContract(c.id, "client", "idb:sig", "العميل", hash, client);
};
const state = async (c, quote) => {
  const d = await projectsRepo.load(owner);
  return { d, contract: d.contracts.find((x) => x.id === c.id), quote: d.quotes.find((x) => x.id === quote.id), pays: d.contractPayments.filter((x) => x.contractId === c.id), project: d.projects.find((x) => x.id === c.projectId) };
};

test("a contract whose first installment differs from the quote's deposit cannot be sent", async () => {
  const { c, quote } = await setup([row("a", 40), row("b", 60)]);
  await assert.rejects(projectsRepo.sendContract(c.id, owner), /contract_deposit_mismatch/);
  await projectsRepo.saveContract(draft(c.projectId, quote.id, matchDeposit(11500, [row("a", 40), row("b", 60)], 5750)), c.id, owner);
  await projectsRepo.sendContract(c.id, owner);
  assert.equal((await state(c, quote)).contract.status, "sent");
});

test("deposit paid first, then the client signs: the first installment is settled at signing with a deposit invoice", async () => {
  const { c, quote } = await setup();
  await projectsRepo.sendContract(c.id, owner);
  await projectsRepo.markQuotePaid(quote.id, "bank", "TRX-77", 5750, owner);
  assert.equal((await state(c, quote)).pays.length, 0, "nothing is invoiced before the contract is signed");
  await sign(c);
  const s = await state(c, quote);
  assert.equal(s.pays.length, 1);
  const pay = s.pays[0];
  assert.equal(pay.installmentId, "a"); assert.equal(pay.amount, 5750); assert.equal(pay.source, "deposit"); assert.equal(pay.quoteId, quote.id);
  assert.equal(pay.method, "bank"); assert.equal(pay.ref, "TRX-77"); assert.match(pay.note, /من عربون عرض السعر QT-/); assert.match(pay.invoiceNo, /^INV-/);
  assert.ok(s.d.comments.some((x) => x.body.includes("عربونك المدفوع سدّد") && !x.fromClient));
  const m = contractMoney(s.contract, s.pays);
  assert.equal(m.paid, 5750); assert.equal(m.next.inst.id, "b");
  await assert.rejects(projectsRepo.recordContractPayment(c.id, "a", { method: "bank", ref: "", paidAt: "", note: "" }, owner), /installment_paid/, "the deposit can't be charged twice");
});

test("client signs first, then pays the deposit: the installment is settled the moment the deposit lands", async () => {
  const { c, quote } = await setup();
  await projectsRepo.sendContract(c.id, owner);
  await sign(c);
  assert.equal((await state(c, quote)).pays.length, 0);
  await projectsRepo.markQuotePaid(quote.id, "cash", "REC-9", 5750, owner);
  const s = await state(c, quote);
  assert.equal(s.pays.length, 1); assert.equal(s.pays[0].source, "deposit"); assert.equal(s.pays[0].method, "cash");
});

test("recording the first installment on the contract marks the quote paid and starts the project, once", async () => {
  const { c, quote, p } = await setup();
  await projectsRepo.sendContract(c.id, owner);
  await sign(c);
  const pay = await projectsRepo.recordContractPayment(c.id, "a", { method: "card", ref: "POS-1", paidAt: "", note: "" }, owner);
  const s = await state(c, quote);
  assert.equal(s.quote.status, "paid"); assert.equal(s.quote.paidAmount, 5750); assert.equal(s.quote.paymentMethod, "bank"); assert.equal(s.quote.paymentRef, "POS-1");
  assert.equal(s.project.stage, "formula", "paying starts the work, as a paid deposit does");
  assert.equal(s.pays.length, 1, "no second invoice from the quote side"); assert.equal(pay.quoteId, quote.id);
  await assert.rejects(projectsRepo.markQuotePaid(quote.id, "bank", "X", 5750, owner), /not_payable/, "the client is not asked for the deposit again");
  // دفعة لاحقة لا تمس العرض
  await projectsRepo.recordContractPayment(c.id, "b", { method: "bank", ref: "", paidAt: "", note: "" }, owner);
  assert.equal((await state(c, quote)).pays.length, 2);
  assert.ok(p.id);
});

test("a transfer larger than the deposit is not guessed at: no automatic invoice, the team settles it by hand", async () => {
  const { c, quote } = await setup();
  await projectsRepo.sendContract(c.id, owner);
  await sign(c);
  await projectsRepo.markQuotePaid(quote.id, "bank", "TRX-BIG", 8000, owner);
  const s = await state(c, quote);
  assert.equal(s.quote.status, "paid"); assert.equal(s.pays.length, 0);
  const pay = await projectsRepo.recordContractPayment(c.id, "a", { method: "bank", ref: "TRX-BIG", paidAt: "", note: "" }, owner);
  assert.equal(pay.amount, 5750); assert.equal(pay.source, "manual");
});

test("a contract with no linked quote is untouched by any of this", async () => {
  const p = await projectsRepo.createProject({ ...blank, clientEmail: "a@x.sa" }, owner);
  const c = await projectsRepo.saveContract(draft(p.id, null, [row("a", 30), row("b", 70)]), null, owner);
  await projectsRepo.sendContract(c.id, owner);
  await sign(c);
  const d = await projectsRepo.load(owner);
  assert.equal(d.contractPayments.filter((x) => x.contractId === c.id).length, 0);
});
