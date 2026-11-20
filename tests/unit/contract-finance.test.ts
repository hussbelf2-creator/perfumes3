// @ts-nocheck — اختبار سلوك: قيمة العقد، جدول الدفعات، السداد، والفواتير
import { test } from "node:test";
import assert from "node:assert/strict";

const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, String(v)), removeItem: (k: string) => store.delete(k), clear: () => store.clear() };

const { SCHEDULE_PRESETS, contractMoney, financeProblem, installmentAmounts, invoiceNo, parseZatcaTlv, payable, percentTotal, presetRows, scheduleFromQuote, vatSplit, zatcaTimestamp, zatcaTlv } = await import("@/contracts/finance");
const { proformaInvoice, taxInvoice } = await import("@/contracts/invoice");
const { projectsRepo } = await import("@/projects/repo");

const row = (id, percent, label = "دفعة", due = "") => ({ id, label, percent, due });
const owner = { id: "u-owner", role: "owner" as const, email: "owner@x.sa", name: "o" };
const production = { id: "u-prod", role: "production" as const, email: "prod@x.sa", name: "p" };
const client = { id: "u-a", role: "client" as const, email: "a@x.sa", name: "a" };
const other = { id: "u-b", role: "client" as const, email: "b@x.sa", name: "b" };

test("presets all total 100%; a quote becomes deposit + balance", () => {
  for (const p of SCHEDULE_PRESETS) assert.equal(percentTotal(presetRows(p.id)), 100, p.id);
  assert.equal(new Set(presetRows("50-30-20").map((r) => r.id)).size, 3);
  const s = scheduleFromQuote(11500, 3450);
  assert.deepEqual(s.map((r) => r.percent), [30, 70]);
  assert.equal(scheduleFromQuote(1000, 1000).length, 1, "full deposit = single payment");
  assert.equal(percentTotal(scheduleFromQuote(1000, 0)), 100, "no deposit falls back to 50/50");
  assert.deepEqual(scheduleFromQuote(0, 0), []);
});

test("installment amounts: the last one takes the rounding remainder so the total is exact", () => {
  const s = [row("a", 33.33), row("b", 33.33), row("c", 33.34)];
  const parts = installmentAmounts(1000.01, s);
  assert.deepEqual(parts, [333.3, 333.3, 333.41]);
  assert.equal(Math.round(parts.reduce((n, x) => n + x, 0) * 100) / 100, 1000.01);
  assert.deepEqual(installmentAmounts(11500, [row("a", 50), row("b", 30), row("c", 20)]), [5750, 3450, 2300]);
  assert.deepEqual(installmentAmounts(100, []), []);
});

test("VAT is carved out of the inclusive amount", () => {
  assert.deepEqual(vatSplit(11500, 15), { net: 10000, vat: 1500 });
  assert.deepEqual(vatSplit(100, 0), { net: 100, vat: 0 });
  const v = vatSplit(333.33, 15);
  assert.equal(Math.round((v.net + v.vat) * 100) / 100, 333.33);
});

test("schedule validation: labels, 0<percent≤100, unique ids, and 100% with a positive value to send", () => {
  assert.equal(financeProblem(0, 15, []), null, "a contract may carry no schedule");
  assert.equal(financeProblem(1000, 15, [row("a", 60), row("b", 30)]), null, "drafts may be incomplete");
  assert.equal(financeProblem(1000, 15, [row("a", 60), row("b", 30)], true), "contract_schedule");
  assert.equal(financeProblem(0, 15, [row("a", 100)], true), "contract_total");
  assert.equal(financeProblem(1000, 15, [row("a", 100)], true), null);
  assert.equal(financeProblem(1000, 15, [row("a", 0), row("b", 100)]), "contract_schedule");
  assert.equal(financeProblem(1000, 15, [row("a", 50, " "), row("b", 50)]), "contract_schedule");
  assert.equal(financeProblem(1000, 15, [row("a", 50), row("a", 50)]), "contract_schedule");
  assert.equal(financeProblem(-1, 15, []), "contract_total");
  assert.equal(financeProblem(1000, 150, []), "contract_total");
  assert.equal(financeProblem(1000, 15, Array.from({ length: 13 }, (_, i) => row(`r${i}`, 1))), "contract_schedule");
});

test("contract money: paid, remaining, next due and settled", () => {
  const c = { id: "c1", total: 11500, vatRate: 15, schedule: [row("a", 50), row("b", 30), row("c", 20)] };
  const pay = (installmentId, amount) => ({ id: installmentId, contractId: "c1", installmentId, amount });
  let m = contractMoney(c, []);
  assert.equal(m.paid, 0); assert.equal(m.remaining, 11500); assert.equal(m.next.inst.id, "a"); assert.equal(m.settled, false); assert.equal(m.vat, 1500);
  m = contractMoney(c, [pay("a", 5750), { ...pay("x", 999), contractId: "other" }]);
  assert.equal(m.paid, 5750); assert.equal(m.remaining, 5750); assert.equal(m.next.inst.id, "b");
  m = contractMoney(c, [pay("a", 5750), pay("b", 3450), pay("c", 2300)]);
  assert.ok(m.settled); assert.equal(m.next, null); assert.equal(m.remaining, 0);
  assert.ok(payable("signed") && payable("client_signed") && !payable("sent") && !payable("draft"));
});

test("ZATCA phase-1 QR: five TLV fields, UTF-8 Arabic seller, base64", () => {
  const b64 = zatcaTlv({ seller: "مصنع العطور", vatNumber: "310122393500003", timestamp: "2026-11-14T09:30:00Z", total: 5750, vat: 750 });
  assert.match(b64, /^[A-Za-z0-9+/]+=*$/);
  assert.deepEqual(parseZatcaTlv(b64), ["مصنع العطور", "310122393500003", "2026-11-14T09:30:00Z", "5750.00", "750.00"]);
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  assert.equal(bytes[0], 1); assert.equal(bytes[1], new TextEncoder().encode("مصنع العطور").length, "length counts bytes, not characters");
  assert.equal(zatcaTimestamp("2026-11-14T09:30:00.123Z"), "2026-11-14T09:30:00Z");
  assert.equal(invoiceNo(7, new Date("2026-03-01")), "INV-2026-00007");
});

const blank = { title: "مشروع", track: "A", contactId: null, designerId: null, ownerId: null, stage: "brief", status: "active", dueDate: null } as const;
const draft = (projectId, over = {}) => ({ projectId, quoteId: null, title: "عقد تصنيع", company: { name: "المصنع", idLabel: "سجل تجاري", idNumber: "1010", address: "الرياض", representative: "" }, client: { name: "العميل", idLabel: "سجل", idNumber: "2020", address: "جدة", representative: "العميل" }, sections: [{ title: "الموضوع", body: "تصنيع" }], specs: [], total: 11500, vatRate: 15, schedule: [row("a", 50, "دفعة مقدمة", "عند التوقيع"), row("b", 30, "بدء الإنتاج"), row("c", 20, "الدفعة النهائية")], file: null, fileName: null, ...over });

test("a schedule that isn't 100% saves as a draft but cannot be sent; value and schedule are fingerprinted", async () => {
  const p = await projectsRepo.createProject({ ...blank, clientEmail: "a@x.sa" }, owner);
  const bad = await projectsRepo.saveContract(draft(p.id, { schedule: [row("a", 50), row("b", 30)] }), null, owner);
  await assert.rejects(projectsRepo.sendContract(bad.id, owner), /contract_schedule/);
  const zero = await projectsRepo.saveContract(draft(p.id, { total: 0 }), null, owner);
  await assert.rejects(projectsRepo.sendContract(zero.id, owner), /contract_total/);
  const c1 = await projectsRepo.saveContract(draft(p.id), null, owner);
  const c2 = await projectsRepo.saveContract(draft(p.id, { total: 12000 }), null, owner);
  await projectsRepo.sendContract(c1.id, owner);
  await projectsRepo.sendContract(c2.id, owner);
  const d = await projectsRepo.load(owner);
  const h1 = d.contracts.find((x) => x.id === c1.id).contentHash;
  const h2 = d.contracts.find((x) => x.id === c2.id).contentHash;
  assert.match(h1, /^[0-9a-f]{64}$/); assert.notEqual(h1.slice(0, 8), "", "hash set");
  assert.ok(h1 && h2 && h1 !== h2 || d.contracts.find((x) => x.id === c1.id).ref !== d.contracts.find((x) => x.id === c2.id).ref);
});

test("an uploaded contract file can replace the clauses; an empty contract still cannot be sent", async () => {
  const p = await projectsRepo.createProject({ ...blank, clientEmail: "a@x.sa" }, owner);
  const empty = await projectsRepo.saveContract(draft(p.id, { sections: [], total: 0, schedule: [] }), null, owner);
  await assert.rejects(projectsRepo.sendContract(empty.id, owner), /contract_empty/);
  const file = await projectsRepo.saveContract(draft(p.id, { sections: [], file: "idb:file-1.pdf", fileName: "عقد.pdf" }), null, owner);
  await projectsRepo.sendContract(file.id, owner);
  const got = (await projectsRepo.load(client)).contracts.find((x) => x.id === file.id);
  assert.equal(got.status, "sent"); assert.equal(got.fileName, "عقد.pdf");
});

test("recording payments: only after signing, once per installment, sequential invoices, client sees own only", async () => {
  const p = await projectsRepo.createProject({ ...blank, clientEmail: "a@x.sa" }, owner);
  const c = await projectsRepo.saveContract(draft(p.id), null, owner);
  const pay = (inst, actor = owner) => projectsRepo.recordContractPayment(c.id, inst, { method: "bank", ref: "TRX-1", paidAt: "2026-11-10", note: "" }, actor);
  await assert.rejects(pay("a"), /contract_not_signed/);
  await projectsRepo.sendContract(c.id, owner);
  await assert.rejects(pay("a"), /contract_not_signed/, "sent but unsigned");
  const hash = (await projectsRepo.load(client)).contracts.find((x) => x.id === c.id).contentHash;
  await projectsRepo.signContract(c.id, "client", "idb:sig", "العميل", hash, client);
  await assert.rejects(pay("a", production), "production cannot record payments");
  await assert.rejects(pay("a", client), "the client cannot record a payment");
  await assert.rejects(pay("zz"), /installment_not_found/);
  await assert.rejects(projectsRepo.recordContractPayment(c.id, "a", { method: "crypto", ref: "", paidAt: "", note: "" }, owner), /bad_method/);
  const p1 = await pay("a");
  assert.equal(p1.amount, 5750); assert.equal(p1.netAmount, 5000); assert.equal(p1.vatAmount, 750); assert.equal(p1.label, "دفعة مقدمة");
  assert.match(p1.invoiceNo, /^INV-\d{4}-\d{5}$/); assert.equal(p1.buyer.name, "العميل"); assert.equal(p1.seller.name, "المصنع");
  await assert.rejects(pay("a"), /installment_paid/);
  const p2 = await pay("b");
  assert.equal(Number(p2.invoiceNo.slice(-5)), Number(p1.invoiceNo.slice(-5)) + 1, "sequential numbering");
  const mine = await projectsRepo.load(client);
  assert.equal(mine.contractPayments.filter((x) => x.contractId === c.id).length, 2);
  assert.ok(mine.comments.some((x) => x.body.includes(p1.invoiceNo)), "the client is told in the project notes");
  assert.equal((await projectsRepo.load(other)).contractPayments.length, 0);
  assert.equal((await projectsRepo.load(production)).contractPayments.length, 0, "no payments.view, no invoices");
  const m = contractMoney(mine.contracts.find((x) => x.id === c.id), mine.contractPayments);
  assert.equal(m.paid, 9200); assert.equal(m.remaining, 2300); assert.equal(m.next.inst.id, "c");

  // الفاتورة النهائية تخصم ما سُدِّد سابقاً
  const contract = mine.contracts.find((x) => x.id === c.id);
  const inv2 = taxInvoice(mine.contractPayments.find((x) => x.id === p2.id), contract, mine.contractPayments);
  assert.equal(inv2.kind, "tax"); assert.equal(inv2.paidBefore, 5750); assert.equal(inv2.remainingAfter, 2300); assert.equal(inv2.number, p2.invoiceNo);
  const inv1 = taxInvoice(mine.contractPayments.find((x) => x.id === p1.id), contract, mine.contractPayments);
  assert.equal(inv1.paidBefore, 0); assert.equal(inv1.remainingAfter, 5750);
  const due = proformaInvoice(contract, "c", mine.contractPayments, { billing: { legalName: "شركة المصنع", vatNumber: "310122393500003", cr: "1010", bankName: "الراجحي", iban: "SA0380000000608010167519" } });
  assert.equal(due.kind, "proforma"); assert.equal(due.amount, 2300); assert.equal(due.paidBefore, 9200); assert.equal(due.remainingAfter, 0);
  assert.equal(due.number, `${contract.ref}-3`); assert.equal(due.bank.iban, "SA0380000000608010167519"); assert.equal(due.seller.name, "شركة المصنع");
  assert.equal(proformaInvoice(contract, "nope", [], { billing: { legalName: "", vatNumber: "", cr: "", bankName: "", iban: "" } }), null);
});

test("notes carry up to six attachments; a files-only note gets a default body", async () => {
  const p = await projectsRepo.createProject({ ...blank, clientEmail: "a@x.sa" }, owner);
  const f = (i) => ({ path: `idb:file-${i}.pdf`, name: `ملف ${i}.pdf`, type: "application/pdf", size: 1200 });
  await projectsRepo.comment(p.id, null, "", client, [f(1), f(2)]);
  await projectsRepo.comment(p.id, null, "مع صورة", owner, [{ path: "idb:img.webp", name: "صورة.webp", type: "image/webp", size: 900 }]);
  const notes = (await projectsRepo.load(owner)).comments.filter((x) => x.projectId === p.id);
  assert.equal(notes[0].body, "مرفقات"); assert.equal(notes[0].files.length, 2); assert.equal(notes[0].fromClient, true);
  assert.equal(notes[1].files[0].type, "image/webp");
  await assert.rejects(projectsRepo.comment(p.id, null, "x", client, Array.from({ length: 7 }, (_, i) => f(i))), /too_many_files/);
  await assert.rejects(projectsRepo.comment(p.id, null, "x", client, [{ path: "", name: "a", type: "", size: 0 }]), /bad_file/);
  await assert.rejects(projectsRepo.comment(p.id, null, "  ", client), /comment/, "an empty note with no files is refused");
});
