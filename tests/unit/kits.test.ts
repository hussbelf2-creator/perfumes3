// @ts-nocheck — اختبار سلوك
import { test } from "node:test";
import assert from "node:assert/strict";
import { CARRIERS, KIT_FLOW, KIT_STATUSES, kitProgress, nextStatuses, statusAt, trackingUrlFor } from "@/kits/types";
import { applyPatch, eventBody, followUpTask, orderFromLead, checkPatch } from "@/kits/repo";

const lead = (over = {}) => ({ id: "L1", contactId: "C1", createdAt: "2026-11-01T08:00:00.000Z", payload: { firstName: "نورة", lastName: "العميل", email: "Client@X.sa", phone: "0551234567", country: "sa", city: "Riyadh", address: "حي النرجس", order_ref: "kit-7f3k9q", directions: "عودي · زهري", ...over } });

test("every status has a label, hint and icon; the client flow is the four forward steps", async () => {
  const { KIT_STATUS_LABELS, KIT_STATUS_HINTS, KIT_STATUS_ICONS } = await import("@/kits/types");
  for (const s of KIT_STATUSES) {
    assert.ok(KIT_STATUS_LABELS[s].ar && KIT_STATUS_LABELS[s].en && KIT_STATUS_HINTS[s].ar && KIT_STATUS_ICONS[s].startsWith("ri-"), s);
  }
  assert.deepEqual([...KIT_FLOW], ["new", "preparing", "shipped", "delivered"]);
});

test("tracking url: explicit https wins, else carrier template with the encoded number, else empty", () => {
  assert.equal(trackingUrlFor("SMSA", "290123456789"), "https://www.smsaexpress.com/trackingdetails?tracknumbers=290123456789");
  assert.equal(trackingUrlFor("Aramex", " 4487 1234 "), "https://www.aramex.com/track/results?ShipmentNumber=4487%201234");
  assert.equal(trackingUrlFor("SMSA", "1", "https://x.example/t/1"), "https://x.example/t/1");
  assert.equal(trackingUrlFor("SMSA", "1", "http://insecure.example"), trackingUrlFor("SMSA", "1"), "non-https explicit link ignored");
  assert.equal(trackingUrlFor("Hand", "1"), "", "hand delivery has no tracking site");
  assert.equal(trackingUrlFor("SMSA", ""), "", "no number, no link");
  assert.equal(trackingUrlFor("Unknown Co", "1"), "");
  for (const c of CARRIERS) if (c.track) assert.ok(c.track.startsWith("https://") && c.track.includes("{no}"), c.id);
});

test("progress and allowed transitions", () => {
  assert.deepEqual(kitProgress("new"), { step: 0, total: 4, pct: 25 });
  assert.deepEqual(kitProgress("delivered"), { step: 3, total: 4, pct: 100 });
  assert.equal(kitProgress("returned").step, 2, "returned sits on the shipped step");
  assert.deepEqual(nextStatuses("new"), ["preparing", "shipped"]);
  assert.deepEqual(nextStatuses("shipped"), ["delivered", "returned"]);
  assert.deepEqual(nextStatuses("returned"), ["preparing", "shipped"]);
});

test("a kit lead becomes an order with normalised ref/email/country; bad refs make none", () => {
  const o = orderFromLead(lead());
  assert.equal(o.ref, "KIT-7F3K9Q");
  assert.equal(o.email, "client@x.sa");
  assert.equal(o.country, "SA");
  assert.equal(o.name, "نورة العميل");
  assert.equal(o.status, "new");
  assert.deepEqual(o.history, [{ status: "new", at: "2026-11-01T08:00:00.000Z", by: null }]);
  assert.equal(o.createdAt, "2026-11-01T08:00:00.000Z");
  assert.equal(orderFromLead(lead({ order_ref: "KIT-12" })), null, "short ref");
  assert.equal(orderFromLead(lead({ order_ref: undefined })), null, "no ref");
  assert.equal(orderFromLead(lead({ email: "nope" })), null, "bad email");
  assert.equal(orderFromLead(lead({ country: "Saudi" })).country, "", "non-ISO country dropped");
});

test("applyPatch mirrors the SQL guard: history, timestamps, carrier required to ship, immutable fields", () => {
  const o = orderFromLead(lead());
  const t1 = "2026-11-01T14:00:00.000Z";
  const prep = applyPatch(o, { status: "preparing" }, "U1", t1);
  assert.equal(prep.status, "preparing");
  assert.equal(prep.history.length, 2);
  assert.deepEqual(prep.history[1], { status: "preparing", at: t1, by: "U1" });
  assert.equal(prep.shippedAt, null);
  assert.equal(prep.ref, "KIT-7F3K9Q");
  assert.throws(() => applyPatch(prep, { status: "shipped" }, "U1"), /kit_order_carrier_required/);
  const t2 = "2026-11-02T10:00:00.000Z";
  const shipped = applyPatch(prep, { status: "shipped", carrier: " SMSA ", trackingNo: " 2901 " }, "U2", t2);
  assert.equal(shipped.carrier, "SMSA");
  assert.equal(shipped.trackingNo, "2901");
  assert.equal(shipped.shippedAt, t2);
  assert.equal(statusAt(shipped, "shipped"), t2);
  assert.equal(eventBody(shipped), "شُحنت عينة KIT-7F3K9Q عبر SMSA · 2901");
  const same = applyPatch(shipped, { note: "ملاحظة" }, "U2", "2026-11-02T11:00:00.000Z");
  assert.equal(same.history.length, 3, "no status change → no history entry");
  assert.equal(same.note, "ملاحظة");
  const t3 = "2026-11-04T09:00:00.000Z";
  const delivered = applyPatch(same, { status: "delivered" }, "U2", t3);
  assert.equal(delivered.deliveredAt, t3);
  assert.equal(delivered.shippedAt, t2, "shipped date kept");
  assert.equal(eventBody(delivered), "سُلِّمت عينة KIT-7F3K9Q");
  const task = followUpTask(delivered, new Date(t3));
  assert.match(task.title, /ادعُ العميل لحجز مكالمة.*KIT-7F3K9Q/);
  assert.equal(task.dueAt, "2026-11-07T09:00:00.000Z");
  // التسليم مباشرة من «جديد» يضبط تاريخ الشحن أيضاً
  const direct = applyPatch(o, { status: "delivered" }, null, t3);
  assert.equal(direct.shippedAt, t3);
  assert.throws(() => checkPatch({ trackingUrl: "http://x" }), /tracking_url/);
  assert.throws(() => checkPatch({ status: "lost" }), /status/);
  assert.throws(() => checkPatch({ note: "x".repeat(501) }), /note/);
});
