import type { Bi } from "@/i18n/context";
import type { PackModel } from "./types";
import { productFit } from "./fit";
import { autoFixAll, bestCap } from "./rules";
import { DEFAULT_BOTTLE_SPEC, cleanExtras, type BottleSpec, type BoxEffectId, type ExtraId } from "./spec";
import { WRAPPED, defaultBox, fitFor, styleById, type Board, type BoxDesign, type BoxFinish, type BoxStyle } from "./box/types";
import { makeTemplate, type TemplateId } from "./label/templates";
import type { Foil, FontId, LabelDesign, LabelMaterial, Paper } from "./label/types";

// الأطقم الجاهزة: منتج كامل منسجم (عبوة + غطاء + ملصق + علبة) يبدأ منه العميل بدل اللوحة الفارغة.
// مبنية على أنماط السوق الشائعة (docs/research/packaging-ux.md)، وكل طقم يمر من قواعد التوافق قبل عرضه.

export type KitGroup = "classic" | "niche" | "oud" | "men" | "women" | "modern" | "natural" | "gift" | "travel" | "corporate" | "starter" | "limited";
export const KIT_GROUPS: { id: KitGroup; name: Bi; note: Bi; icon: string }[] = [
  { id: "classic", name: { ar: "كلاسيكي", en: "Classic" }, note: { ar: "الشكل الذي يعرفه السوق ويثق به", en: "The look the market knows and trusts" }, icon: "ri-vip-crown-line" },
  { id: "oud", name: { ar: "عود وتراث", en: "Oud & heritage" }, note: { ar: "دهن العود والمخلطات والطابع الخليجي", en: "Oud oils, mukhallat and the Gulf look" }, icon: "ri-fire-line" },
  { id: "niche", name: { ar: "نيش وصيدلية", en: "Niche & apothecary" }, note: { ar: "بساطة الدور المتخصصة", en: "The restraint of specialist houses" }, icon: "ri-flask-line" },
  { id: "women", name: { ar: "نسائي", en: "Feminine" }, note: { ar: "زهري وناعم", en: "Floral and soft" }, icon: "ri-flower-line" },
  { id: "men", name: { ar: "رجالي", en: "Masculine" }, note: { ar: "داكن وحاد", en: "Dark and sharp" }, icon: "ri-shield-line" },
  { id: "modern", name: { ar: "عصري وشبابي", en: "Modern & young" }, note: { ar: "ألوان جريئة وخطوط نظيفة", en: "Bold colour, clean lines" }, icon: "ri-flashlight-line" },
  { id: "natural", name: { ar: "طبيعي ومستدام", en: "Natural & sustainable" }, note: { ar: "كرافت وخشب وورق معاد تدويره", en: "Kraft, wood and recycled paper" }, icon: "ri-leaf-line" },
  { id: "gift", name: { ar: "هدايا ومواسم", en: "Gifts & seasons" }, note: { ar: "رمضان والعيد والأعراس واليوم الوطني", en: "Ramadan, Eid, weddings and National Day" }, icon: "ri-gift-2-line" },
  { id: "travel", name: { ar: "سفر وعينات", en: "Travel & samples" }, note: { ar: "أحجام الجيب وأطقم الاكتشاف", en: "Pocket sizes and discovery sets" }, icon: "ri-suitcase-3-line" },
  { id: "corporate", name: { ar: "شركات وفنادق", en: "Corporate & hotels" }, note: { ar: "هدايا بشعار الجهة", en: "Gifts carrying the client's logo" }, icon: "ri-building-2-line" },
  { id: "starter", name: { ar: "بداية اقتصادية", en: "Starter" }, note: { ar: "أقل حد أدنى وأسرع تنفيذ", en: "Lowest minimum, fastest turnaround" }, icon: "ri-seedling-line" },
  { id: "limited", name: { ar: "إصدارات محدودة", en: "Limited editions" }, note: { ar: "قطع مرقّمة لهواة الاقتناء", en: "Numbered pieces for collectors" }, icon: "ri-medal-line" },
];

export interface Kit {
  id: string;
  group: KitGroup;
  name: Bi;
  note: Bi;
  bottle: string;
  cap: string;
  glass: string;
  capFinish: string;
  liquid: string;
  spec?: Partial<BottleSpec>;
  label: { template: TemplateId; paper?: Paper; color?: string; material?: LabelMaterial; conc?: string } | null;
  box: { style: BoxStyle; board: Board; color?: string; finish: BoxFinish; foil: Foil; frame?: boolean; font?: FontId; effects?: BoxEffectId[]; extras?: ExtraId[] } | null;
  /** اسم الدار واسم العطر التجريبيان (يستبدلهما العميل) */
  brand: string;
  scent: string;
}

type LabelSpec = NonNullable<Kit["label"]>;
type BoxSpec = NonNullable<Kit["box"]>;
const L = (template: TemplateId, o: Partial<LabelSpec> = {}): LabelSpec => ({ template, ...o });
const B = (style: BoxStyle, board: Board, finish: BoxFinish, foil: Foil, o: Partial<BoxSpec> = {}): BoxSpec => ({ style, board, finish, foil, frame: foil !== "none", ...o });
const K = (id: string, group: KitGroup, ar: string, en: string, nAr: string, nEn: string, bottle: string, cap: string, glass: string, capFinish: string, liquid: string, label: LabelSpec | null, box: BoxSpec | null, brand: string, scent: string, spec?: Partial<BottleSpec>): Kit => ({ id, group, name: { ar, en }, note: { ar: nAr, en: nEn }, bottle: `B-${bottle}`, cap: cap ? `C-${cap}` : "", glass, capFinish, liquid, label, box, brand, scent, spec });

export const KITS: Kit[] = [
  // ── كلاسيكي
  K("classic-gold", "classic", "الكلاسيكي الذهبي", "Classic gold", "أسطوانة شفافة وملصق أسود بفويل ذهبي في علبة بلسان", "Clear cylinder, black-and-gold label, tuck carton", "ATLAS", "CYL", "clear", "gold", "amber", L("luxury"), B("tuck", "black", "soft", "gold"), "دار نور", "عود الليل"),
  K("classic-ivory", "classic", "عاجي فرنسي", "French ivory", "مربع مسطّح بملصق مقوّس كريمي وعلبة كريمية", "Flat square, cream arched label, cream carton", "NOOR", "CUBE", "clear", "gold", "amber", L("classic"), B("tuck", "cream", "matte", "gold"), "ميزون", "زهر الليمون"),
  K("classic-royal", "classic", "ملكي أخضر", "Royal green", "برج مربع بنجمة أندلسية في علبة مغناطيسية", "Square tower with an Andalusian star in a magnetic box", "TOWER", "PYR", "clear", "gold", "amber", L("andalus"), B("magnetic", "custom", "soft", "gold", { color: "#0f3b2e" }), "قصر", "عنبر ملكي"),
  K("classic-pearl", "classic", "لؤلؤي فضي", "Pearl silver", "بيضاوي مطفأ بملصق بسيط وعلبة صلبة بيضاء", "Frosted oval, minimal label, white rigid box", "BAHR", "DOME", "frosted", "silver", "clear", L("minimal"), B("rigid", "white", "soft", "silver"), "لؤلؤ", "مسك أبيض"),
  K("classic-bordeaux", "classic", "عنّابي دافئ", "Warm bordeaux", "عمود كهرماني بميدالية نحاسية وعلبة تلسكوبية", "Amber pillar, copper medallion, telescope box", "PILLAR", "TALL", "amber", "gold", "oud", L("emerald", { color: "#5a1f2b" }), B("telescope", "custom", "soft", "gold", { color: "#5a1f2b" }), "ياقوت", "ورد وعود"),
  K("classic-mono", "classic", "أبيض وأسود", "Black & white", "مكعّب بملصق أسود صريح وعلبة بيضاء بلا فويل", "A cube with a plain black label and a white carton, no foil", "CUBE", "CUBE", "clear", "black", "clear", L("mono"), B("tuck", "white", "matte", "none"), "MONO", "N°1"),
  // ── عود وتراث
  K("oud-tola", "oud", "تولة دهن العود", "Oud tola", "تولة 12 مل بسدادة ذهبية في علبة مغناطيسية ببطانة ساتان", "A 12 ml tola with a gold stopper in a satin-lined magnetic box", "ATTAR", "STOP", "amber", "gold", "oud", L("calligraphy", { conc: "عطر زيتي" }), B("magnetic", "black", "soft", "gold", { extras: ["insert_satin"] }), "دار العود", "كمبودي معتّق", { pump: "none" }),
  K("oud-majlis", "oud", "مجلس", "Majlis", "كرة شفافة بعود داكن في علبة سداسية سوداء", "A clear sphere of dark oud in a black hexagonal box", "SPHERE", "BALL", "clear", "gold", "oud", L("andalus"), B("hexagon", "black", "soft", "gold"), "مجلس", "بخور الدار"),
  K("oud-royal", "oud", "عود ملكي", "Royal oud", "مربع أسود مطلي بهرم ذهبي وعلبة بكتف وغطاء مغناطيسي", "Lacquered black square, gold pyramid cap, neck-and-magnet box", "NOOR", "PYR", "black", "gold", "none", L("luxury"), B("neckMagnetic", "black", "soft", "gold", { effects: ["emboss"] }), "السلطان", "عود ملكي"),
  K("oud-heritage", "oud", "تراث نجدي", "Najdi heritage", "قارورة كروية كهرمانية بملصق عربي كلاسيكي", "A squat amber bottle with a classic Arabic label", "QAHWA", "DOME", "amber", "brushed-gold", "oud", L("classic"), B("tuck", "cream", "matte", "gold"), "نجد", "هيل وزعفران"),
  K("oud-mukhallat", "oud", "مخلّط شرقي", "Oriental mukhallat", "مخروط مدخّن بسدادة كروية وعلبة ثمانية الأوجه", "A smoked cone with a ball stopper in an octagonal box", "DROP", "STOP", "smoke", "gold", "oud", L("andalus", { color: "#3d1420" }), B("octagon", "custom", "soft", "gold", { color: "#3d1420" }), "مخلّط", "ليالي الشرق", { pump: "none" }),
  K("oud-trio", "oud", "ثلاثي دهن العود", "Oud oil trio", "ثلاث تولات في طقم اكتشاف صلب", "Three tolas in a rigid discovery set", "ATTAR", "MINI", "clear", "gold", "oud", L("calligraphy", { conc: "عطر زيتي" }), B("discovery", "black", "soft", "gold"), "دار العود", "مجموعة العود", { pump: "rollon" }),
  // ── نيش وصيدلية
  K("niche-apothecary", "niche", "الصيدلية", "The apothecary", "كتف مائل بملصق تذكرة قطني وعلبة صلبة بورق ملمس", "Sloped shoulder, cotton ticket label, textured rigid box", "APOTH", "CYL", "clear", "black", "amber", L("apothecary"), B("rigid", "cream", "matte", "none", { effects: ["textured_wrap"] }), "OFFICINE", "Elixir 04"),
  K("niche-lab", "niche", "المختبر", "The lab", "أسطوانة نحيلة بشبكة سويسرية في تيوب أبيض", "A slim cylinder with a Swiss grid in a white tube", "SLIM", "TALL", "clear", "black", "clear", L("swiss"), B("tube", "white", "matte", "none"), "LAB", "Molecule 02"),
  K("niche-editorial", "niche", "تحريري", "Editorial", "عمود عريض بملصق مجلّة وعلبة بكتف", "A wide pillar with a magazine-style label in a shoulder box", "PILLAR", "DISC", "clear", "black", "amber", L("editorial"), B("shoulder", "white", "matte", "none"), "ATELIER", "No. 01"),
  K("niche-amber", "niche", "كهرمان العطّار", "Perfumer's amber", "زجاج كهرماني بسدادة وعلبة درج كرافت", "Amber glass with a stopper in a kraft drawer box", "APOTH", "STOP", "amber", "black", "amber", L("apothecary"), B("drawer", "kraft", "matte", "none"), "العطّار", "تبغ وفانيلا", { pump: "none" }),
  K("niche-numbered", "niche", "مرقّم", "Numbered", "مكعّب مدخّن بقرص فضي في علبة صدفية", "A smoked cube with a silver disc in a clamshell box", "CUBE", "DISC", "smoke", "silver", "clear", L("editorial"), B("clamshell", "black", "soft", "silver"), "NUMÉRO", "No. 07"),
  K("niche-white", "niche", "أبيض خزفي", "Ceramic white", "كرة بيضاء حليبية بغطاء خزفي وعلبة بيضاء", "An opal sphere with a ceramic cap in a white box", "SPHERE", "BALL", "white", "ceramic", "none", L("minimal"), B("rigid", "white", "soft", "none"), "BLANC", "مسك القطن"),
  // ── نسائي
  K("women-rose", "women", "وردي ناعم", "Soft rose", "كرة شفافة بعطر وردي وعلبة صلبة بلون البشرة", "A clear sphere of rose scent in a blush rigid box", "SPHERE", "BALL", "clear", "gold", "rose", L("linen", { color: "#f6d9d6" }), B("rigid", "custom", "soft", "gold", { color: "#f1cfcb" }), "روز", "ورد الطائف"),
  K("women-pearl", "women", "لؤلؤة", "Pearl", "قارورة مطفأة صغيرة بغطاء خزفي وعلبة بيضاء ببروز", "A small frosted bottle with a ceramic cap in an embossed white carton", "QAHWA", "DOME", "frosted", "ceramic", "rose", L("minimal"), B("tuck", "white", "soft", "gold", { effects: ["emboss"] }), "لؤلؤة", "فل وياسمين"),
  K("women-jasmine", "women", "ياسمين", "Jasmine", "بيضاوي طويل بملصق كتّان وعلبة بنافذة", "A tall oval with a linen label in a window carton", "BAHR", "DOME", "clear", "gold", "clear", L("linen"), B("window", "cream", "matte", "gold"), "ياسمين", "ياسمين الشام"),
  K("women-blush", "women", "خوخي", "Blush", "مخروط مطفأ بكرة ذهبية وعلبة سداسية", "A frosted cone with a gold ball in a hexagonal box", "DROP", "BALL", "frosted", "brushed-gold", "rose", L("emerald", { color: "#b8576a" }), B("hexagon", "custom", "soft", "gold", { color: "#e9b9b4" }), "بلاش", "خوخ ومسك"),
  K("women-velvet", "women", "مخمل", "Velvet", "مسطّح قصير بملصق أرجواني وعلبة بكتف", "A short flat bottle with a plum label in a shoulder box", "HIP", "DISC", "clear", "gold", "rose", L("luxury", { color: "#4a1f3d" }), B("shoulder", "custom", "soft", "gold", { color: "#4a1f3d" }), "مخمل", "توت وباتشولي"),
  K("women-lilac", "women", "ليلكي", "Lilac", "أسطوانة نحيلة مطفأة في تيوب ليلكي", "A slim frosted cylinder in a lilac tube", "SLIM", "TALL", "frosted", "silver", "clear", L("minimal", { color: "#e3d8ee" }), B("tube", "custom", "matte", "silver", { color: "#cdbde0" }), "ليلك", "خزامى"),
  // ── رجالي
  K("men-noir", "men", "نوار", "Noir", "برج أسود مطلي بدرع فضي وعلبة صلبة سوداء", "A lacquered black tower with a silver shield in a black rigid box", "TOWER", "CUBE", "black", "black", "none", L("noir"), B("rigid", "black", "soft", "silver"), "NOIR", "جلد وعنبر"),
  K("men-steel", "men", "فولاذي", "Steel", "فلاسك مدخّن بغطاء فضي وعلبة رمادية", "A smoked flask with a silver cap in a graphite carton", "FLASK", "CYL", "smoke", "silver", "clear", L("mono"), B("tuck", "custom", "matte", "silver", { color: "#3a3d42" }), "STEEL", "فيتيفر"),
  K("men-sport", "men", "رياضي", "Sport", "مسطّح بحري بملصق كحلي وعلبة لامعة", "An aqua flat bottle with a navy label in a gloss carton", "HIP", "CYL", "aqua", "black", "clear", L("modern", { color: "#17355c" }), B("ste", "white", "gloss", "none"), "SPORT", "نعناع بحري"),
  K("men-leather", "men", "جلد وخشب", "Leather & wood", "عمود كهرماني بغطاء خشبي وعلبة بنية", "An amber pillar with a wooden cap in a brown box", "PILLAR", "TALL", "amber", "wood", "amber", L("apothecary"), B("telescope", "custom", "matte", "none", { color: "#5b3a23" }), "جلد", "تبغ وجلد"),
  K("men-navy", "men", "كحلي", "Navy", "أسطوانة شفافة بغطاء فضي وعلبة درج كحلية", "A clear cylinder with a silver cap in a navy drawer box", "ATLAS", "CYL", "clear", "silver", "clear", L("swiss"), B("drawer", "custom", "matte", "silver", { color: "#17355c" }), "NAVY", "أرز وبرغموت"),
  K("men-carbon", "men", "كربون", "Carbon", "مكعّب مدخّن بهرم أسود في علبة مغناطيسية", "A smoked cube with a black pyramid in a magnetic box", "CUBE", "PYR", "smoke", "black", "clear", L("noir"), B("magnetic", "black", "soft", "silver"), "CARBON", "فلفل أسود"),
  // ── عصري وشبابي
  K("modern-coral", "modern", "مرجاني", "Coral", "أسطوانة بغطاء أبيض وملصق كبسولة مرجاني", "A cylinder with a white cap and a coral pill label", "ATLAS", "CYL", "clear", "ceramic", "clear", L("coral"), B("tuck", "custom", "gloss", "none", { color: "#e4612e" }), "كورال", "مانجو وملح"),
  K("modern-bold", "modern", "جريء", "Bold", "مكعّب بسائل أخضر وملصق برتقالي في غلاف", "A cube of green scent with an orange label in a sleeve", "CUBE", "CUBE", "clear", "black", "green", L("modern"), B("sleeve", "white", "matte", "none"), "BOLD", "ريحان وليمون"),
  K("modern-blue", "modern", "أزرق كهربائي", "Electric blue", "أسطوانة نحيلة بملصق أزرق وعلبة زرقاء لامعة", "A slim cylinder with a blue label in a gloss blue carton", "SLIM", "TALL", "clear", "black", "clear", L("modern", { color: "#1f4bd8" }), B("ste", "custom", "gloss", "none", { color: "#1f4bd8" }), "VOLT", "جريب فروت"),
  K("modern-mono", "modern", "أبيض كامل", "All white", "عمود أبيض حليبي بقرص خزفي وعلبة سوداء", "An opal pillar with a ceramic disc in a black carton", "PILLAR", "DISC", "white", "ceramic", "none", L("mono"), B("tuck", "black", "matte", "none"), "ZERO", "صابون نظيف"),
  K("modern-swiss", "modern", "شبكي", "Grid", "مربع صغير بملصق سويسري وقاعدة قفل ذاتي", "A small square with a Swiss label on a crash-lock base", "SQ30", "CUBE", "clear", "silver", "clear", L("swiss"), B("crash", "white", "matte", "none"), "GRID", "شاي أخضر"),
  K("modern-duo", "modern", "طبقتان", "Two layers", "مسطّح بحري بملصق تحريري وعلبة داخل غلاف", "An aqua flat bottle with an editorial label, box in a sleeve", "HIP", "CYL", "aqua", "silver", "clear", L("editorial"), B("bookSleeve", "white", "matte", "none"), "LAYER", "ندى البحر"),
  // ── طبيعي ومستدام
  K("natural-kraft", "natural", "كرافت طبيعي", "Natural kraft", "أسطوانة بغطاء خشبي وملصق كرافت بيضاوي", "A cylinder with a wooden cap and an oval kraft label", "ATLAS", "CYL", "clear", "wood", "green", L("botanical"), B("tuck", "kraft", "matte", "none"), "ورق", "حبق وزيتون"),
  K("natural-linen", "natural", "كتّان", "Linen", "كتف مائل مطفأ بغطاء خشبي في تيوب كرافت", "A frosted sloped shoulder with a wooden cap in a kraft tube", "APOTH", "DOME", "frosted", "wood", "clear", L("linen"), B("tube", "kraft", "matte", "none"), "كتّان", "قطن وخزامى"),
  K("natural-apoth", "natural", "عشّاب", "Herbalist", "أسطوانة نحيلة كهرمانية بسدادة خشبية وعلبة درج", "A slim amber cylinder with a wooden stopper in a drawer box", "SLIM", "STOP", "amber", "wood", "amber", L("apothecary"), B("drawer", "kraft", "matte", "none"), "عشّاب", "مرّ ولبان", { pump: "dropper" }),
  K("natural-garden", "natural", "حديقة", "Garden", "قارورة كروية بكرة خشبية وعلبة كرافت بنافذة", "A squat bottle with a wooden ball in a kraft window carton", "QAHWA", "BALL", "clear", "wood", "green", L("linen", { color: "#dfe6d2" }), B("window", "kraft", "matte", "none"), "حديقة", "تين وأوراق"),
  K("natural-refill", "natural", "قابل لإعادة التعبئة", "Refillable", "عمود بمضخة لولبية وحشوة ورق مقولب بلا بلاستيك", "A pillar with a screw pump and a moulded-pulp insert, plastic-free", "PILLAR", "DISC", "clear", "wood", "clear", L("botanical"), B("rigid", "kraft", "matte", "none", { extras: ["insert_pulp"] }), "دورة", "خشب الأرز"),
  K("natural-clay", "natural", "طيني", "Clay", "بيضاوي مطفأ بغطاء خزفي وعلبة كريمية", "A frosted oval with a ceramic cap in a cream carton", "BAHR", "DOME", "frosted", "ceramic", "amber", L("apothecary"), B("tuck", "cream", "matte", "none"), "طين", "صندل وهيل"),
  // ── هدايا ومواسم
  K("gift-ramadan", "gift", "هدية رمضان", "Ramadan gift", "مربع مسطّح بنجمة ذهبية في علبة مغناطيسية زمردية بشريط", "A flat square with a gold star in an emerald magnetic box with a ribbon", "NOOR", "PYR", "clear", "gold", "amber", L("andalus"), B("magnetic", "custom", "soft", "gold", { color: "#0f3b2e", extras: ["insert_satin", "ribbon"] }), "هلال", "ليالي رمضان"),
  K("gift-eid", "gift", "عيدية", "Eidiya", "كرة وردية في علبة بسقف جملوني ومقبض", "A rose sphere in a gable-top box with a handle", "SPHERE", "BALL", "clear", "gold", "rose", L("classic"), B("gable", "cream", "matte", "gold"), "عيدية", "فرحة العيد"),
  K("gift-wedding", "gift", "عرس", "Wedding", "مخروط مطفأ بسدادة خزفية وعلبة بيضاء بشريط ساتان", "A frosted cone with a ceramic stopper in a white box with a satin ribbon", "DROP", "STOP", "frosted", "ceramic", "clear", L("minimal"), B("rigid", "white", "soft", "gold", { extras: ["insert_satin", "ribbon"] }), "فرح", "زهر البرتقال", { pump: "none" }),
  K("gift-national", "gift", "اليوم الوطني", "National Day", "برج بسائل أخضر ونجمة ذهبية في علبة خضراء", "A tower of green scent with a gold star in a green box", "TOWER", "CUBE", "clear", "gold", "green", L("andalus", { color: "#0b5d3b" }), B("telescope", "custom", "soft", "gold", { color: "#0b5d3b" }), "وطن", "همّة"),
  K("gift-book", "gift", "علبة كتاب", "Book box", "مكعّب بفويل ذهبي في علبة صدفية تُفتح كالكتاب", "A cube with gold foil in a clamshell that opens like a book", "CUBE", "CUBE", "clear", "gold", "amber", L("luxury"), B("clamshell", "black", "soft", "gold"), "حكاية", "الفصل الأول"),
  K("gift-cube", "gift", "مكعّب هدية", "Gift cube", "قارورة صغيرة في مكعّب كريمي بفويل", "A small bottle in a cream gift cube with foil", "QAHWA", "DOME", "clear", "gold", "amber", L("classic"), B("cube", "cream", "matte", "gold"), "هدية", "عسل وزهر"),
  // ── سفر وعينات
  K("travel-atomiser", "travel", "بخاخ الجيب", "Pocket atomiser", "بخاخ 10 مل في علبة تعليق للرف", "A 10 ml atomiser in a hang-tab carton", "TRAVEL", "MINI", "clear", "silver", "clear", L("minimal"), B("hang", "white", "matte", "none"), "GO", "برغموت"),
  K("travel-trio", "travel", "ثلاثي السفر", "Travel trio", "ثلاثة بخاخات في طقم اكتشاف صلب", "Three atomisers in a rigid discovery set", "TRAVEL", "MINI", "clear", "gold", "amber", L("luxury"), B("discovery", "black", "soft", "gold"), "دار نور", "مجموعة السفر"),
  K("travel-rollon", "travel", "رول أون", "Roll-on", "تولة برول أون في علبة صغيرة كريمية", "A roll-on tola in a small cream carton", "ATTAR", "MINI", "clear", "gold", "amber", L("calligraphy", { conc: "عطر زيتي" }), B("tuck", "cream", "matte", "gold"), "مسك", "مسك الطهارة", { pump: "rollon" }),
  K("sample-vial", "travel", "قارورة عيّنة", "Sample vial", "عيّنة 5 مل في غلاف أسود", "A 5 ml sample in a black sleeve", "MINI", "MINI", "clear", "black", "amber", L("mono"), B("sleeve", "black", "matte", "none"), "SAMPLE", "N°3"),
  K("discovery-set", "travel", "طقم اكتشاف", "Discovery set", "قوارير مرقّمة في علبة درج بيضاء", "Numbered vials in a white drawer box", "MINI", "MINI", "clear", "silver", "clear", L("editorial"), B("drawer", "white", "matte", "none"), "DISCOVERY", "No. 01"),
  K("travel-tube", "travel", "تيوب السفر", "Travel tube", "بخاخ مدخّن في تيوب أسود", "A smoked atomiser in a black tube", "TRAVEL", "MINI", "smoke", "black", "clear", L("mono"), B("tube", "black", "matte", "none"), "TUBE", "دخان وخشب"),
  // ── شركات وفنادق
  K("corp-hotel", "corporate", "ضيافة فندقية", "Hotel amenity", "مربع 30 مل بملصق بسيط وغلاف بشعار الفندق", "A 30 ml square with a minimal label in a logo sleeve", "SQ30", "CYL", "clear", "silver", "clear", L("minimal"), B("sleeve", "white", "matte", "silver"), "HOTEL", "Signature"),
  K("corp-gift", "corporate", "هدية الشركة", "Company gift", "مكعّب بغطاء فضي وعلبة صلبة بلون الجهة", "A cube with a silver cap in a rigid box in the company colour", "CUBE", "CUBE", "clear", "silver", "clear", L("swiss"), B("rigid", "custom", "soft", "silver", { color: "#17355c" }), "شركتكم", "هدية التقدير"),
  K("corp-event", "corporate", "مناسبة", "Event", "أسطوانة بملصق تحريري وعلبة بيضاء بفويل", "A cylinder with an editorial label in a white foil carton", "ATLAS", "CYL", "clear", "gold", "amber", L("editorial"), B("tuck", "white", "matte", "gold"), "EVENT", "2026"),
  K("corp-vip", "corporate", "كبار الشخصيات", "VIP", "مربع مسطّح بفويل ذهبي وعلبة بكتف ومغناطيس", "A flat square with gold foil in a neck-and-magnet box", "NOOR", "CUBE", "clear", "gold", "amber", L("luxury"), B("neckMagnetic", "custom", "soft", "gold", { color: "#17355c" }), "VIP", "إهداء خاص"),
  K("corp-welcome", "corporate", "ترحيب", "Welcome", "أسطوانة نحيلة مطفأة في علبة درج بيضاء", "A slim frosted cylinder in a white drawer box", "SLIM", "TALL", "frosted", "silver", "clear", L("minimal"), B("drawer", "white", "matte", "none"), "WELCOME", "أهلاً"),
  K("corp-airline", "corporate", "طيران وسفر", "Airline", "بخاخ 10 مل بملصق شبكي وعلبة تعليق", "A 10 ml atomiser with a grid label in a hang-tab carton", "TRAVEL", "MINI", "clear", "silver", "clear", L("swiss"), B("hang", "white", "matte", "none"), "AIR", "On board"),
  // ── بداية اقتصادية
  K("start-30", "starter", "بداية 30 مل", "Starter 30 ml", "مربع صغير بملصق بسيط وعلبة بيضاء: أقل تكلفة ممكنة", "A small square, minimal label, white carton: the lowest possible cost", "SQ30", "CYL", "clear", "black", "amber", L("minimal"), B("ste", "white", "matte", "none"), "براندك", "العطر الأول"),
  K("start-50", "starter", "بداية 50 مل", "Starter 50 ml", "أسطوانة بغطاء فضي وملصق أسود وعلبة بيضاء", "A cylinder with a silver cap, black label and white carton", "ATLAS", "CYL", "clear", "silver", "clear", L("mono"), B("tuck", "white", "matte", "none"), "براندك", "العطر الأول"),
  K("start-kraft", "starter", "بداية كرافت", "Starter kraft", "قارورة صغيرة بملصق كرافت وعلبة كرافت", "A small bottle with a kraft label in a kraft carton", "QAHWA", "CYL", "clear", "black", "amber", L("botanical"), B("tuck", "kraft", "matte", "none"), "براندك", "العطر الأول"),
  K("start-black", "starter", "بداية سوداء", "Starter black", "مربع صغير بغطاء أسود وعلبة سوداء بلا فويل", "A small square with a black cap in a black carton, no foil", "SQ30", "CUBE", "clear", "black", "clear", L("mono"), B("tuck", "black", "matte", "none"), "براندك", "العطر الأول"),
  K("start-100", "starter", "بداية 100 مل", "Starter 100 ml", "عمود بغطاء ذهبي وقاعدة قفل ذاتي للتعبئة السريعة", "A pillar with a gold cap on a crash-lock base for fast packing", "PILLAR", "CYL", "clear", "gold", "amber", L("classic"), B("crash", "cream", "matte", "none"), "براندك", "العطر الأول"),
  K("start-pocket", "starter", "بداية للجيب", "Starter pocket", "مسطّح قصير بملصق شبكي وعلبة بألسنة غراء", "A short flat bottle with a grid label in a seal-end carton", "HIP", "CYL", "clear", "black", "clear", L("swiss"), B("sealEnd", "white", "matte", "none"), "براندك", "العطر الأول"),
  // ── إصدارات محدودة
  K("ltd-numbered", "limited", "مرقّم يدوياً", "Hand-numbered", "بيضاوي مدخّن بسدادة فضية في علبة صدفية مع شهادة", "A smoked oval with a silver stopper in a clamshell with a certificate", "BAHR", "STOP", "smoke", "silver", "clear", L("editorial"), B("clamshell", "black", "soft", "silver", { extras: ["insert_eva", "authenticity"] }), "ÉDITION", "No. 001 / 500", { pump: "none" }),
  K("ltd-crystal", "limited", "كريستال", "Crystal", "كرة شفافة بسدادة ذهبية وعلبة بكتف ومغناطيس ببروز", "A clear sphere with a gold stopper in an embossed neck-and-magnet box", "SPHERE", "STOP", "clear", "gold", "amber", L("andalus"), B("neckMagnetic", "black", "soft", "gold", { effects: ["emboss"] }), "كريستال", "الإصدار الذهبي", { pump: "none" }),
  K("ltd-artist", "limited", "تعاون فني", "Artist collab", "مكعّب أبيض حليبي بملصق مرجاني في درج صلب", "An opal cube with a coral label in a rigid drawer", "CUBE", "DISC", "white", "ceramic", "none", L("coral"), B("rigidDrawer", "white", "soft", "none"), "ARTIST", "Edition 01"),
  K("ltd-night", "limited", "ليلة واحدة", "One night", "برج أسود بهرم أسود وعلبة بكتف سوداء بفويل", "A black tower with a black pyramid in a black shoulder box with foil", "TOWER", "PYR", "black", "black", "none", L("luxury"), B("shoulder", "black", "soft", "gold"), "MINUIT", "Nuit Unique"),
  K("ltd-collector", "limited", "للمقتنين", "Collector", "مخروط كهرماني بميدالية نحاسية وعلبة خماسية", "An amber cone with a copper medallion in a pentagonal box", "DROP", "BALL", "amber", "gold", "amber", L("emerald"), B("pentagon", "custom", "soft", "copper", { color: "#123d33" }), "مقتنيات", "الإصدار الخامس"),
  K("ltd-duo", "limited", "ثنائي العطر ودهنه", "Perfume & oil duo", "كتف مائل بدرع فضي في درج مزدوج للعطر ودهنه", "A sloped shoulder with a silver shield in a double drawer for perfume and oil", "APOTH", "CYL", "clear", "gold", "amber", L("noir"), B("doubleDrawer", "black", "soft", "silver"), "DUO", "عطر ودهن"),
];

export const kitById = (id?: string | null) => KITS.find((k) => k.id === id) ?? null;

export interface AppliedKit {
  /** معاملات الرابط في الاستوديو (b, c, g, cf, l, f + مواصفة التصنيع) */
  params: Record<string, string>;
  label: LabelDesign | null;
  box: BoxDesign | null;
  bottle: PackModel;
  cap: PackModel | null;
}

/** العبوة المطلوبة، أو أقرب عبوة سعةً إن لم تكن في الكتالوج (كتالوج الإدارة قد يختلف عن البذرة) */
export function resolveBottle(kit: Kit, bottles: PackModel[], seedCapacity?: number): PackModel | null {
  const exact = bottles.find((b) => b.id === kit.bottle);
  if (exact) return exact;
  const want = seedCapacity ?? 50;
  return [...bottles].filter((b) => b.source !== "ai").sort((a, b) => Math.abs((a.capacityMl ?? 50) - want) - Math.abs((b.capacityMl ?? 50) - want))[0] ?? null;
}

const SPEC_PARAM: Record<keyof BottleSpec, string> = { cap: "cm", pump: "pm", deco: "dc", mould: "md", weight: "wt" };

/** يحوّل الطقم إلى حالة استوديو كاملة على الكتالوج المتاح، ثم يمرّرها على قواعد التوافق */
export function applyKit(kit: Kit, models: PackModel[], qty = 1000): AppliedKit | null {
  const bottles = models.filter((m) => m.kind === "bottle");
  const caps = models.filter((m) => m.kind === "cap");
  const bottle = resolveBottle(kit, bottles);
  if (!bottle) return null;
  const cap = kit.cap ? caps.find((c) => c.id === kit.cap) ?? bestCap(bottle, caps) : null;
  const spec: BottleSpec = { ...DEFAULT_BOTTLE_SPEC, ...kit.spec };
  const ml = bottle.capacityMl ?? 50;
  let label: LabelDesign | null = null;
  if (kit.label && bottle.source !== "ai") {
    const base = makeTemplate(kit.label.template, bottle, kit.brand, kit.scent);
    const arabicDetails = kit.label.conc && /[؀-ۿ]/.test(kit.label.conc);
    const details = arabicDetails ? `${kit.label.conc} · ${ml} مل` : `${kit.label.conc ?? "EAU DE PARFUM"} · ${ml} ML`;
    label = {
      ...base,
      ...(kit.label.color ? { paper: "custom" as const, customColor: kit.label.color } : kit.label.paper ? { paper: kit.label.paper } : {}),
      ...(kit.label.material ? { material: kit.label.material } : {}),
      texts: base.texts.map((t) => (t.id === "details" ? { ...t, text: details } : t)),
    };
  }
  const fit = productFit(bottle, cap)!;
  let box: BoxDesign | null = null;
  if (kit.box) {
    const b = kit.box;
    const extras = cleanExtras([...(b.extras ?? []), ...(WRAPPED.includes(b.style) && !(b.extras ?? []).some((x) => x.startsWith("insert_")) ? ["insert_eva"] : [])]);
    box = {
      ...defaultBox(fit),
      style: b.style,
      ...fitFor(b.style, fit),
      board: b.board,
      customColor: b.color ?? "#3b2f2a",
      finish: b.finish,
      foil: b.foil,
      frame: b.frame ?? b.foil !== "none",
      font: b.font ?? (label?.texts[0]?.font ?? "playfair"),
      brand: kit.brand,
      name: kit.scent,
      details: label?.texts.find((t) => t.id === "details")?.text ?? `Eau de Parfum · ${ml} ml`,
      qty,
      extras,
      effects: b.effects ?? [],
      autoFit: true,
      structure: null,
    };
  }
  // ما بقي من ملاحظات (نص صغير على عبوة صغيرة مثلاً) يُصلَح تلقائياً قبل أن يراه العميل
  const fixed = autoFixAll({ bottle, cap, caps, glass: kit.glass, spec, label, box, qty });
  const params: Record<string, string> = { b: bottle.id, c: fixed.input.cap?.id ?? "", g: kit.glass, cf: kit.capFinish, l: kit.liquid, f: "" };
  for (const k of Object.keys(SPEC_PARAM) as (keyof BottleSpec)[]) params[SPEC_PARAM[k]] = fixed.input.spec[k] === DEFAULT_BOTTLE_SPEC[k] ? "" : String(fixed.input.spec[k]);
  return { params, label: fixed.input.label, box: fixed.input.box, bottle, cap: fixed.input.cap };
}

/** مستوى التكلفة التقريبي للتغليف: 1 اقتصادي، 2 متوسط، 3 فاخر */
export function kitTier(kit: Kit): 1 | 2 | 3 {
  if (!kit.box) return 1;
  const fam = styleById(kit.box.style).family;
  if (fam === "rigid") return 3;
  if (fam === "tube" || styleById(kit.box.style).group === "slide" || kit.box.foil !== "none" || (kit.box.effects?.length ?? 0) > 0) return 2;
  return 1;
}
