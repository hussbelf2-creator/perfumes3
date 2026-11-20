// @ts-nocheck — مكتبة هياكل التغليف (ECMA/FEFCO): كل نوع يولّد قالباً ثنائياً صالحاً وشجرة ألواح مجسّمة سليمة،
// والربط بتصميم العلبة (التلقائي، التنقية، الحقل المضغوط، ورقة المواصفات) يعمل في الاتجاهين.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Box3, Vector3 } from "three";
import { Dielines, Models3D, PRESETS, STRUCTURES, autoStructure, cleanStructure, defaultParams, defaultThickness, parseStructureField, resolveStructure, stockFor, structureField, structureLabel, structureModel, structureSvg, svgSheet } from "../../src/lib/packaging";
import { buildStructure, lookOf } from "../../src/studio/box/structure3d";
import { defaultBox } from "../../src/studio/box/types";
import { briefLines } from "../../src/start/briefs";
import { techPackGroups } from "../../src/studio/techpack";
import { DEFAULT_BOX_RATES } from "../../src/studio/box/pricing";

const pick = (b) => b.ar;
const t = (ar) => ar;
const num = (n, d = 0) => Number(n).toFixed(d);

test("the delivered library (12 dielines / 13 models) plus the project's nine extra structures, all described in STRUCTURES", () => {
  assert.equal(Object.keys(Dielines.TYPES).length, 21);
  assert.equal(Models3D.TYPES.length, 22);
  for (const k of Models3D.TYPES) assert.ok(STRUCTURES.some((s) => s.id === k), `no metadata for ${k}`);
  for (const k of Object.keys(Dielines.TYPES)) assert.ok(Models3D.TYPES.includes(k), `${k} has a dieline but no model`);
  assert.equal(STRUCTURES.length, 22);
  assert.ok(PRESETS.length >= 9 && PRESETS.every((p) => p.label.ar && p.label.en && Object.keys(p.types).length >= 1));
});

for (const k of Object.keys(Dielines.TYPES)) {
  test(`Dielines.generate(${k}) is a valid mm-sized SVG with named layers and metadata`, () => {
    const svg = Dielines.generate(k, {});
    assert.ok(svg.startsWith("<?xml"), "xml header");
    assert.ok(!svg.includes("NaN") && !svg.includes("undefined"), "no NaN/undefined");
    const { w, h } = svgSheet(svg);
    assert.ok(w > 20 && h > 20 && w < 2000 && h < 2000, `sheet ${w}x${h}`);
    for (const id of k === "drawer" ? ['id="cut"', 'id="fold"'] : ['id="cut"', 'id="fold"', 'id="glue"']) assert.ok(svg.includes(id), `${k} missing layer ${id}`);
    if (["sealEnd", "hangTab", "rsc", "hingedLid", "shoulder", "tube", "giftBag", "display"].includes(k)) assert.ok(svg.split('id="glue"')[1].split("</g>")[0].includes("<rect"), `${k} has a glue area`);
    const meta = svg.match(/data-dieline='([^']+)'/);
    assert.ok(meta, "data-dieline attribute");
    assert.ok(JSON.parse(meta[1]).type, "metadata has a type");
    assert.ok((svg.match(/<(path|line|circle|rect)\b/g) ?? []).length >= 6, "has geometry");
  });
}

const walk = (p, f) => {
  f(p);
  for (const c of p.children) walk(c.panel, f);
};

for (const k of Models3D.TYPES) {
  test(`Models3D.build(${k}) yields finite positive panels with valid hinges`, () => {
    const m = Models3D.build(k, {});
    assert.ok(m.parts.length >= 1);
    let n = 0;
    for (const part of m.parts) {
      assert.equal(part.position.length, 3);
      walk(part.root, (p) => {
        n++;
        assert.ok(Number.isFinite(p.w) && Number.isFinite(p.h) && p.w > 0 && p.h > 0, `${k}/${p.id}: ${p.w}x${p.h}`);
        assert.ok(typeof p.role === "string");
        for (const c of p.children) {
          assert.ok(["left", "right", "top", "bottom"].includes(c.edge));
          assert.ok(Number.isFinite(c.angle) && Math.abs(c.angle) <= 180);
        }
        for (const h of p.holes) assert.ok(h.type === "circle" ? h.d > 0 && h.d < Math.max(p.w, p.h) : h.w > 0 && h.h > 0);
      });
    }
    assert.ok(n >= 2, `${k}: only ${n} panels`);
  });
}

test("structureSvg covers every structure, composes the rigid set, and keeps the sheet size in mm", () => {
  for (const s of STRUCTURES) {
    const st = { type: s.id, params: defaultParams(s.id), t: 0.5 };
    const svg = structureSvg(st);
    const sheet = svgSheet(svg);
    assert.ok(sheet.w > 0 && sheet.h > 0 && !svg.includes("NaN"), s.id);
    if (s.id === "rigidSet") {
      assert.ok(["قاعدة", "غطاء", "منصة"].every((w) => svg.includes(w)), "three pieces (base, lid, insert)");
      assert.match(svg, /data-dieline='\{"type":"RIGID_SET"/);
    }
  }
});

test("the 3D build folds every structure into a closed body that is smaller than the flat sheet", () => {
  for (const s of STRUCTURES) {
    const st = { type: s.id, params: defaultParams(s.id, { L: 52, W: 52, H: 125 }, { w: 42, d: 42, h: 113 }), t: 0.5 };
    const look = lookOf({ ...defaultBox(), foil: "gold", effects: ["emboss", "spot_uv"] }, st);
    const b = buildStructure(st, look);
    assert.ok(b.hinges.length >= 1, `${s.id}: hinges`);
    b.setFold(0);
    b.group.updateMatrixWorld(true);
    const flat = new Box3().setFromObject(b.group).getSize(new Vector3());
    b.setFold(1);
    b.group.updateMatrixWorld(true);
    const closed = new Box3().setFromObject(b.group).getSize(new Vector3());
    assert.ok([flat.x, flat.y, flat.z, closed.x, closed.y, closed.z].every(Number.isFinite), `${s.id}: finite`);
    const area = (v) => Math.max(v.x * v.y, v.x * v.z, v.y * v.z);
    assert.ok(area(closed) < area(flat), `${s.id}: folding should shrink the footprint (${area(closed)} vs ${area(flat)})`);
  }
});

test("orientation rules: base-rooted trays fold their walls upward, the insert's feet point down, and the drawer sleeve lies on the ground", () => {
  const centres = (type, params, t = 1) => {
    const b = buildStructure({ type, params, t }, lookOf(defaultBox(), { type, params, t }));
    b.setFold(1);
    b.group.updateMatrixWorld(true);
    const out = [];
    b.group.traverse((o) => {
      if (o.isMesh && o.parent?.name) out.push({ id: o.parent.name, c: new Box3().setFromObject(o).getCenter(new Vector3()), s: new Box3().setFromObject(o).getSize(new Vector3()) });
    });
    return out;
  };
  const tray = centres("rigidTray", { L: 60, W: 60, H: 30 });
  const base = tray.find((x) => x.id === "base");
  assert.ok(tray.filter((x) => x.id === "wall").every((w) => w.c.y > base.c.y + 10 && w.s.y > 25), "walls stand on the base");
  const mailer = centres("mailer", { L: 60, W: 60, H: 30 }, 1.5);
  const lid = mailer.find((x) => x.id === "lid");
  assert.ok(lid.c.y > 25 && lid.s.y < 3, "the mailer lid closes flat over the box");
  const ins = centres("insert", { L: 59, W: 59, H: 12, bottleW: 40, bottleD: 40 }, 0.5);
  assert.ok(ins.filter((x) => x.id === "foot").every((f) => f.c.y < 0), "insert feet hang below the platform");
  const hinged = centres("hingedLid", { L: 60, W: 60, H: 35 }, 2);
  const hLid = hinged.find((x) => x.id === "lid"), lip = hinged.find((x) => x.id === "lip");
  assert.ok(hLid.c.y > 30 && hLid.s.y < 3 && lip.c.y < hLid.c.y && lip.c.y > 15, "hinged lid closes over the base with the lip hanging down the front");
  const tube = centres("tube", { D: 45, H: 120, lidH: 25 }, 1.5);
  const facets = tube.filter((x) => x.id === "body");
  assert.equal(facets.length, 24);
  const xs = facets.map((f) => f.c.x), zs = facets.map((f) => f.c.z);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 40 && Math.max(...zs) - Math.min(...zs) > 40, "facets close into a round body");
  const disc = tube.find((x) => x.id === "disc");
  assert.ok(disc.s.y < 2 && disc.s.x > 40 && disc.s.z > 40, "the base disc is flat and round");
  const bag = centres("giftBag", { W: 120, G: 70, H: 180 }, 0.5);
  assert.ok(bag.filter((x) => x.id === "bottom").every((b) => b.s.y < 1 && b.c.y < 1), "bag bottom flaps lie flat under the bag");
  const drawer = centres("drawer", { L: 60, W: 60, H: 30 }, 0.5);
  const sleeve = drawer.filter((x) => ["front", "back", "side", "glue"].includes(x.id));
  assert.ok(sleeve.length >= 4 && sleeve.every((x) => x.c.y >= -0.01 && x.c.x > 60), "the sleeve lies beside the tray, above the ground");
});

test("auto structure follows the studio box style; a window effect switches the tuck box to the window dieline", () => {
  const box = defaultBox({ w: 42, d: 42, h: 113 });
  assert.equal(autoStructure({ ...box, style: "tuck" }).type, "rte");
  assert.equal(autoStructure({ ...box, style: "tuck", effects: ["window"] }).type, "window");
  assert.equal(autoStructure({ ...box, style: "rigid" }).type, "rigidSet");
  assert.equal(autoStructure({ ...box, style: "magnetic" }).type, "hingedLid", "magnetic box gets the hinged rigid dieline");
  assert.equal(autoStructure({ ...box, style: "drawer" }).type, "drawer");
  for (const [st, ty] of [["sleeve", "sleeve"], ["window", "window"], ["hang", "hangTab"], ["shoulder", "shoulder"], ["hexagon", "hexagon"]]) assert.equal(autoStructure({ ...box, style: st }).type, ty, st);
  const tube = autoStructure({ ...box, style: "tube", L: 46, W: 46, H: 120 });
  assert.equal(tube.type, "tube");
  assert.deepEqual([tube.params.D, tube.params.H, tube.params.lidH], [46, 120, 26]);
  const a = autoStructure({ ...box, style: "tuck" });
  assert.deepEqual([a.params.L, a.params.W, a.params.H], [box.L, box.W, box.H]);
  assert.equal(a.t, 0.6, "default box is black board: 0.6 mm");
  assert.equal(autoStructure({ ...box, board: "white" }).t, 0.5, "SBS board: 0.5 mm");
  assert.equal(autoStructure({ ...box, style: "rigid" }).t, 2, "rigid board is 2 mm");
  assert.equal(stockFor("mailer", box), "corr");
  assert.equal(stockFor("rsc", box), "corr");
  assert.equal(stockFor("hingedLid", box), "grey");
  assert.equal(defaultThickness("hingedLid", { ...box, style: "magnetic" }), 2);
  const rsc = defaultParams("rsc", { L: 52, W: 52, H: 125 });
  assert.deepEqual(rsc, { L: 162, W: 110, H: 131 }, "master carton holds 3 × 2 boxes");
  assert.equal(defaultParams("vialCard", box).N, 5);
  assert.equal(cleanStructure({ type: "vialCard", params: { N: 40, vialD: 2, H: 90 }, t: 0.5 }).params.N, 12, "vial count is capped");
  assert.equal(stockFor("ste", { ...box, board: "kraft" }), "kraft");
  assert.equal(defaultThickness("mailer", box), 1.6);
  // الحشوة تأخذ فتحة الزجاجة من مقاس العبوة
  const ins = defaultParams("insert", box, { w: 42, d: 42, h: 113 });
  assert.equal(ins.bottleW, Math.min(44, ins.L - 4), "bottle cut-out = bottle + 2 mm, never wider than the platform");
  assert.ok(ins.L < box.L);
  assert.equal(defaultParams("insert", { L: 70, W: 70, H: 120 }, { w: 42, d: 42, h: 113 }).bottleW, 44);
  assert.equal(cleanStructure({ type: "rigidLid", params: { L: 60, W: 60, H: 22, clearance: 0 }, t: 2 }).params.clearance, 0, "zero clearance is allowed");
});

test("cleanStructure drops unknown types, fills missing params and clamps values; the compact field round-trips", () => {
  assert.equal(cleanStructure({ type: "cube" }), null);
  assert.equal(cleanStructure(null), null);
  const c = cleanStructure({ type: "hexagon", params: { S: 9999, H: "abc" }, t: 42 });
  assert.deepEqual(c, { type: "hexagon", params: { S: 600, H: 125 }, t: 3 });
  const s = { type: "rigidSet", params: { L: 60.5, W: 60, H: 35, clearance: 2.5, bottleW: 42, bottleD: 42 }, t: 2 };
  const f = structureField(s);
  assert.equal(f, "rigidSet|L=60.5,W=60,H=35,clearance=2.5,bottleW=42,bottleD=42|t=2");
  assert.deepEqual(parseStructureField(f), s);
  assert.equal(parseStructureField("nope|L=1"), null);
  assert.equal(parseStructureField("x".repeat(300)), null);
  assert.match(structureLabel(s, pick, t, num), /علبة صلبة كاملة.*L 60.5 × W 60 × H 35.*2.00 مم/);
  const box = { ...defaultBox(), structure: { type: "pillow", params: { Wp: 60, Hp: 110 }, t: 0.5 } };
  assert.equal(resolveStructure(box).type, "pillow", "a saved pick wins over the automatic one");
  assert.equal(resolveStructure({ ...box, structure: { type: "bogus" } }).type, "rte", "a broken pick falls back to automatic");
});

test("the brief and the tech pack read the structure back from the same object", () => {
  const brief = briefLines({ track: "C", box_extras: "thanks", box_structure: "crashLock|L=52,W=52,H=125|t=0.45" }, pick, t);
  const line = brief.find((l) => l.q.startsWith("هيكل القالب"));
  assert.ok(line && line.a.includes("قاعدة قفل ذاتي") && line.a.includes("0.45"), JSON.stringify(brief));
  assert.ok(!briefLines({ track: "C", box_extras: "thanks", box_structure: "zzz" }, pick, t).some((l) => l.q.startsWith("هيكل القالب")));
  const box = { ...defaultBox(), style: "rigid", structure: { type: "mailer", params: { L: 160, W: 110, H: 60 }, t: 1.5 } };
  const tp = techPackGroups({ bottle: null, cap: null, glass: "clear", capFinish: "gold", liquid: "amber", spec: { cap: "screw", pump: "standard", deco: "none", mould: "catalogue", weight: "standard" }, label: null, box }, pick, t, num, DEFAULT_BOX_RATES, []);
  const g = tp.groups.find((x) => x.title.includes("قالب القص"));
  assert.ok(g, "dieline group");
  const v = Object.fromEntries(g.rows.map((r) => [r.k, r.v]));
  assert.match(v["الهيكل"], /FEFCO 0427/);
  assert.equal(v["الأبعاد"], "L 160 × W 110 × H 60 مم");
  assert.equal(v["سماكة الخامة"], "1.50 مم");
  assert.match(v["خامة القالب"], /مضلّع/);
  assert.match(v["فرخ القالب"], /\d+ × \d+ مم/);
});
