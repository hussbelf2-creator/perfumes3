import type { Bi } from "../i18n/context";

// خطة التنفيذ: تحوّل اختيارات العميل (المسار، الكمية، القالب، العلبة، التركيز…) إلى مراحل بمدد وتواريخ،
// وتحدد «ما الذي يحكم موعد التسليم» (المسار الحرج). الأرقام من ممارسات المصانع (docs/research/manufacturing.md)
// والإدارة تعدّلها من «مركز التحكم». الاستيراد نسبي لأن دوال الخادم قد تستخدمها.

export type PlanTrack = "A" | "B" | "C" | "D" | "E" | "F" | "P";
export type Concentration = "edt" | "edp" | "extrait" | "oil";
export type Range = [number, number];
export type Lane = "client" | "juice" | "pack" | "reg" | "line";
export type Phase = "prepare" | "juice" | "pack" | "produce" | "deliver";

export interface PlanInput {
  track: PlanTrack;
  qty: number;
  /** حالة التركيبة (مسار التصنيع E يسأل عنها؛ A و B تطوير دائماً) */
  formula?: "ready" | "reference" | "develop";
  concentration?: Concentration;
  /** عود أو مخلّط ثقيل: تعتيق أطول */
  oud?: boolean;
  mould?: "catalogue" | "semi" | "private";
  /** عائلة العلبة، أو null بلا علبة */
  box?: "folding" | "rigid" | "tube" | "corr" | null;
  labelPrint?: "digital" | "flexo" | "offset" | "screen" | "letterpress" | null;
  /** زخرفة مباشرة على الزجاج (طلاء، طباعة حريرية…) */
  deco?: boolean;
  /** هل التغليف جاهز عند العميل؟ (مسار E) */
  packaging?: "yes" | "partly" | "no";
  /** ملفات التصميم (مسار F) */
  files?: "ready" | "prep" | "design";
  start?: Date;
}

export interface PlanConfig {
  days: Record<string, Range>;
  maceration: Record<Concentration, Range>;
  oudExtra: number;
  /** طاقة الخط: وحدة في اليوم */
  fillPerDay: number;
  packPerDay: number;
}

export const DEFAULT_PLAN: PlanConfig = {
  days: {
    approve: [1, 3],
    formula_develop: [21, 49],
    formula_reference: [10, 21],
    scent_ok: [2, 5],
    stability: [7, 14],
    regulatory: [15, 25],
    identity: [14, 28],
    artwork: [5, 10],
    artwork_ok: [2, 4],
    bottle_catalogue: [7, 14],
    bottle_semi: [35, 50],
    bottle_private: [70, 98],
    deco: [7, 12],
    box_folding: [14, 24],
    box_rigid: [24, 38],
    box_tube: [20, 30],
    box_corr: [10, 16],
    label_digital: [3, 5],
    label_flexo: [7, 12],
    label_offset: [8, 14],
    label_screen: [7, 12],
    label_letterpress: [10, 15],
    receive: [2, 4],
    golden: [5, 8],
    golden_ok: [1, 3],
    compound: [2, 3],
    filter: [2, 3],
    qc: [1, 3],
    delivery: [2, 5],
    concepts: [7, 14],
    concept_ok: [2, 5],
    system: [7, 14],
    handover: [1, 2],
    files_prep: [3, 5],
    files_design: [7, 14],
    proof_ok: [1, 3],
    finishing: [2, 4],
    consult: [1, 3],
    trial: [5, 7],
    trial_ok: [2, 4],
    bottling: [3, 5],
  },
  maceration: { edt: [14, 21], edp: [21, 35], extrait: [28, 42], oil: [5, 10] },
  oudExtra: 14,
  fillPerDay: 4000,
  packPerDay: 5000,
};

export interface PlanStage {
  id: string;
  lane: Lane;
  phase: Phase;
  name: Bi;
  /** شرح بسيط للعميل */
  what: Bi;
  /** ما المطلوب من العميل في هذه المرحلة (إن وُجد) */
  needs?: Bi;
  days: Range;
  /** اليوم الذي تبدأ وتنتهي فيه من بداية المشروع (أدنى، أقصى) */
  start: Range;
  end: Range;
  critical: boolean;
}
export interface Plan {
  stages: PlanStage[];
  total: Range;
  eta: [Date, Date];
  /** المرحلة التي تحكم الموعد (أطول مرحلة على المسار الحرج، من غير مراحل العميل) */
  driver: PlanStage | null;
  /** مراحل ينتظر فيها المشروع قرار العميل */
  clientStages: PlanStage[];
}

export const PHASES: { id: Phase; name: Bi; icon: string }[] = [
  { id: "prepare", name: { ar: "التحضير والاعتماد", en: "Preparation & approval" }, icon: "ri-file-list-3-line" },
  { id: "juice", name: { ar: "التركيبة والتعتيق", en: "Formula & maturation" }, icon: "ri-flask-line" },
  { id: "pack", name: { ar: "التغليف والطباعة", en: "Packaging & print" }, icon: "ri-box-3-line" },
  { id: "produce", name: { ar: "التعبئة والتجميع", en: "Filling & assembly" }, icon: "ri-settings-3-line" },
  { id: "deliver", name: { ar: "الفحص والتسليم", en: "QC & delivery" }, icon: "ri-truck-line" },
];

interface Node {
  id: string;
  lane: Lane;
  phase: Phase;
  name: Bi;
  what: Bi;
  needs?: Bi;
  days: Range;
  after: string[];
}
const bi = (ar: string, en: string): Bi => ({ ar, en });

/** يبني الخطة: شبكة مراحل، ثم أبكر بداية ونهاية لكل مرحلة (أدنى وأقصى)، ثم المسار الحرج على الأقصى */
export function buildPlan(input: PlanInput, cfg: PlanConfig = DEFAULT_PLAN): Plan {
  const D = (k: string): Range => cfg.days[k] ?? DEFAULT_PLAN.days[k] ?? [1, 2];
  const qty = Math.max(1, Math.round(input.qty || 1));
  const nodes: Node[] = [];
  const add = (id: string, lane: Lane, phase: Phase, name: Bi, what: Bi, days: Range, after: string[], needs?: Bi) => {
    nodes.push({ id, lane, phase, name, what, needs, days, after: after.filter((a) => nodes.some((n) => n.id === a)) });
    return id;
  };
  const t = input.track;
  add("approve", "client", "prepare", bi("اعتماد العرض ودفع العربون", "Quote approval & deposit"), bi("يبدأ العمل لحظة وصول العربون", "Work starts the moment the deposit lands"), D("approve"), [], bi("اعتمد العرض وادفع العربون", "Approve the quote and pay the deposit"));

  if (t === "D") {
    add("concepts", "pack", "prepare", bi("المفاهيم البصرية", "Visual concepts"), bi("اتجاهان أو ثلاثة للهوية", "Two or three identity directions"), D("concepts"), ["approve"]);
    add("concept_ok", "client", "prepare", bi("اختيارك للاتجاه", "Your choice of direction"), bi("تختار اتجاهاً وتطلب تعديلاته", "Pick a direction and request changes"), D("concept_ok"), ["concepts"], bi("اختر الاتجاه", "Choose the direction"));
    add("system", "pack", "pack", bi("النظام البصري", "Visual system"), bi("الشعار وتنويعاته والألوان والخطوط ودليل الاستخدام", "Logo, variations, colours, type and guidelines"), D("system"), ["concept_ok"]);
    add("handover", "line", "deliver", bi("تسليم الملفات", "File handover"), bi("ملفات مفتوحة وجاهزة للطباعة", "Open, print-ready files"), D("handover"), ["system"]);
  } else if (t === "P") {
    add("consult", "juice", "prepare", bi("جلسة مستشار التكوين", "Composition consultation"), bi("نضبط مكوناتك ونسبها", "We tune your notes and ratios"), D("consult"), ["approve"]);
    add("trial", "juice", "juice", bi("العينات التجريبية", "Trial samples"), bi("نسختان بنسب مختلفة تصلانك", "Two versions with different ratios, shipped to you"), D("trial"), ["consult"]);
    add("trial_ok", "client", "juice", bi("اختيارك للنسخة", "Your pick"), bi("تجرّبهما على جلدك وتعتمد إحداهما", "Try both on skin and approve one"), D("trial_ok"), ["trial"], bi("اعتمد النسخة التي تفضّلها", "Approve the version you prefer"));
    add("bottling", "line", "produce", bi("التعبئة والنقش", "Bottling & engraving"), bi("تعبئة النسخة المعتمدة ونقش الاسم", "Fill the approved version and engrave the name"), D("bottling"), ["trial_ok"]);
    add("delivery", "line", "deliver", bi("التوصيل", "Delivery"), bi("شحن مؤمَّن إلى بابك", "Insured shipping to your door"), D("delivery"), ["bottling"]);
  } else if (t === "F") {
    const f = input.files ?? "ready";
    if (f !== "ready") add("files", "pack", "prepare", f === "design" ? bi("تصميم الملفات", "Designing the files") : bi("تجهيز الملفات للطباعة", "Preparing the files for print"), bi("نضبط النزف والألوان والقص", "We set bleed, colours and cut lines"), D(f === "design" ? "files_design" : "files_prep"), ["approve"]);
    add("proof", "pack", "prepare", bi("البروفة", "Proof"), bi("بروفة رقمية ثم مطبوعة على الخامة الفعلية", "A digital then printed proof on the real stock"), [2, 4], ["files", "approve"]);
    add("proof_ok", "client", "prepare", bi("اعتمادك للبروفة", "Your proof approval"), bi("بعد الاعتماد تُقفل الملفات ويبدأ الطبع", "Once approved the files lock and printing starts"), D("proof_ok"), ["proof"], bi("اعتمد البروفة", "Approve the proof"));
    add("print", "pack", "pack", bi("الطباعة", "Printing"), bi("طباعة الكمية كاملة", "Printing the full run"), D(`label_${input.labelPrint ?? "offset"}`), ["proof_ok"]);
    if (input.box) add("box", "pack", "pack", bi("تصنيع العلب", "Box making"), bi("قص وتكسير ولصق", "Die-cut, crease and glue"), D(`box_${input.box}`), ["proof_ok"]);
    add("finishing", "line", "produce", bi("التشطيب والفحص", "Finishing & inspection"), bi("فويل وبروز وقص ثم فحص وتعبئة", "Foil, emboss and cut, then inspect and pack"), D("finishing"), ["print", "box"]);
    add("delivery", "line", "deliver", bi("التوصيل", "Delivery"), bi("كراتين مرقّمة إلى مستودعك", "Numbered cartons to your warehouse"), D("delivery"), ["finishing"]);
  } else {
    // A براند كامل · B تطوير عطر · C عبوة وتغليف · E تصنيع
    const juice = t !== "C";
    const packaging = t !== "B";
    const formula = t === "A" || t === "B" ? "develop" : input.formula ?? "ready";
    let juiceReady = "approve";
    if (juice) {
      if (formula !== "ready") {
        add("formula", "juice", "juice", formula === "develop" ? bi("تطوير التركيبة", "Formula development") : bi("مطابقة العطر المرجعي", "Matching the reference scent"), bi("جولات عينات مرقّمة حتى تعتمد الرائحة", "Numbered sample rounds until you approve the scent"), D(`formula_${formula}`), ["approve"]);
        add("scent_ok", "client", "juice", bi("اعتمادك للرائحة", "Your scent approval"), bi("العينة المعتمدة تصبح المرجع الذي نطابقه في كل تشغيلة", "The approved sample becomes the standard every batch is matched to"), D("scent_ok"), ["formula"], bi("اعتمد العينة النهائية", "Approve the final sample"));
        juiceReady = "scent_ok";
      }
      if (t === "B") {
        add("stability", "juice", "juice", bi("اختبار الثبات والتوافق", "Stability & compatibility test"), bi("حرارة وضوء وتجميد، وقياس الثبات والانتشار", "Heat, light and freeze cycles; longevity and sillage measured"), D("stability"), [juiceReady]);
        add("handover", "line", "deliver", bi("تسليم ملف المواصفات", "Specification file handover"), bi("التركيبة وشهادة IFRA وصحيفة السلامة", "Formula, IFRA certificate and safety data sheet"), D("handover"), ["stability"]);
      } else {
        add("regulatory", "reg", "prepare", bi("الملف النظامي", "Regulatory file"), bi("شهادة IFRA وصحيفة السلامة وإدراج المنتج في «غد» لدى هيئة الغذاء والدواء", "IFRA certificate, SDS and the SFDA GHAD product listing"), D("regulatory"), [juiceReady]);
        const mac = cfg.maceration[input.concentration ?? "edp"] ?? DEFAULT_PLAN.maceration.edp;
        const extra = input.oud ? cfg.oudExtra : 0;
        add("compound", "juice", "juice", bi("تحضير المركّز والتخفيف", "Compounding & dilution"), bi("وزن المكوّنات ومزجها ثم تخفيفها بالكحول", "Weighing and blending, then dilution in alcohol"), D("compound"), [juiceReady]);
        add("maceration", "juice", "juice", bi("التعتيق", "Maceration"), bi("العطر يرتاح في خزانات معتمة حتى تندمج مكوّناته. هذه المدة لا تُختصر بلا أثر على الجودة", "The perfume rests in dark tanks until it melds. This time can't be cut without hurting quality"), [mac[0] + extra, mac[1] + extra], ["compound"]);
        add("filter", "juice", "juice", bi("التبريد والترشيح", "Chilling & filtration"), bi("تبريد يرسّب الشوائب ثم ترشيح يعطي سائلاً صافياً", "Chilling drops out haze, filtration leaves a clear liquid"), D("filter"), ["maceration"]);
      }
    }
    if (packaging) {
      const ready = t === "E" ? input.packaging ?? "no" : "no";
      const packDone: string[] = [];
      if (ready === "yes") {
        packDone.push(add("receive", "pack", "pack", bi("استلام تغليفك وفحصه", "Receiving & inspecting your packaging"), bi("نفحص العبوات والعلب الواردة ونحجرها حتى تُعتمد", "Incoming bottles and boxes are inspected and quarantined until approved"), D("receive"), ["approve"], bi("ورّد العبوات والعلب للمصنع", "Deliver bottles and boxes to the factory")));
      } else {
        const design = t === "A" ? "identity" : "artwork";
        add("artwork", "pack", "pack", t === "A" ? bi("الهوية وتصميم العبوة", "Identity & pack design") : bi("الأعمال الفنية", "Artwork"), t === "A" ? bi("الاسم والشعار وتصميم الملصق والعلبة", "Name, logo, label and box design") : bi("ملفات الطباعة على القالب مع ألوان Pantone", "Print files on the dieline with Pantone colours"), D(design), ["approve"]);
        add("artwork_ok", "client", "pack", bi("اعتمادك للتصميم", "Your design approval"), bi("بعد الاعتماد تُطلب المواد من الموردين", "After approval, materials are ordered from suppliers"), D("artwork_ok"), ["artwork"], bi("اعتمد التصاميم", "Approve the designs"));
        if (ready === "partly") {
          // العبوات عند العميل، والعلبة والملصق نصنعهما
          packDone.push(add("receive", "pack", "pack", bi("استلام عبواتك وفحصها", "Receiving & inspecting your bottles"), bi("نفحص الوارد ونحجره حتى يُعتمد", "Incoming goods are inspected and quarantined until approved"), D("receive"), ["approve"], bi("ورّد ما لديك من عبوات للمصنع", "Deliver the bottles you have to the factory")));
        } else {
          const b = add("bottle", "pack", "pack", input.mould === "private" ? bi("قالب الزجاج الخاص وإنتاج العبوات", "Private glass mould & bottle run") : input.mould === "semi" ? bi("قالب الغطاء الخاص وتوريد العبوات", "Custom cap mould & bottle supply") : bi("توريد العبوات والأغطية والمضخات", "Bottles, caps & pumps supply"), input.mould === "private" ? bi("تصنيع القالب ثم عينة أولى ثم الإنتاج", "Tooling, a first-off sample, then the run") : bi("من مخزون المصنع أو المورد المعتمد", "From factory stock or the approved supplier"), D(`bottle_${input.mould ?? "catalogue"}`), ["artwork_ok"]);
          packDone.push(input.deco ? add("deco", "pack", "pack", bi("زخرفة الزجاج", "Glass decoration"), bi("طلاء أو طباعة مباشرة على العبوات", "Coating or direct print on the bottles"), D("deco"), [b]) : b);
        }
        if (input.box) packDone.push(add("box", "pack", "pack", bi("تصنيع العلب", "Box making"), bi("طباعة وتشطيب وقص وتجميع", "Print, finish, die-cut and assemble"), D(`box_${input.box}`), ["artwork_ok"]));
        if (input.labelPrint) packDone.push(add("label", "pack", "pack", bi("طباعة الملصقات", "Label printing"), bi("على لفّات جاهزة للّصق", "On rolls ready for application"), D(`label_${input.labelPrint}`), ["artwork_ok"]));
      }
      add("golden", "line", "produce", bi("العينة الذهبية", "Golden sample"), bi("قطعة واحدة كاملة كما ستُنتج: معبأة ومزخرفة ومعلّبة", "One finished unit exactly as it will be made: filled, decorated and boxed"), D("golden"), [...packDone, juice ? juiceReady : "approve"]);
      add("golden_ok", "client", "produce", bi("توقيعك على العينة الذهبية", "Your golden-sample sign-off"), bi("توقيعك عليها مرجع الفحص لكل ما يُنتج بعدها", "Your signature makes it the inspection standard for the whole run"), D("golden_ok"), ["golden"], bi("وقّع على العينة الذهبية", "Sign off the golden sample"));
      const lineDays = (per: number): Range => {
        const d = Math.max(2, Math.ceil(qty / per));
        return [d, d + 2];
      };
      const fillAfter = ["golden_ok", "filter"];
      if (juice) add("fill", "line", "produce", bi("التعبئة والكبس والتغطية", "Filling, crimping & capping"), bi("تعبئة آلية مع فحص مستوى التعبئة والتسرب كل ساعة", "Automatic filling with hourly fill-level and leak checks"), lineDays(cfg.fillPerDay), fillAfter);
      add("packing", "line", "produce", juice ? bi("اللصق والترميز والتعليب", "Labelling, coding & boxing") : bi("التجميع والتعبئة", "Assembly & packing"), juice ? bi("ملصق ورقم تشغيلة وعلبة وسلوفان", "Label, batch code, box and cello wrap") : bi("تجميع القطع وتعبئتها في كراتين مرقّمة", "Assembling parts into numbered cartons"), lineDays(cfg.packPerDay), juice ? ["fill"] : ["golden_ok"]);
      add("qc", "line", "deliver", bi("الفحص النهائي والإفراج", "Final QC & release"), bi("فحص بعيّنة إحصائية (AQL) ثم إفراج موقّع عن التشغيلة", "Statistical (AQL) sampling, then a signed batch release"), D("qc"), ["packing", "regulatory"]);
      add("delivery", "line", "deliver", bi("التوصيل", "Delivery"), bi("كراتين مرقّمة إلى مستودعك", "Numbered cartons to your warehouse"), D("delivery"), ["qc"]);
    }
  }

  // أبكر بداية = أقصى نهاية بين المراحل السابقة (للأدنى والأقصى كلٌّ على حدة)
  const done = new Map<string, PlanStage>();
  for (const n of nodes) {
    const prev = n.after.map((a) => done.get(a)!).filter(Boolean);
    const start: Range = [Math.max(0, ...prev.map((p) => p.end[0])), Math.max(0, ...prev.map((p) => p.end[1]))];
    done.set(n.id, { id: n.id, lane: n.lane, phase: n.phase, name: n.name, what: n.what, needs: n.needs, days: n.days, start, end: [start[0] + n.days[0], start[1] + n.days[1]], critical: false });
  }
  const stages = [...done.values()];
  const last = stages.reduce((a, b) => (b.end[1] >= a.end[1] ? b : a), stages[0]);
  // المسار الحرج: نرجع من الأخيرة عبر السابقة التي تنتهي آخراً
  let cur: PlanStage | undefined = last;
  while (cur) {
    cur.critical = true;
    const node: Node = nodes.find((n) => n.id === cur!.id)!;
    const prev: PlanStage[] = node.after.map((a) => done.get(a)!).filter(Boolean);
    cur = prev.length ? prev.reduce((a, b) => (b.end[1] > a.end[1] ? b : a)) : undefined;
  }
  const total: Range = [last.end[0], last.end[1]];
  const start = input.start ?? new Date();
  const at = (d: number) => new Date(start.getTime() + d * 86_400_000);
  const driver = stages.filter((s) => s.critical && s.lane !== "client").sort((a, b) => b.days[1] - a.days[1])[0] ?? null;
  return { stages, total, eta: [at(total[0]), at(total[1])], driver, clientStages: stages.filter((s) => s.lane === "client") };
}

/** أسابيع مقرّبة لعرض المدة: «6 – 9 أسابيع» */
export function weeks(r: Range): Range {
  return [Math.max(1, Math.round(r[0] / 7)), Math.max(1, Math.round(r[1] / 7))];
}

/** خطة من إجابات البريف (a_*) وحقول الاستوديو المرفقة بالطلب */
export function planInputFromPayload(track: string | null | undefined, payload: Record<string, unknown> | null | undefined): PlanInput | null {
  if (!track || !"ABCDEFP".includes(track)) return null;
  const p = payload ?? {};
  const s = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : "");
  const qtyMap: Record<string, number> = { lt300: 300, "300_1000": 1000, "1000_5000": 3000, gt5000: 8000 };
  const calcQty = Number(s("calc_qty")) || 0;
  const formula = s("a_formula");
  const fam = s("a_family");
  const structure = s("box_structure");
  const boxStyle = s("box_style") || structure.split("|")[0];
  const rigid = /rigid|magnetic|shoulder|clamshell|telescope|neck|discovery/i.test(boxStyle);
  const need = s("a_need");
  const wantsBox = track === "A" || !!structure || !!boxStyle || /box|gift/.test(need) || /boxes|gift/.test(s("a_items"));
  const print = s("label_print");
  return {
    track: track as PlanTrack,
    qty: calcQty || qtyMap[s("a_qty")] || (track === "P" ? 1 : 1000),
    formula: formula === "ready" || formula === "reference" || formula === "develop" ? formula : undefined,
    oud: /oud/.test(fam),
    mould: s("spec_mould") === "private" || s("a_package") === "2" && track === "C" ? "private" : s("spec_mould") === "semi" ? "semi" : "catalogue",
    box: wantsBox ? (rigid ? "rigid" : /tube/i.test(boxStyle) ? "tube" : "folding") : null,
    labelPrint: (["digital", "flexo", "offset", "screen", "letterpress"] as const).find((m) => m === print) ?? (track === "D" || track === "B" || track === "P" ? null : "digital"),
    deco: !!s("spec_deco") && s("spec_deco") !== "none",
    packaging: (["yes", "partly", "no"] as const).find((x) => x === s("a_packaging")),
    files: (["ready", "prep", "design"] as const).find((x) => x === s("a_files")),
  };
}
