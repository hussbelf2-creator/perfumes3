// ما تعرضه الفاتورة: فاتورة ضريبية لدفعة مسددة، أو مطالبة (فاتورة مبدئية) بدفعة مستحقة.
// الفاتورة النهائية تخصم ما سُدِّد سابقاً من قيمة العقد، فيرى العميل المتبقي بعد كل دفعة.
import type { SiteDoc } from "@/cms/schema";
import type { Contract } from "./types";
import { installmentAmounts, round2, vatSplit, type ContractPayment, type PayMethod } from "./finance";

export interface InvoiceView {
  kind: "tax" | "proforma";
  number: string;
  issuedAt: string;
  label: string;
  percent: number;
  amount: number;
  net: number;
  vat: number;
  vatRate: number;
  seller: { name: string; vatNumber?: string; cr?: string; address?: string };
  buyer: { name: string; idLabel?: string; idNumber?: string; address?: string };
  contractRef: string;
  contractTitle: string;
  contractTotal: number;
  /** المسدَّد قبل هذه الفاتورة، والمتبقي بعدها */
  paidBefore: number;
  remainingAfter: number;
  method?: PayMethod;
  payRef?: string;
  paidAt?: string;
  bank?: { bankName: string; iban: string };
}

type C = Pick<Contract, "id" | "ref" | "title" | "total" | "vatRate" | "schedule" | "company" | "client">;

/** فاتورة ضريبية من سداد مسجَّل (البائع والمشتري من لقطة ساعة الإصدار) */
export function taxInvoice(p: ContractPayment, c: C, payments: ContractPayment[]): InvoiceView {
  const before = round2(payments.filter((x) => x.contractId === p.contractId && x.id !== p.id && (x.issuedAt < p.issuedAt || (x.issuedAt === p.issuedAt && x.invoiceNo < p.invoiceNo))).reduce((n, x) => n + x.amount, 0));
  return {
    kind: "tax", number: p.invoiceNo, issuedAt: p.issuedAt, label: p.label, percent: p.percent, amount: p.amount, net: p.netAmount, vat: p.vatAmount, vatRate: p.vatRate,
    seller: p.seller, buyer: p.buyer, contractRef: c.ref, contractTitle: c.title, contractTotal: c.total, paidBefore: before, remainingAfter: round2(Math.max(0, c.total - before - p.amount)),
    method: p.method, payRef: p.ref, paidAt: p.paidAt,
  };
}

/** مطالبة بدفعة لم تُسدَّد بعد، ببيانات التحويل البنكي */
export function proformaInvoice(c: C, installmentId: string, payments: ContractPayment[], site: Pick<SiteDoc, "billing">, at = new Date().toISOString()): InvoiceView | null {
  const index = c.schedule.findIndex((x) => x.id === installmentId);
  if (index < 0) return null;
  const inst = c.schedule[index];
  const amount = installmentAmounts(c.total, c.schedule)[index];
  const { net, vat } = vatSplit(amount, c.vatRate);
  const paid = round2(payments.filter((x) => x.contractId === c.id).reduce((n, x) => n + x.amount, 0));
  return {
    kind: "proforma", number: `${c.ref}-${index + 1}`, issuedAt: at, label: inst.label, percent: inst.percent, amount, net, vat, vatRate: c.vatRate,
    seller: { name: site.billing.legalName || c.company.name, vatNumber: site.billing.vatNumber, cr: site.billing.cr || c.company.idNumber, address: c.company.address },
    buyer: { name: c.client.name, idLabel: c.client.idLabel, idNumber: c.client.idNumber, address: c.client.address },
    contractRef: c.ref, contractTitle: c.title, contractTotal: c.total, paidBefore: paid, remainingAfter: round2(Math.max(0, c.total - paid - amount)),
    bank: { bankName: site.billing.bankName, iban: site.billing.iban },
  };
}
