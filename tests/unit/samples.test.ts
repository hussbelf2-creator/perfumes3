// @ts-nocheck — اختبار سلوك: العينات المسمّاة، عنوان الشحن، قرارات العميل، ورمز QR
import { test } from "node:test";
import assert from "node:assert/strict";
import { KIT_REF_RE, amountDigits, addressLine, addressOpen, applyDecisions, canDecide, cleanAddress, hasGeo, mapsLink, mergeTeamSamples, newSample, parseLatLng, percentSum, sampleCode, sampleTotals, sanitizeSamples, sheetPath } from "@/kits/types";
import { applyAddress, applyDecide, applyPatch, checkDraft, decisionTask, newRoundRef, orderFromLead } from "@/kits/repo";
import { qrMatrix, qrPath } from "@/lib/qr";

const lead = (over = {}) => ({ id: "L1", contactId: "C1", createdAt: "2026-11-01T08:00:00.000Z", payload: { firstName: "نورة", lastName: "العميل", email: "client@x.sa", phone: "0551234567", country: "sa", city: "Riyadh", address: "حي النرجس", order_ref: "kit-7f3k9q", ...over } });
const S = (over = {}) => ({ id: "s1", code: "A", name: "مسك الليل", concentration: "EDP 18%", notes: "", ingredients: [{ name: "مسك", amount: 12, unit: "%" }, { name: "عود", amount: 3.5, unit: "%" }], ...over });

test("sample letters run A…Z then A2; refs accept kits and rounds only", () => {
  assert.equal(sampleCode(0), "A"); assert.equal(sampleCode(25), "Z"); assert.equal(sampleCode(26), "A2");
  assert.equal(newSample(2).code, "C");
  assert.ok(KIT_REF_RE.test("KIT-7F3K9Q") && KIT_REF_RE.test("SMP-ABC234"));
  assert.ok(!KIT_REF_RE.test("XYZ-123456") && !KIT_REF_RE.test("SMP-abc234"));
  for (let i = 0; i < 20; i++) assert.match(newRoundRef(), /^SMP-[A-HJ-NP-Z2-9]{6}$/);
});

test("sanitizeSamples: drops unnamed, caps lengths and counts, de-duplicates ids, keeps valid units", () => {
  const out = sanitizeSamples([S(), S({ name: "  " }), S({ id: "s1", name: "ثانية", ingredients: [{ name: "x", amount: -5, unit: "kg" }, { name: "", amount: 1, unit: "g" }, null] }), "junk", null]);
  assert.equal(out.length, 2);
  assert.notEqual(out[0].id, out[1].id, "duplicate id replaced");
  assert.deepEqual(out[1].ingredients, [{ name: "x", amount: 0, unit: "%" }]);
  assert.equal(sanitizeSamples(Array.from({ length: 40 }, (_, i) => S({ id: `i${i}` }))).length, 24);
  assert.equal(sanitizeSamples([S({ name: "ن".repeat(200) })])[0].name.length, 80);
  assert.deepEqual(sanitizeSamples("x"), []);
  assert.equal(sanitizeSamples([S({ decision: "maybe" })])[0].decision, undefined);
  assert.equal(sanitizeSamples([S({ decision: "accepted", comment: "جميلة", decided_at: "2026-11-02T00:00:00Z" })])[0].decidedAt, "2026-11-02T00:00:00Z");
});

test("percent total flags an over-100 formula; other units are ignored", () => {
  assert.deepEqual([4.5, 12, 0.125, 3.14159, 80].map(amountDigits), [1, 0, 3, 3, 0], "amounts print as written, up to three decimals");
  assert.equal(percentSum(S()), 15.5);
  assert.equal(percentSum(S({ ingredients: [{ name: "a", amount: 80, unit: "%" }, { name: "b", amount: 30, unit: "%" }, { name: "c", amount: 5, unit: "ml" }] })), 110);
});

test("client decisions land by id; unknown ids and odd values are ignored", () => {
  const out = applyDecisions([S(), S({ id: "s2", name: "ثانية" })], [{ id: "s1", decision: "accepted", comment: "  هذه  " }, { id: "zz", decision: "rejected" }, { id: "s2", decision: "maybe" }], "2026-11-05T10:00:00Z");
  assert.equal(out[0].decision, "accepted"); assert.equal(out[0].comment, "هذه"); assert.equal(out[0].decidedAt, "2026-11-05T10:00:00Z");
  assert.equal(out[1].decision, undefined);
  assert.deepEqual(sampleTotals(out), { total: 2, accepted: 1, rejected: 0, pending: 1 });
});

test("the team edits names and ingredients but can never forge or erase a client decision", () => {
  const prev = [S({ decision: "accepted", comment: "هذه هي", decidedAt: "t" }), S({ id: "s2", name: "ثانية" })];
  const next = mergeTeamSamples(prev, [S({ name: "مسك الليل — المعتمدة", decision: "rejected", comment: "زُوّر" }), S({ id: "s3", name: "جديدة", decision: "accepted" })]);
  assert.equal(next[0].name, "مسك الليل — المعتمدة");
  assert.equal(next[0].decision, "accepted"); assert.equal(next[0].comment, "هذه هي");
  assert.equal(next[1].decision, undefined, "a new sample starts unrated whatever was sent");
  assert.equal(next.length, 2, "removed samples go");
});

test("address: cleaned like the server, short national address validated, coordinates bounded", () => {
  const a = cleanAddress({ country: "sa", city: "  Jeddah ", district: "الروضة", street: "صاري", building: "12", postal: "23435<script>", shortAddress: "jdra 2929", lat: 21.5433123, lng: 39.1728 });
  assert.equal(a.country, "SA"); assert.equal(a.city, "Jeddah"); assert.equal(a.postal, "23435script"); assert.equal(a.shortAddress, "JDRA2929"); assert.equal(a.lat, 21.543312);
  assert.equal(cleanAddress({ city: "x", shortAddress: "12AB" }).shortAddress, "");
  assert.equal(cleanAddress({ city: "x", lat: 95, lng: 10 }).lat, null);
  assert.equal(cleanAddress({ city: "x", lat: 0, lng: 0 }).lat, null, "null island is not a location");
  assert.equal(cleanAddress({ city: "x", lat: 24.7 }).lat, null, "a pin needs both coordinates");
  assert.equal(addressLine({ building: "12", street: "صاري", district: "الروضة", city: "Jeddah", postal: "23435", address: "" }, "السعودية"), "12 صاري، الروضة، Jeddah، 23435، السعودية");
  assert.ok(hasGeo(a)); assert.equal(mapsLink(a), "https://www.google.com/maps?q=21.543312,39.1728"); assert.equal(mapsLink({ city: "x" }), "");
});

test("a pasted Maps link or plain coordinates become a pin", () => {
  assert.deepEqual(parseLatLng("https://www.google.com/maps/place/X/@24.7136,46.6753,17z"), { lat: 24.7136, lng: 46.6753 });
  assert.deepEqual(parseLatLng("https://maps.google.com/?q=21.5433,39.1728"), { lat: 21.5433, lng: 39.1728 });
  assert.deepEqual(parseLatLng("https://www.google.com/maps/place/x/data=!3d24.774265!4d46.738586"), { lat: 24.774265, lng: 46.738586 });
  assert.deepEqual(parseLatLng("24.7136, 46.6753"), { lat: 24.7136, lng: 46.6753 });
  assert.equal(parseLatLng("https://maps.app.goo.gl/abc123"), null, "short links carry no coordinates");
  assert.equal(parseLatLng("95.0, 200.0"), null);
});

test("a kit order from the form keeps the detailed address and the map pin", () => {
  const o = orderFromLead(lead({ district: "النرجس", short_address: "rrrd2929", lat: "24.8301", lng: "46.6601" }));
  assert.equal(o.kind, "kit"); assert.equal(o.district, "النرجس"); assert.equal(o.shortAddress, "RRRD2929"); assert.equal(o.lat, 24.8301);
  assert.match(o.token, /^[0-9a-f]{32}$/); assert.deepEqual(o.samples, []); assert.equal(o.addressConfirmedAt, null);
  assert.equal(orderFromLead(lead({ lat: "abc", lng: "46" })).lat, null);
});

test("the client confirms the address before shipping only; the city is required", () => {
  const o = orderFromLead(lead());
  const next = applyAddress(o, { country: "SA", city: "Jeddah", district: "الروضة", street: "", building: "", postal: "", shortAddress: "", address: "", lat: 21.5, lng: 39.1, name: "خالد" }, "2026-11-02T09:00:00Z");
  assert.equal(next.city, "Jeddah"); assert.equal(next.name, "خالد"); assert.equal(next.addressConfirmedAt, "2026-11-02T09:00:00Z"); assert.equal(next.email, o.email);
  assert.throws(() => applyAddress(o, { country: "SA", city: " ", district: "", street: "", building: "", postal: "", shortAddress: "", address: "" }), /kit_city_required/);
  const shipped = applyPatch(next, { status: "shipped", carrier: "SMSA" }, "u1");
  assert.throws(() => applyAddress(shipped, { ...next, city: "Makkah" }), /kit_address_locked/);
  assert.ok(addressOpen("new") && addressOpen("preparing") && !addressOpen("shipped"));
});

test("rating opens after shipping, marks the round delivered and creates a review task", () => {
  let o = { ...orderFromLead(lead()), samples: [S(), S({ id: "s2", name: "ثانية" })] };
  assert.throws(() => applyDecide(o, [{ id: "s1", decision: "accepted" }]), /kit_not_shipped/);
  o = applyPatch(o, { status: "shipped", carrier: "SMSA" }, "u1", "2026-11-03T00:00:00Z");
  assert.throws(() => applyDecide(o, []), /kit_decisions_required/);
  assert.throws(() => applyDecide({ ...o, samples: [] }, [{ id: "s1", decision: "accepted" }]), /kit_no_samples/);
  const done = applyDecide(o, [{ id: "s1", decision: "accepted" }, { id: "s2", decision: "rejected", comment: "حادة" }], "2026-11-06T00:00:00Z");
  assert.equal(done.status, "delivered"); assert.equal(done.deliveredAt, "2026-11-06T00:00:00Z"); assert.equal(done.decidedAt, "2026-11-06T00:00:00Z");
  assert.equal(done.history.at(-1).status, "delivered");
  assert.match(decisionTask(done).title, /مقبول 1، مرفوض 1/);
  assert.ok(canDecide("shipped") && canDecide("delivered") && !canDecide("preparing"));
  const again = applyDecide(done, [{ id: "s2", decision: "accepted" }], "2026-11-07T00:00:00Z");
  assert.equal(again.samples[1].decision, "accepted", "the client can revise the rating"); assert.equal(again.history.length, done.history.length);
});

test("a team patch edits samples and address without touching decisions or the token", () => {
  let o = { ...orderFromLead(lead()), samples: [S({ decision: "accepted", comment: "نعم" })] };
  const token = o.token;
  o = applyPatch(o, { samples: [S({ name: "جديد", decision: "rejected" })], city: "Dammam", lat: 26.4, lng: 50.1, name: "سارة" }, "u1");
  assert.equal(o.samples[0].name, "جديد"); assert.equal(o.samples[0].decision, "accepted"); assert.equal(o.city, "Dammam"); assert.equal(o.lat, 26.4); assert.equal(o.name, "سارة"); assert.equal(o.token, token);
  assert.throws(() => applyPatch(o, { samples: [S({ name: " " })] }, "u1"), /sample_name/);
});

test("a new round needs a client email and at least one named sample", () => {
  const base = { email: "c@x.sa", phone: "", name: "", country: "SA", city: "", district: "", street: "", building: "", postal: "", shortAddress: "", address: "", samples: [S()] };
  assert.doesNotThrow(() => checkDraft(base));
  assert.throws(() => checkDraft({ ...base, email: "nope" }), /client_email/);
  assert.throws(() => checkDraft({ ...base, samples: [] }), /kit_no_samples/);
  assert.throws(() => checkDraft({ ...base, samples: [S({ name: "" })] }), /sample_name/);
});

test("the QR on the sheet encodes the tokenised client link", () => {
  assert.equal(sheetPath("SMP-ABC234", "t".repeat(32)), `/kit/SMP-ABC234?k=${"t".repeat(32)}`);
  assert.equal(sheetPath("SMP-ABC234", "tok", true), "/kit/SMP-ABC234/sheet?k=tok");
  const m = qrMatrix("https://example.sa/kit/SMP-ABC234?k=0123456789abcdef0123456789abcdef");
  assert.ok(m.length >= 21 && m.every((r) => r.length === m.length), "square matrix");
  // أنماط التحديد الثلاثة في الزوايا: 7×7 بإطار داكن
  for (const [r, c] of [[0, 0], [0, m.length - 7], [m.length - 7, 0]]) for (let i = 0; i < 7; i++) assert.ok(m[r][c + i] && m[r + 6][c + i] && m[r + i][c] && m[r + i][c + 6]);
  assert.notDeepEqual(m, qrMatrix("https://example.sa/kit/SMP-ABC234?k=ffffffffffffffffffffffffffffffff"));
  const d = qrPath(m, 4);
  assert.match(d, /^M4 4h7v1h-7z/);
  const dark = m.flat().filter(Boolean).length;
  const drawn = [...d.matchAll(/h(\d+)v1/g)].reduce((n, x) => n + Number(x[1]), 0);
  assert.equal(drawn, dark, "every dark module is drawn exactly once");
});
