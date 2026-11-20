import type { Bi } from "@/i18n/context";

// قسم التعليم: دروس قصيرة مرتبطة بالخدمات (المسارات A–F)، تشرح للعميل ما سيقرره في كل مرحلة ولماذا.
// الأرقام تقريبية ومعروفة في الصناعة، والاشتراطات النظامية تُراجع من مصدرها قبل الاعتماد.

export type TrackId = "A" | "B" | "C" | "D" | "E" | "F";
export interface LessonSection {
  h: Bi;
  body?: Bi;
  points?: Bi[];
}
export interface Lesson {
  slug: string;
  icon: string;
  title: Bi;
  summary: Bi;
  minutes: number;
  /** الخدمات التي يخدمها الدرس */
  tracks: TrackId[];
  /** أين يطبّق العميل ما تعلّمه */
  apply: { label: Bi; to: string };
  sections: LessonSection[];
  takeaway: Bi;
}

export const LESSONS: Lesson[] = [
  {
    slug: "fragrance-pyramid",
    icon: "ri-triangle-line",
    title: { ar: "هرم العطر: القمة والقلب والقاعدة", en: "The fragrance pyramid: top, heart and base" },
    summary: { ar: "لماذا تتغير رائحة العطر بعد ساعة، وكيف تصف ما تريده للعطّار بلغة يفهمها.", en: "Why a scent changes after an hour, and how to describe what you want in the perfumer's language." },
    minutes: 4,
    tracks: ["A", "B"],
    apply: { label: { ar: "ابدأ تطوير عطرك", en: "Start developing your scent" }, to: "/start/B" },
    sections: [
      { h: { ar: "ثلاث طبقات تتبخر بسرعات مختلفة", en: "Three layers that evaporate at different speeds" }, points: [
        { ar: "القمة: أول ما تشمه، حمضيات وأعشاب خفيفة، وتخف خلال دقائق إلى نصف ساعة.", en: "Top: the first impression, citrus and light herbs, fading within minutes to half an hour." },
        { ar: "القلب: شخصية العطر، زهور وتوابل وفواكه، ويستمر ساعات.", en: "Heart: the character, florals, spices and fruits, lasting for hours." },
        { ar: "القاعدة: ما يبقى على الجلد والقماش، أخشاب وعود وعنبر ومسك.", en: "Base: what stays on skin and fabric, woods, oud, amber and musk." },
      ] },
      { h: { ar: "كيف تصف ما تريد", en: "How to describe what you want" }, points: [
        { ar: "اذكر عطرًا تحبه وآخر لا تحبه: المقارنة أوضح من الأوصاف العامة.", en: "Name a scent you love and one you dislike: comparison beats general adjectives." },
        { ar: "حدّد المناسبة والموسم والجمهور: عطر صيفي يومي يختلف عن عطر مسائي للإهداء.", en: "State the occasion, season and audience: a daily summer scent differs from an evening gift scent." },
        { ar: "قل ما يزعجك بدقة: حلو أكثر من اللازم، حاد في البداية، يختفي سريعًا.", en: "Say exactly what bothers you: too sweet, sharp at the opening, gone too quickly." },
      ] },
      { h: { ar: "خطأ شائع", en: "A common mistake" }, body: { ar: "الحكم على العطر من أول رشة على الورق. القمة تخدعك؛ انتظر القلب والقاعدة على بشرتك قبل أن تقرر.", en: "Judging from the first spray on paper. The top misleads; wait for heart and base on your skin before deciding." } },
    ],
    takeaway: { ar: "قيّم العطر على ثلاث محطات: بعد دقيقة، بعد ساعة، وبعد ست ساعات.", en: "Judge a scent at three checkpoints: after a minute, an hour and six hours." },
  },
  {
    slug: "concentrations",
    icon: "ri-drop-line",
    title: { ar: "التراكيز: من الكولونيا إلى الإكسترا", en: "Concentrations: from cologne to extrait" },
    summary: { ar: "ما الفرق بين EDT و EDP والإكسترا، وكيف يؤثر التركيز في السعر والثبات.", en: "What separates EDT, EDP and extrait, and how concentration moves price and longevity." },
    minutes: 3,
    tracks: ["A", "B", "E"],
    apply: { label: { ar: "احسب تكلفة تركيزك في الاستوديو", en: "Price your concentration in the studio" }, to: "/studio-3d" },
    sections: [
      { h: { ar: "النسب المتعارف عليها", en: "The customary ranges" }, points: [
        { ar: "ماء الكولونيا: نحو 2 إلى 5٪ زيت عطري.", en: "Eau de Cologne: roughly 2–5% fragrance oil." },
        { ar: "ماء التواليت EDT: نحو 5 إلى 15٪.", en: "Eau de Toilette (EDT): roughly 5–15%." },
        { ar: "ماء العطر EDP: نحو 15 إلى 20٪.", en: "Eau de Parfum (EDP): roughly 15–20%." },
        { ar: "الإكسترا أو البارفان: نحو 20 إلى 40٪.", en: "Extrait or parfum: roughly 20–40%." },
      ] },
      { h: { ar: "ما الذي يتغير مع التركيز", en: "What changes with concentration" }, points: [
        { ar: "التكلفة: الزيت العطري أغلى مكوّن، فكل نقطة تركيز ترفع سعر الوحدة.", en: "Cost: the oil is the priciest ingredient, so every point of concentration lifts unit cost." },
        { ar: "الثبات والفوحان: التركيز الأعلى يطيل البقاء، لكنه لا يضمن فوحانًا أقوى.", en: "Longevity and projection: higher strength lasts longer but doesn't guarantee stronger projection." },
        { ar: "الملمس واللون: التراكيز العالية قد تترك أثرًا على الأقمشة الفاتحة.", en: "Feel and colour: high strengths can mark light fabrics." },
      ] },
      { h: { ar: "العطور الزيتية", en: "Oil-based perfumes" }, body: { ar: "العطر الزيتي بلا كحول، يُعبأ في رول أو قطارة، ويناسب السوق الخليجي والإهداء. ثباته عالٍ وفوحانه أهدأ.", en: "An oil perfume has no alcohol, fills into a roll-on or dropper, and suits the Gulf market and gifting. Long-lasting with a quieter trail." } },
    ],
    takeaway: { ar: "اختر التركيز من سعر البيع المستهدف، لا العكس.", en: "Pick the concentration from your target retail price, not the other way round." },
  },
  {
    slug: "reading-sample-sheet",
    icon: "ri-qr-code-line",
    title: { ar: "كيف تقرأ ورقة العينات وتقيّم كل عينة", en: "How to read the sample sheet and rate each sample" },
    summary: { ar: "كل عبوة بحرفها واسمها ومكوّناتها. امسح الرمز، ثم اقبل أو ارفض بالاسم.", en: "Every vial has its letter, name and ingredients. Scan the code, then accept or reject by name." },
    minutes: 3,
    tracks: ["A", "B"],
    apply: { label: { ar: "افتح عيناتي", en: "Open my samples" }, to: "/account/samples" },
    sections: [
      { h: { ar: "ما الذي في الورقة", en: "What the sheet holds" }, points: [
        { ar: "حرف العبوة واسم العينة كما كتبهما العطّار: الحرف على العبوة يطابق الحرف في الورقة.", en: "The vial letter and sample name as the perfumer wrote them: the vial letter matches the sheet." },
        { ar: "التركيز والحجم، ووصف قصير لما يميز العينة.", en: "Strength and size, with a short note on what sets the sample apart." },
        { ar: "المكوّنات وكمياتها، لتعرف ما الذي تغيّر بين عينة وأخرى.", en: "Ingredients and amounts, so you can see what changed from one sample to the next." },
        { ar: "رمز QR يفتح صفحتك مباشرة بلا تسجيل دخول.", en: "A QR code that opens your page directly, no sign-in." },
      ] },
      { h: { ar: "طريقة التقييم", en: "How to rate" }, points: [
        { ar: "جرّب عينة واحدة في اليوم على بشرة نظيفة، بلا عطر آخر.", en: "Try one sample a day on clean skin, with no other scent." },
        { ar: "سجّل انطباعك بعد دقيقة وساعة وست ساعات.", en: "Note your impression after a minute, an hour and six hours." },
        { ar: "في صفحتك: اختر «مقبولة» أو «مرفوضة» لكل اسم، واكتب السبب.", en: "On your page: choose Accept or Reject for each name and write why." },
      ] },
      { h: { ar: "قبل الشحن", en: "Before shipping" }, body: { ar: "أكّد عنوان التسليم وحدّد موقعك على الخريطة من الصفحة نفسها. بعد خروج الشحنة يُقفل العنوان.", en: "Confirm the delivery address and pin your location from the same page. Once the parcel leaves, the address locks." } },
    ],
    takeaway: { ar: "ملاحظة واضحة على عينة مرفوضة تختصر جولة كاملة.", en: "One clear note on a rejected sample saves a whole round." },
  },
  {
    slug: "sample-feedback",
    icon: "ri-chat-quote-line",
    title: { ar: "ملاحظة يفهمها العطّار: كيف ترفض عينة بذكاء", en: "Feedback a perfumer can act on" },
    summary: { ar: "«لم تعجبني» لا تكفي. ثلاث جمل تجعل الجولة التالية أقرب لما تريد.", en: "“I didn't like it” isn't enough. Three sentences that bring the next round closer." },
    minutes: 3,
    tracks: ["A", "B"],
    apply: { label: { ar: "قيّم عيناتك الآن", en: "Rate your samples now" }, to: "/account/samples" },
    sections: [
      { h: { ar: "قالب الملاحظة", en: "The feedback template" }, points: [
        { ar: "متى: في أي لحظة ظهر ما لا يعجبك؟ البداية، بعد ساعة، أم في النهاية.", en: "When: at what point did the issue appear? Opening, after an hour, or at the dry-down." },
        { ar: "ماذا: حلاوة زائدة، حدّة، دخان، ثقل، أو ضعف ثبات.", en: "What: too sweet, sharp, smoky, heavy, or weak longevity." },
        { ar: "إلى أين: أقرب إلى أي عينة أو عطر تعرفه؟", en: "Where to: closer to which sample or known scent?" },
      ] },
      { h: { ar: "أمثلة", en: "Examples" }, points: [
        { ar: "ضعيفة: «ثقيل».", en: "Weak: “Heavy.”" },
        { ar: "قوية: «العينة B ثقيلة بعد الساعة الأولى؛ أريد قاعدة A مع افتتاحية B».", en: "Strong: “Sample B gets heavy after the first hour; I want A's base with B's opening.”" },
      ] },
      { h: { ar: "كم جولة تحتاج", en: "How many rounds" }, body: { ar: "أغلب المشاريع تستقر خلال جولتين إلى ثلاث حين تكون الملاحظات محددة. كل جولة تعني تحضيرًا وشحنًا جديدين.", en: "Most projects settle within two to three rounds when feedback is specific. Each round means new preparation and shipping." } },
    ],
    takeaway: { ar: "قارن بين العينات بأسمائها؛ المقارنة أدق من الوصف.", en: "Compare samples by name; comparison is more precise than description." },
  },
  {
    slug: "bottle-and-cap",
    icon: "ri-flask-line",
    title: { ar: "العبوة والغطاء والمضخة: قرار واحد لا ثلاثة", en: "Bottle, cap and pump: one decision, not three" },
    summary: { ar: "العنق يحدد الغطاء والمضخة. تعلّم المقاسات قبل أن تختار الشكل.", en: "The neck dictates cap and pump. Learn the sizes before choosing a shape." },
    minutes: 4,
    tracks: ["A", "C"],
    apply: { label: { ar: "جرّب العبوات في الاستوديو", en: "Try bottles in the studio" }, to: "/studio-3d" },
    sections: [
      { h: { ar: "ما الذي يحكم التوافق", en: "What governs the fit" }, points: [
        { ar: "قطر العنق ونوعه: كبس أو لولبي. الأكثر تداولًا في العطور عنق الكبس 15 مم.", en: "Neck diameter and type: crimp or screw. The most common perfume neck is the 15 mm crimp." },
        { ar: "الغطاء يجب أن يغطي المضخة والطوق دون أن يرتخي أو يحتك بالكتف.", en: "The cap must cover pump and collar without wobbling or rubbing the shoulder." },
        { ar: "طول أنبوب المضخة يُقص على ارتفاع العبوة.", en: "The dip tube is cut to the bottle's height." },
      ] },
      { h: { ar: "الحجم يتبع الاستخدام", en: "Size follows use" }, points: [
        { ar: "30 مل وأقل: سفر وتجربة وهدايا.", en: "30 ml and under: travel, trial and gifting." },
        { ar: "50 مل: الأكثر مبيعًا للبراندات الجديدة.", en: "50 ml: the best seller for new brands." },
        { ar: "100 مل: قيمة أعلى وهامش أفضل، وشحن أثقل.", en: "100 ml: more value and margin, heavier to ship." },
      ] },
      { h: { ar: "قالب جاهز أم خاص", en: "Stock mould or custom" }, body: { ar: "القالب الجاهز يبدأ بكميات صغيرة ويُسلَّم أسرع. القالب الخاص يعطيك شكلًا لا يملكه غيرك، بكمية دنيا أعلى ومدة أطول.", en: "A stock mould starts at small quantities and ships sooner. A custom mould gives you a shape no one else has, at a higher minimum and longer lead time." } },
    ],
    takeaway: { ar: "ابدأ من العنق والحجم، ثم اختر الشكل.", en: "Start from neck and size, then choose the shape." },
  },
  {
    slug: "box-fit",
    icon: "ri-box-3-line",
    title: { ar: "العلبة على مقاس العبوة", en: "A box that fits the bottle" },
    summary: { ar: "خلوص المقاس، الحشوة، وسماكة الكرتون: ثلاثة أرقام تحمي المنتج وتضبط التكلفة.", en: "Clearance, insert and board weight: three numbers that protect the product and control cost." },
    minutes: 4,
    tracks: ["A", "C", "F"],
    apply: { label: { ar: "صمّم العلبة على عبوتك", en: "Design the box around your bottle" }, to: "/studio-3d?tab=box" },
    sections: [
      { h: { ar: "المقاس الداخلي", en: "Internal size" }, points: [
        { ar: "يُحسب من أبعاد العبوة مع غطائها، لا العبوة وحدها.", en: "Measured from the bottle with its cap on, not the bottle alone." },
        { ar: "خلوص بضعة ملليمترات من كل جهة يكفي مع حشوة؛ العلبة الواسعة تُتلف المنتج في الشحن.", en: "A few millimetres of clearance per side is enough with an insert; a loose box damages the product in transit." },
        { ar: "الاستوديو يضبط العلبة تلقائيًا على عبوتك وينبهك إن ضاقت أو اتسعت.", en: "The studio auto-fits the box to your bottle and warns you if it's tight or loose." },
      ] },
      { h: { ar: "الحشوة", en: "The insert" }, points: [
        { ar: "كرتون مطوي: اقتصادي ويناسب العبوات الخفيفة.", en: "Folded card: economical, suits light bottles." },
        { ar: "إسفنج أو EVA مقصوص: حماية أعلى ومظهر فاخر.", en: "Die-cut foam or EVA: more protection and a premium look." },
        { ar: "العبوة الثقيلة أو المستديرة تحتاج حشوة تمنع الدوران.", en: "A heavy or round bottle needs an insert that stops it rotating." },
      ] },
      { h: { ar: "نوع العلبة", en: "Box type" }, body: { ar: "العلبة المطوية أخف وأرخص وتُشحن مسطحة. العلبة الصلبة تعطي إحساس الهدية بتكلفة وكمية دنيا أعلى.", en: "A folding carton is lighter, cheaper and ships flat. A rigid box gives a gift feel at higher cost and minimum." } },
    ],
    takeaway: { ar: "العبوة أولًا، ثم العلبة على مقاسها. لا العكس.", en: "Bottle first, then the box sized to it. Never the reverse." },
  },
  {
    slug: "label-basics",
    icon: "ri-price-tag-3-line",
    title: { ar: "الملصق: ما يحمله وأين يوضع", en: "The label: what it carries and where it sits" },
    summary: { ar: "مساحة الطباعة على العبوة محدودة. رتّب المعلومات بين الملصق الأمامي والخلفي والعلبة.", en: "Print area on a bottle is limited. Split the information across front label, back label and box." },
    minutes: 4,
    tracks: ["A", "C", "D", "F"],
    apply: { label: { ar: "صمّم ملصقك", en: "Design your label" }, to: "/studio-3d?tab=label" },
    sections: [
      { h: { ar: "ما يُكتب عادة", en: "What usually goes on" }, points: [
        { ar: "اسم المنتج والبراند، ونوع العطر وتركيزه.", en: "Product and brand name, with fragrance type and strength." },
        { ar: "الحجم بالملليلتر.", en: "Volume in millilitres." },
        { ar: "قائمة المكوّنات، وتحذير القابلية للاشتعال للعطور الكحولية.", en: "Ingredient list, and a flammability warning for alcohol-based scents." },
        { ar: "رقم التشغيلة، وبلد المنشأ، وبيانات المصنّع أو المسؤول عن المنتج.", en: "Batch number, country of origin, and manufacturer or responsible-party details." },
      ] },
      { h: { ar: "قواعد التصميم", en: "Design rules" }, points: [
        { ar: "الملصق يبقى داخل المنطقة المستوية من العبوة؛ الانحناء يشوّه النص.", en: "Keep the label inside the flat zone of the bottle; curvature distorts text." },
        { ar: "أصغر خط مقروء للبيانات القانونية نحو 5 إلى 6 نقاط.", en: "The smallest readable size for legal copy is about 5–6 pt." },
        { ar: "على الزجاج الشفاف: اختبر تباين اللون مع لون العطر نفسه.", en: "On clear glass: test colour contrast against the juice itself." },
      ] },
      { h: { ar: "تنبيه نظامي", en: "Regulatory note" }, body: { ar: "اشتراطات بطاقة المنتج التجميلي تحددها الجهة المنظمة في كل سوق. في السعودية راجع المتطلبات الحالية لدى الهيئة العامة للغذاء والدواء قبل الطباعة.", en: "Cosmetic labelling rules are set by each market's regulator. In Saudi Arabia, check the current SFDA requirements before printing." } },
    ],
    takeaway: { ar: "الواجهة للبراند، والخلفية والعلبة للبيانات.", en: "Front for the brand; back and box for the data." },
  },
  {
    slug: "print-files",
    icon: "ri-printer-line",
    title: { ar: "تجهيز ملفات الطباعة", en: "Preparing print-ready files" },
    summary: { ar: "CMYK، النزيف، الدقة، وطبقات التذهيب: أربعة أسباب تعيد الملف من المطبعة.", en: "CMYK, bleed, resolution and foil layers: four reasons a printer bounces a file." },
    minutes: 4,
    tracks: ["D", "F", "C"],
    apply: { label: { ar: "اطلب الطباعة والتنفيذ", en: "Request print & finishing" }, to: "/start/F" },
    sections: [
      { h: { ar: "أساسيات الملف", en: "File basics" }, points: [
        { ar: "نظام الألوان CMYK، والألوان الخاصة بأرقام Pantone.", en: "CMYK colour, with spot colours given as Pantone numbers." },
        { ar: "دقة الصور 300 نقطة في البوصة بالمقاس الفعلي.", en: "Images at 300 dpi at final size." },
        { ar: "نزيف 3 مم خارج خط القص، وهامش أمان 3 مم داخله.", en: "3 mm bleed outside the trim, 3 mm safe margin inside." },
        { ar: "حوّل الخطوط إلى منحنيات، وسلّم PDF مع الملف المفتوح.", en: "Outline the fonts and deliver a PDF alongside the working file." },
      ] },
      { h: { ar: "التشطيبات", en: "Finishes" }, points: [
        { ar: "التذهيب والبصمة والبروز تُسلَّم في طبقة منفصلة بلون واحد.", en: "Foil, deboss and emboss go on a separate single-colour layer." },
        { ar: "الخطوط الرفيعة جدًا لا تصمد في التذهيب: اجعل السماكة 0.25 مم على الأقل.", en: "Hairlines don't hold in foil: keep strokes at least 0.25 mm." },
        { ar: "السلوفان المطفي يغمّق الألوان قليلًا؛ اطلب بروفة.", en: "Matte lamination darkens colours slightly; ask for a proof." },
      ] },
      { h: { ar: "قالب القص", en: "The dieline" }, body: { ar: "صمّم دائمًا على قالب القص المعتمد من المصنع. الاستوديو يصدّره لك بمقاسات علبتك.", en: "Always design on the factory-approved dieline. The studio exports it at your box's dimensions." } },
    ],
    takeaway: { ar: "بروفة مطبوعة واحدة أرخص من إعادة طباعة كاملة.", en: "One printed proof costs less than a full reprint." },
  },
  {
    slug: "brand-identity",
    icon: "ri-palette-line",
    title: { ar: "هوية البراند العطري", en: "Identity for a fragrance brand" },
    summary: { ar: "الاسم والقصة واللون والخط. ما الذي تحتاجه فعلًا قبل أول إنتاج.", en: "Name, story, colour and type. What you actually need before the first run." },
    minutes: 3,
    tracks: ["A", "D"],
    apply: { label: { ar: "ابدأ مسار الهوية", en: "Start the identity track" }, to: "/start/D" },
    sections: [
      { h: { ar: "الحد الأدنى العملي", en: "The practical minimum" }, points: [
        { ar: "اسم يُنطق بسهولة بالعربية والإنجليزية، وتحقق من توفره كعلامة تجارية.", en: "A name easy to say in Arabic and English, checked for trademark availability." },
        { ar: "شعار يعمل بلون واحد وبحجم صغير على غطاء أو ملصق.", en: "A logo that works in one colour and at small sizes on a cap or label." },
        { ar: "لونان أساسيان وخط للعناوين وآخر للنصوص.", en: "Two core colours, one headline typeface and one for text." },
      ] },
      { h: { ar: "القصة تبيع", en: "Story sells" }, body: { ar: "العطر منتج عاطفي. جملة واحدة عن مصدر الإلهام تُكتب على العلبة وتُعاد في كل إعلان.", en: "Perfume is an emotional product. One line on the inspiration goes on the box and repeats in every ad." } },
      { h: { ar: "اتساق عبر المواد", en: "Consistency across materials" }, points: [
        { ar: "الملصق والعلبة والكيس وبطاقة الشكر من نظام واحد.", en: "Label, box, bag and thank-you card from one system." },
        { ar: "سلّم المصنع دليل هوية مختصرًا وملفات الشعار المتجهة.", en: "Hand the factory a short brand guide and vector logo files." },
      ] },
    ],
    takeaway: { ar: "هوية بسيطة ومتسقة أفضل من هوية معقدة لا تُطبع جيدًا.", en: "A simple, consistent identity beats a complex one that prints badly." },
  },
  {
    slug: "production-stages",
    icon: "ri-settings-3-line",
    title: { ar: "مراحل التصنيع من التركيبة إلى الكرتون", en: "Production stages, formula to carton" },
    summary: { ar: "لماذا لا يُسلَّم العطر في أسبوع: التعتيق والترشيح والتعبئة وفحص الجودة.", en: "Why perfume isn't delivered in a week: maceration, filtration, filling and quality checks." },
    minutes: 5,
    tracks: ["A", "E"],
    apply: { label: { ar: "شاهد خطة مشروعك", en: "See your project plan" }, to: "/account/projects" },
    sections: [
      { h: { ar: "المسار", en: "The sequence" }, points: [
        { ar: "اعتماد التركيبة النهائية والعينة المرجعية.", en: "Approve the final formula and reference sample." },
        { ar: "توريد المواد: الزيت، الكحول، العبوات، المضخات، العلب.", en: "Source materials: oil, alcohol, bottles, pumps, boxes." },
        { ar: "الخلط ثم التعتيق: يُترك المزيج ليتجانس، عادة من أسبوعين إلى أربعة.", en: "Blend, then macerate: the mix rests to harmonise, usually two to four weeks." },
        { ar: "التبريد والترشيح لإزالة أي عكارة.", en: "Chill and filter to remove any haze." },
        { ar: "التعبئة والكبس والتغطية ووضع الملصق.", en: "Fill, crimp, cap and label." },
        { ar: "الفحص النهائي ثم التغليف والتكرتين.", en: "Final inspection, then boxing and cartoning." },
      ] },
      { h: { ar: "ما الذي يحدد المدة", en: "What sets the timeline" }, points: [
        { ar: "أطول بند توريد، وغالبًا العبوة الخاصة أو العلبة المطبوعة.", en: "The longest supply item, often a custom bottle or printed box." },
        { ar: "مدة التعتيق: اختصارها يضر بثبات الرائحة.", en: "Maceration time: cutting it hurts scent stability." },
        { ar: "سرعة اعتماداتك: كل يوم انتظار يُضاف للموعد.", en: "The speed of your approvals: every day of waiting adds to the date." },
      ] },
      { h: { ar: "الجودة", en: "Quality" }, body: { ar: "تُفحص عينة من كل تشغيلة: مستوى التعبئة، إحكام الكبس، عمل المضخة، ونظافة الملصق. ولكل تشغيلة رقم يُطبع على المنتج لتتبعها.", en: "A sample from each batch is checked: fill level, crimp seal, pump action and label cleanliness. Every batch gets a number printed on the product for traceability." } },
    ],
    takeaway: { ar: "التعتيق ليس تأخيرًا؛ هو جزء من جودة العطر.", en: "Maceration isn't a delay; it's part of the scent's quality." },
  },
  {
    slug: "moq-and-cost",
    icon: "ri-calculator-line",
    title: { ar: "الكمية الدنيا وسعر الوحدة", en: "Minimum order and unit price" },
    summary: { ar: "ما الذي يحرّك تكلفة العبوة الواحدة، وأين توفّر دون أن تضر بالمنتج.", en: "What drives the cost of a single unit, and where to save without hurting the product." },
    minutes: 4,
    tracks: ["A", "C", "E"],
    apply: { label: { ar: "راجع صفحة الأسعار", en: "See pricing" }, to: "/pricing" },
    sections: [
      { h: { ar: "مكوّنات التكلفة", en: "Cost components" }, points: [
        { ar: "العصير: الزيت العطري والتركيز والحجم.", en: "The juice: oil, concentration and volume." },
        { ar: "العبوة والغطاء والمضخة.", en: "Bottle, cap and pump." },
        { ar: "الملصق والعلبة والتشطيبات.", en: "Label, box and finishes." },
        { ar: "التعبئة والتغليف والفحص.", en: "Filling, packing and inspection." },
      ] },
      { h: { ar: "لماذا توجد كمية دنيا", en: "Why minimums exist" }, body: { ar: "كل تشغيل طباعة أو زجاج له تكلفة تجهيز ثابتة. الكمية الأكبر توزّعها على وحدات أكثر فينخفض سعر الوحدة.", en: "Every print or glass run has a fixed set-up cost. A larger quantity spreads it over more units, lowering the unit price." } },
      { h: { ar: "أين توفّر", en: "Where to save" }, points: [
        { ar: "قالب جاهز بدل قالب خاص في الإنتاج الأول.", en: "A stock mould instead of a custom one for the first run." },
        { ar: "تشطيب واحد مميز بدل ثلاثة.", en: "One standout finish instead of three." },
        { ar: "حجم واحد في الإطلاق ثم التوسع.", en: "One size at launch, then expand." },
      ] },
    ],
    takeaway: { ar: "لا توفّر في العصير والمضخة؛ العميل يلاحظهما فورًا.", en: "Don't economise on juice or pump; customers notice both immediately." },
  },
  {
    slug: "contracts-payments",
    icon: "ri-file-text-line",
    title: { ar: "العقد وجدول الدفعات والفواتير", en: "Contract, payment schedule and invoices" },
    summary: { ar: "ماذا توقّع، متى تدفع كل دفعة، ومن أين تحصل على فاتورتك الضريبية.", en: "What you sign, when each installment is due, and where to get your tax invoice." },
    minutes: 3,
    tracks: ["A", "B", "C", "D", "E", "F"],
    apply: { label: { ar: "افتح عقودي", en: "Open my contracts" }, to: "/account/contracts" },
    sections: [
      { h: { ar: "ما في العقد", en: "What the contract holds" }, points: [
        { ar: "البنود، وملحق المواصفات والكميات بصوره وملفاته.", en: "The clauses, plus an annex of specifications and quantities with images and files." },
        { ar: "قيمة العقد شاملة الضريبة، وجدول الدفعات بالنسب ومواعيد الاستحقاق.", en: "The contract value including VAT, and the payment schedule by percentage and due point." },
        { ar: "قد يكون العقد ملفًا مرفوعًا توقّعه إلكترونيًا كما هو.", en: "The contract may be an uploaded file that you e-sign as is." },
      ] },
      { h: { ar: "التوقيع", en: "Signing" }, body: { ar: "توقّع برسم توقيعك واسمك. يُربط توقيعك ببصمة رقمية للنص والقيمة والجدول؛ أي تغيير بعدها يستلزم توقيعًا جديدًا.", en: "You sign by drawing your signature and typing your name. It is bound to a digital fingerprint of the text, value and schedule; any change afterwards needs a new signature." } },
      { h: { ar: "الدفعات والفواتير", en: "Installments and invoices" }, points: [
        { ar: "لكل دفعة مستحقة مطالبة ببيانات التحويل البنكي.", en: "Each due installment has a payment request with bank details." },
        { ar: "عند تسجيل السداد تصدر فاتورة ضريبية برقم متسلسل ورمز QR.", en: "Once payment is recorded, a tax invoice is issued with a sequential number and QR code." },
        { ar: "كل فاتورة تبيّن ما سُدِّد سابقًا والمتبقي من قيمة العقد.", en: "Every invoice shows what was paid earlier and what remains of the contract value." },
      ] },
    ],
    takeaway: { ar: "اقرأ ملحق المواصفات قبل التوقيع؛ هو مرجع المطابقة عند الاستلام.", en: "Read the specification annex before signing; it's the reference for conformity on delivery." },
  },
  {
    slug: "launch-checklist",
    icon: "ri-rocket-2-line",
    title: { ar: "قائمة الإطلاق: قبل أن تبيع أول عبوة", en: "Launch checklist: before you sell the first bottle" },
    summary: { ar: "عشرة بنود بين استلام البضاعة وأول طلب: تسجيل المنتج، التصوير، السعر، والشحن.", en: "Ten items between receiving stock and the first order: registration, photography, price and shipping." },
    minutes: 4,
    tracks: ["A"],
    apply: { label: { ar: "ابدأ براندك الكامل", en: "Start your full brand" }, to: "/start/A" },
    sections: [
      { h: { ar: "قبل وصول البضاعة", en: "Before stock arrives" }, points: [
        { ar: "تحقق من اشتراطات تسجيل المنتج التجميلي في سوقك قبل البيع.", en: "Check cosmetic product registration requirements in your market before selling." },
        { ar: "سجّل العلامة التجارية والنطاق وحسابات التواصل.", en: "Register the trademark, domain and social handles." },
        { ar: "صوّر المنتج من عينة ما قبل الإنتاج لتجهّز المتجر مبكرًا.", en: "Shoot the product from the pre-production sample to ready the store early." },
      ] },
      { h: { ar: "عند الاستلام", en: "On receipt" }, points: [
        { ar: "افحص عينة من الكراتين مقابل ملحق المواصفات والعينة المعتمدة.", en: "Inspect a sample of cartons against the spec annex and approved sample." },
        { ar: "خزّن بعيدًا عن الحرارة والشمس المباشرة.", en: "Store away from heat and direct sun." },
        { ar: "جهّز كراتين شحن تحمي العلبة من الصدمات.", en: "Prepare shipping cartons that protect the box from knocks." },
      ] },
      { h: { ar: "التسعير", en: "Pricing" }, body: { ar: "احسب سعر البيع من تكلفة الوحدة مع الشحن والتسويق والعمولات، واترك هامشًا يتحمل العروض الموسمية.", en: "Build retail price from unit cost plus shipping, marketing and fees, leaving margin for seasonal offers." } },
    ],
    takeaway: { ar: "وزّع عينات صغيرة قبل الإطلاق؛ أرخص تسويق للعطر هو أن يُشم.", en: "Seed small samples before launch; the cheapest perfume marketing is letting people smell it." },
  },
];

export const lessonBySlug = (slug: string) => LESSONS.find((l) => l.slug === slug);
export const lessonsFor = (track?: string | null) => (track ? LESSONS.filter((l) => l.tracks.includes(track as TrackId)) : LESSONS);
/** الدرس التالي داخل الخدمة نفسها، وإلا التالي في القائمة */
export function nextLesson(slug: string, track?: string | null): Lesson | null {
  const pool = lessonsFor(track);
  const list = pool.some((l) => l.slug === slug) ? pool : LESSONS;
  const i = list.findIndex((l) => l.slug === slug);
  return i < 0 || list.length < 2 ? null : list[(i + 1) % list.length];
}
