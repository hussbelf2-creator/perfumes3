// @ts-nocheck — اختبار سلوك
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, sanitize, CMS_KEYS, SITE_KEYS } from "@/cms/schema";
import { canEditKey } from "@/cms/repo";
import { buildPlan } from "@/production/plan";

test("the operations document is a CMS key, edited outside the site-content editor, by owner and admin only", () => {
  assert.ok(CMS_KEYS.includes("ops") && !SITE_KEYS.includes("ops"));
  assert.equal(canEditKey("owner", "ops"), true);
  assert.equal(canEditKey("admin", "ops"), true);
  assert.equal(canEditKey("editor", "ops"), false);
  assert.equal(canEditKey("editor", "hero"), true);
  assert.equal(canEditKey("production", "ops"), false);
});

test("defaults: nothing hidden, production settings match the plan defaults, eleven QC items", () => {
  const d = DEFAULTS.ops;
  assert.deepEqual(d.catalog, { hiddenKits: [], featuredKits: [], hiddenStyles: [], hiddenShapes: [], hiddenTemplates: [] });
  assert.equal(d.production.qc.length, 11);
  assert.equal(d.production.qc.filter((q) => q.cls === "critical").length, 3);
  assert.deepEqual(sanitize("ops", d), d);
  assert.deepEqual(sanitize("ops", null), d);
});

test("sanitizer: unknown styles dropped, lists deduped and capped, ranges ordered and bounded, QC cleaned", () => {
  const dirty = {
    catalog: { hiddenKits: ["start-30", "start-30", "<script>", 5], featuredKits: Array.from({ length: 40 }, (_, i) => `kit-${i}`), hiddenStyles: ["tuck", "nope", "magnetic"], hiddenTemplates: ["mono"] },
    production: {
      days: { qc: [9, 4], delivery: ["x", 2], hacked: [1, 1], approve: [0, 9999] },
      maceration: { edp: [60, 40], oil: [3, 7] },
      oudExtra: 999, fillPerDay: 1, packPerDay: "many",
      qc: [{ id: "a b", text: { ar: "بند", en: "Item" }, cls: "weird" }, { id: "a b", text: { ar: "", en: "empty" } }, { id: "a b", text: { ar: "ثانٍ", en: "" }, cls: "critical" }],
      wastagePct: 80, fillTolerancePct: 0,
    },
  };
  const c = sanitize("ops", dirty);
  assert.deepEqual(c.catalog.hiddenKits, ["start-30"]);
  assert.equal(c.catalog.featuredKits.length, 24);
  assert.deepEqual(c.catalog.hiddenStyles, ["tuck", "magnetic"]);
  assert.deepEqual(c.catalog.hiddenTemplates, ["mono"]);
  assert.deepEqual(c.production.days.qc, [4, 9]);
  assert.deepEqual(c.production.days.delivery, [2, 2], "a bad bound falls back per field");
  assert.equal(c.production.days.hacked, undefined);
  assert.deepEqual(c.production.days.approve, [0, 365]);
  assert.deepEqual(c.production.maceration.edp, [40, 60]);
  assert.deepEqual(c.production.maceration.oil, [3, 7]);
  assert.deepEqual(c.production.maceration.edt, DEFAULTS.ops.production.maceration.edt);
  assert.equal(c.production.oudExtra, 120);
  assert.equal(c.production.fillPerDay, 50);
  assert.equal(c.production.packPerDay, DEFAULTS.ops.production.packPerDay);
  assert.deepEqual(c.production.qc.map((q) => [q.id, q.cls]), [["ab", "major"], ["abx", "critical"]]);
  assert.equal(c.production.wastagePct, 30);
  assert.equal(c.production.fillTolerancePct, 0.1);
  // الإعدادات المعدّلة تغيّر الخطة فعلاً
  const base = buildPlan({ track: "E", qty: 1000, formula: "ready", packaging: "yes", start: new Date("2026-01-01") }, DEFAULTS.ops.production);
  const slow = buildPlan({ track: "E", qty: 1000, formula: "ready", packaging: "yes", start: new Date("2026-01-01") }, c.production);
  assert.ok(slow.total[1] > base.total[1]);
});
