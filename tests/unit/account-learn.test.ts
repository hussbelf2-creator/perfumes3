// @ts-nocheck — اختبار سلوك: عناوين العميل المحفوظة، قسم التعليم، وأنواع المرفقات
import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_ADDRESSES, cleanInput, sortAddresses, upsert } from "@/account/addresses";
import { LESSONS, lessonBySlug, lessonsFor, nextLesson } from "@/data/learn";
import { SERVICE_TRACKS } from "@/data/services";
import { ATTACHMENT_ACCEPT, ATTACHMENT_TYPES, attachmentIcon, extOf, fileSize, isImagePath } from "@/creatives/images";
import { acceptable } from "@/projects/pendingFiles";

const A = (over = {}) => ({ label: "المكتب", name: "خالد", phone: "0551234567", country: "SA", city: "Riyadh", district: "", street: "", building: "", postal: "", shortAddress: "", address: "", lat: null, lng: null, isDefault: false, ...over });

test("saved addresses: the first is the default, only one default, ten at most, city required", () => {
  let list = upsert([], A(), null, "2026-01-01T00:00:00Z", "a1");
  assert.equal(list[0].isDefault, true, "first address becomes the default");
  list = upsert(list, A({ label: "المستودع", city: "Jeddah" }), null, "2026-01-02T00:00:00Z", "a2");
  assert.deepEqual(list.map((x) => x.isDefault), [true, false]);
  list = upsert(list, A({ label: "المستودع", city: "Jeddah", isDefault: true }), "a2");
  assert.deepEqual(list.map((x) => [x.id, x.isDefault]), [["a1", false], ["a2", true]]);
  assert.equal(sortAddresses(list)[0].id, "a2", "default first");
  assert.throws(() => upsert(list, A({ city: " " }), null), /kit_city_required/);
  assert.throws(() => upsert(list, A(), "missing"), /not_found/);
  const full = Array.from({ length: MAX_ADDRESSES }, (_, i) => ({ ...A(), id: `x${i}`, createdAt: "t" }));
  assert.throws(() => upsert(full, A(), null), /too_many_addresses/);
  assert.equal(cleanInput(A({ shortAddress: "rrrd 2929", country: "xx1" })).shortAddress, "RRRD2929");
  assert.equal(cleanInput(A({ country: "" })).country, "SA");
});

test("every lesson is bilingual, has sections and a takeaway, and links to a real service and an internal page", () => {
  const ids = new Set(SERVICE_TRACKS.map((s) => s.id));
  assert.ok(LESSONS.length >= 12);
  assert.equal(new Set(LESSONS.map((l) => l.slug)).size, LESSONS.length, "unique slugs");
  for (const l of LESSONS) {
    assert.match(l.slug, /^[a-z][a-z-]+$/);
    assert.ok(l.title.ar && l.title.en && l.summary.ar && l.summary.en && l.takeaway.ar && l.takeaway.en, l.slug);
    assert.ok(l.icon.startsWith("ri-") && l.minutes >= 2 && l.minutes <= 8, l.slug);
    assert.ok(l.tracks.length > 0 && l.tracks.every((t) => ids.has(t)), l.slug);
    assert.ok(l.apply.to.startsWith("/") && l.apply.label.ar && l.apply.label.en, l.slug);
    assert.ok(l.sections.length >= 3, l.slug);
    for (const s of l.sections) {
      assert.ok(s.h.ar && s.h.en && (s.body || s.points?.length), l.slug);
      for (const p of s.points ?? []) assert.ok(p.ar && p.en, l.slug);
    }
  }
});

test("each service has lessons; the next lesson stays within the service and wraps around", () => {
  for (const s of SERVICE_TRACKS) assert.ok(lessonsFor(s.id).length >= 2, `track ${s.id}`);
  assert.equal(lessonsFor(null).length, LESSONS.length);
  assert.equal(lessonBySlug("nope"), undefined);
  const f = lessonsFor("F");
  assert.equal(nextLesson(f[0].slug, "F").slug, f[1].slug);
  assert.equal(nextLesson(f.at(-1).slug, "F").slug, f[0].slug, "wraps to the first lesson of the service");
  assert.ok(nextLesson(LESSONS[0].slug));
  assert.equal(nextLesson("nope"), null);
  // درس خارج الخدمة المطلوبة: نكمل من القائمة العامة
  const outside = LESSONS.find((l) => !l.tracks.includes("F"));
  assert.ok(nextLesson(outside.slug, "F"));
});

test("attachments: accepted document types, icons, sizes and the picker accept list", () => {
  assert.equal(extOf("عقد نهائي.PDF"), "pdf"); assert.equal(extOf("noext"), "");
  assert.ok(ATTACHMENT_TYPES.docx && ATTACHMENT_TYPES.xlsx && ATTACHMENT_TYPES.zip && !ATTACHMENT_TYPES.exe && !ATTACHMENT_TYPES.html && !ATTACHMENT_TYPES.svg);
  assert.ok(ATTACHMENT_ACCEPT.startsWith("image/*") && ATTACHMENT_ACCEPT.includes(".pdf") && ATTACHMENT_ACCEPT.includes(".docx"));
  assert.equal(attachmentIcon({ name: "a.webp", type: "image/webp" }), "ri-image-line");
  assert.equal(attachmentIcon({ name: "a.pdf", type: "application/pdf" }), "ri-file-pdf-2-line");
  assert.equal(attachmentIcon({ name: "a.xlsx", type: "" }), "ri-file-excel-line");
  assert.equal(fileSize(500), "1 KB"); assert.equal(fileSize(2_621_440), "2.5 MB");
  assert.ok(isImagePath("sb:projects/x/y.webp") && !isImagePath("sb:projects/x/y.pdf"));
  assert.ok(acceptable({ name: "logo.png", type: "image/png", size: 1000 }));
  assert.ok(acceptable({ name: "spec.docx", type: "", size: 1000 }));
  assert.ok(!acceptable({ name: "run.exe", type: "application/octet-stream", size: 1000 }));
  assert.ok(!acceptable({ name: "big.pdf", type: "application/pdf", size: 16 * 1024 * 1024 }));
});
