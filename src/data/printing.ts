import type { Bi } from "@/i18n/context";

// طرق الطباعة والتنفيذ كما تعمل في مصانع التغليف: لكل طريقة نطاق الكمية الذي تتفوق فيه،
// والخامات التي تناسبها، ومتطلبات الملفات، ومدة التنفيذ. المنصة ترشّح الطريقة تلقائياً
// وتُظهر للعميل ما يحتاج تجهيزه قبل الطباعة، ويصل الاختيار للمصنع في ورقة المواصفات.

export type PrintMethodId = "digital" | "flexo" | "offset" | "screen" | "letterpress";

export interface PrintMethod {
  id: PrintMethodId;
  name: Bi;
  short: Bi;
  /** نطاق الكمية الاقتصادي */
  minQty: number;
  maxQty: number;
  /** أيام التنفيذ النموذجية بعد اعتماد الملفات */
  leadDays: [number, number];
  /** معامل سعر الوحدة مقارنة بالرقمي (1 = الرقمي) */
  unitFactor: number;
  /** تجهيز لمرة (ألواح/كليشات) بالريال */
  setup: number;
  /** خامات مناسبة */
  materials: string[];
  /** يدعم الطباعة المتغيّرة (أسماء، أرقام تشغيلة) */
  variable: boolean;
  pros: Bi[];
  cons: Bi[];
  icon: string;
}

export const PRINT_METHODS: PrintMethod[] = [
  { id: "digital", name: { ar: "طباعة رقمية (HP Indigo / حبر UV)", en: "Digital (HP Indigo / UV inkjet)" }, short: { ar: "رقمية", en: "Digital" }, minQty: 50, maxQty: 3000, leadDays: [3, 5], unitFactor: 1, setup: 0, materials: ["coated", "textured", "cotton", "pp_white", "pp_clear", "metallic"], variable: true, icon: "ri-printer-line", pros: [{ ar: "بلا ألواح ولا كليشات — اقتصادية للكميات الصغيرة والإصدارات المحدودة", en: "No plates — economical for small runs and limited editions" }, { ar: "أسماء وأرقام متغيّرة على كل ملصق", en: "Variable names and numbers per label" }], cons: [{ ar: "سعر الوحدة أعلى فوق 3,000", en: "Higher unit price above 3,000" }, { ar: "ألوان Pantone الخاصة تُحاكى من CMYK", en: "Spot Pantones are simulated from CMYK" }] },
  { id: "flexo", name: { ar: "فلكسو (لفّات) بحبر UV", en: "Flexographic (roll, UV inks)" }, short: { ar: "فلكسو", en: "Flexo" }, minQty: 2000, maxQty: 500000, leadDays: [7, 12], unitFactor: 0.55, setup: 650, materials: ["coated", "pp_white", "pp_clear", "metallic", "textured"], variable: false, icon: "ri-loop-left-line", pros: [{ ar: "الأرخص للوحدة من 5,000 فأكثر", en: "Cheapest per unit from 5,000 up" }, { ar: "لفّات جاهزة لماكينة اللصق الآلي", en: "Rolls ready for automatic applicators" }, { ar: "فويل بارد وورنيش في المرور نفسه", en: "Cold foil and varnish in the same pass" }], cons: [{ ar: "كليشات لكل لون", en: "A plate per colour" }, { ar: "التدرجات الناعمة أقل دقة من الأوفست", en: "Fine gradients are softer than offset" }] },
  { id: "offset", name: { ar: "أوفست (أفرخ) + قص", en: "Sheet-fed offset + die-cut" }, short: { ar: "أوفست", en: "Offset" }, minQty: 1000, maxQty: 200000, leadDays: [8, 14], unitFactor: 0.7, setup: 900, materials: ["coated", "textured", "cotton", "metallic", "wood"], variable: false, icon: "ri-newspaper-line", pros: [{ ar: "أدق الألوان والتدرجات وPantone الحقيقي", en: "The most accurate colour, gradients and true Pantone" }, { ar: "يجمع الفويل الساخن والبروز في المطبعة نفسها", en: "Hot foil and embossing in the same print house" }], cons: [{ ar: "تجهيز ألواح لكل طلب", en: "Plates for every order" }, { ar: "ملصقات أفرخ تُلصق يدوياً أو بماكينة أفرخ", en: "Sheet labels are applied by hand or sheet applicator" }] },
  { id: "screen", name: { ar: "شاشة حريرية (حبر سميك)", en: "Screen printing (thick ink)" }, short: { ar: "شاشة", en: "Screen" }, minQty: 500, maxQty: 50000, leadDays: [7, 12], unitFactor: 0.9, setup: 400, materials: ["pp_clear", "pp_white", "metallic"], variable: false, icon: "ri-brush-line", pros: [{ ar: "أبيض معتم وألوان ميتاليك سميكة على الشفاف", en: "Opaque white and thick metallics on clear stock" }, { ar: "ملمس بارز بالحبر نفسه", en: "A raised feel from the ink itself" }], cons: [{ ar: "لا تناسب الصور والتدرجات", en: "Not for photos or gradients" }, { ar: "لون لكل شاشة", en: "One colour per screen" }] },
  { id: "letterpress", name: { ar: "ليتربرس (طباعة غائرة)", en: "Letterpress" }, short: { ar: "ليتربرس", en: "Letterpress" }, minQty: 300, maxQty: 20000, leadDays: [10, 15], unitFactor: 1.4, setup: 550, materials: ["cotton", "textured"], variable: false, icon: "ri-stamp-line", pros: [{ ar: "انطباع غائر محسوس على الورق القطني — طابع حِرفي", en: "A tactile debossed impression on cotton — artisanal" }], cons: [{ ar: "ألوان مسطّحة قليلة", en: "Few flat colours" }, { ar: "أغلى للوحدة", en: "Pricier per unit" }] },
];

export const printMethodById = (id?: string | null) => PRINT_METHODS.find((m) => m.id === id) ?? PRINT_METHODS[0];

/** الترشيح التلقائي من الكمية والخامة والتأثيرات والطباعة المتغيّرة */
export function recommendPrintMethod(o: { qty: number; material: string; effects: string[]; variable?: boolean }): { id: PrintMethodId; why: Bi } {
  const { qty, material, effects } = o;
  if (o.variable || qty < 1000) return { id: "digital", why: { ar: qty < 1000 ? "كمية صغيرة: الرقمية بلا تجهيز وأسرع تسليماً" : "أسماء متغيّرة على كل ملصق تتطلب طباعة رقمية", en: qty < 1000 ? "Small run: digital has no setup and ships fastest" : "Variable names per label need digital" } };
  if (material === "pp_clear" && !effects.includes("emboss")) return { id: "screen", why: { ar: "الشفاف يحتاج أبيض معتم وألواناً سميكة — الشاشة الحريرية أو الفلكسو UV", en: "Clear stock needs opaque white and thick colour — screen or UV flexo" } };
  if (material === "cotton" && qty <= 5000) return { id: "letterpress", why: { ar: "الورق القطني يُظهر جمال الليتربرس الغائر", en: "Cotton shows letterpress at its best" } };
  if (qty >= 5000 && ["coated", "pp_white", "metallic", "pp_clear"].includes(material)) return { id: "flexo", why: { ar: "كمية كبيرة على لفّات: الفلكسو أرخص للوحدة وجاهزة للّصق الآلي", en: "Large roll run: flexo is cheapest per unit and ready for auto-application" } };
  if (effects.some((e) => ["emboss", "deboss", "spot_uv"].includes(e)) || qty >= 1000) return { id: "offset", why: { ar: "الأوفست يجمع دقة الألوان مع الفويل والبروز في مطبعة واحدة", en: "Offset pairs colour accuracy with foil and embossing in one house" } };
  return { id: "digital", why: { ar: "الخيار الآمن للتجارب والكميات المتوسطة", en: "The safe choice for trials and mid runs" } };
}

/** متطلبات الملفات قبل الطباعة — تُعرض للعميل كقائمة تحقق وتصل المصنع في ورقة المواصفات */
export interface ArtworkRequirement {
  id: string;
  text: Bi;
  /** يخص هذه الطرق فقط (فارغ = الكل) */
  methods?: PrintMethodId[];
}
export const ARTWORK_REQUIREMENTS: ArtworkRequirement[] = [
  { id: "vector", text: { ar: "الشعار والنصوص بصيغة متجهية (SVG / AI / PDF) أو 300 نقطة/بوصة بالمقاس الحقيقي", en: "Logo and text as vectors (SVG / AI / PDF) or 300 dpi at real size" } },
  { id: "cmyk", text: { ar: "الألوان CMYK مع رقم Pantone للألوان الخاصة والفويل", en: "CMYK colours with Pantone references for spot colours and foil" } },
  { id: "bleed", text: { ar: "هامش قص 3 مم ومنطقة أمان 3 مم من خط القص", en: "3 mm bleed and a 3 mm safe zone inside the cut line" } },
  { id: "fonts", text: { ar: "الخطوط محوَّلة إلى مسارات أو مرفقة", en: "Fonts outlined or supplied" } },
  { id: "layers", text: { ar: "طبقة منفصلة لكل تشطيب: الفويل، البروز، الورنيش الموضعي، الأبيض المعتم", en: "A separate layer per finish: foil, emboss, spot UV, opaque white" }, methods: ["offset", "flexo", "screen", "letterpress"] },
  { id: "white", text: { ar: "طبقة أبيض معتم تحت الألوان على الخامات الشفافة والمعدنية", en: "An opaque white underprint on clear and metallic stocks" }, methods: ["screen", "flexo", "digital"] },
  { id: "legal", text: { ar: "النص النظامي: الحجم بالمل، التركيز، المكوّنات (INCI)، بلد المنشأ، رقم التشغيلة والباركود", en: "Regulatory text: volume in ml, concentration, INCI, country of origin, batch and barcode" } },
  { id: "proof", text: { ar: "اعتماد بروفة رقمية ثم عينة مطبوعة قبل التشغيلة", en: "Approve a digital proof, then a printed sample before the run" } },
];

/** كيف تُنفَّذ التأثيرات والخامات في المصنع — للمعرفة داخل المنصة */
export const EXECUTION_NOTES: { id: string; title: Bi; body: Bi }[] = [
  { id: "foil", title: { ar: "الفويل الساخن", en: "Hot foil" }, body: { ar: "كليشة نحاسية تضغط رقاقة معدنية بالحرارة؛ الخطوط الأدق من 0.3 مم تُفقد، والمساحات الكبيرة تحتاج فويلاً خاصاً.", en: "A brass die presses metallic foil with heat; lines finer than 0.3 mm are lost and large areas need special foil." } },
  { id: "emboss", title: { ar: "البروز والغائر", en: "Embossing & debossing" }, body: { ar: "قالبان ذكر وأنثى يضغطان الورق؛ يُفضَّل ورق 90 غم فأكثر، ولا يُنفَّذ على PP الرقيق.", en: "Male and female dies press the paper; 90 gsm or heavier is preferred and thin PP is not suitable." } },
  { id: "spotuv", title: { ar: "الورنيش الموضعي", en: "Spot UV" }, body: { ar: "طبقة لامعة تُجفَّف بالأشعة فوق البنفسجية على مناطق محددة فوق تشطيب مطفأ؛ تحتاج طبقة ملف منفصلة.", en: "A UV-cured gloss layer on chosen areas over a matte finish; needs its own file layer." } },
  { id: "glass", title: { ar: "التزيين المباشر على الزجاج", en: "Direct glass decoration" }, body: { ar: "طباعة شاشة بأحبار سيراميكية تُحرق في الفرن، أو فويل حراري على الزجاج، أو نقش ليزر/رملي دائم؛ جميعها تحتاج عينة اعتماد.", en: "Screen print with kiln-fired ceramic inks, hot foil on glass, or permanent laser/sand etching; all need an approval sample." } },
  { id: "apply", title: { ar: "اللصق", en: "Application" }, body: { ar: "الملصقات على لفّات تُلصق آلياً بدقة ±0.5 مم؛ ملصقات الأفرخ تُلصق يدوياً وتناسب الكميات الصغيرة والأشكال الخاصة.", en: "Roll labels apply automatically within ±0.5 mm; sheet labels are hand-applied and suit small runs and special shapes." } },
];
