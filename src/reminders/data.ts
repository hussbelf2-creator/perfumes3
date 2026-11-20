import type { ProjectsData } from "@/projects/repo";
import type { KitOrder } from "@/kits/types";
import type { RData } from "./logic";

/** يحوّل بيانات اللوحة (مشاريع، عروض، عقود، عينات) لشكل منطق التذكيرات، لمعاينة «المستحق الآن» */
export function toRData(d: ProjectsData, kits: KitOrder[], phones: Map<string, string> = new Map()): RData {
  return {
    projects: d.projects.map((p) => ({ id: p.id, title: p.title, email: p.clientEmail, phone: phones.get(p.contactId ?? "") ?? p.brief?.phone ?? "", status: p.status, ownerId: p.ownerId ?? null, contactId: p.contactId ?? null })),
    quotes: d.quotes.map((q) => ({ id: q.id, projectId: q.projectId, ref: q.ref, status: q.status, total: q.total, deposit: q.deposit, sentAt: q.sentAt ?? null, decidedAt: q.decidedAt ?? null })),
    contracts: d.contracts.map((c) => ({ id: c.id, projectId: c.projectId, ref: c.ref, status: c.status, sentAt: c.sentAt, clientSignedAt: c.clientSignedAt, total: c.total, quoteId: c.quoteId, schedule: c.schedule.map((x) => ({ id: x.id, label: x.label, percent: x.percent, dueDate: x.dueDate })) })),
    payments: d.contractPayments.map((x) => ({ contractId: x.contractId, installmentId: x.installmentId })),
    items: d.items.map((i) => ({ id: i.id, projectId: i.projectId, title: i.title, status: i.status, byClient: !!i.byClient, createdAt: i.createdAt })),
    kits: kits.map((k) => ({ id: k.id, ref: k.ref, token: k.token, email: k.email, phone: k.phone, kind: k.kind, status: k.status, projectId: k.projectId ?? null, samples: k.samples.length, accepted: k.samples.filter((s) => s.decision === "accepted").length, decidedAt: k.decidedAt ?? null, addressConfirmedAt: k.addressConfirmedAt ?? null, approvedSample: k.approvedSample ?? null, createdAt: k.createdAt, shippedAt: k.shippedAt ?? null, deliveredAt: k.deliveredAt ?? null })),
  };
}
