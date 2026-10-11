/**
 * أصناف التربة (تصنيف WRB العالمي) كما تُرجعها SoilGrids في السودان.
 *
 * Its own module because two maps read it: the canal corridor's 11 km grid
 * and the national map's 160 km cells. The corridor module drags its survey
 * JSON behind it; the national map should not.
 *
 * Each group comes in Arabic with what it means for a canal and for
 * irrigation — the reason to map soil at all. Colours follow the usual WRB
 * map convention loosely (vertisols dark, arenosols sand-yellow) so a reader
 * who has seen a soil map recognises them. The last five appear only on the
 * national map: the southern clays and Jebel Marra's volcanic ground.
 */
export const WRB: Record<string, { ar: string; note: string; en: string; noteEn: string; fill: string }> = {
  Vertisols: { ar: "طينية متشقّقة (فيرتيسول)", note: "تمسك الماء جيداً وتتشقّق حين تجفّ — تحتاج تبطيناً مرناً", en: "Cracking clay (Vertisol)", noteEn: "Holds water well and cracks as it dries — needs a flexible lining", fill: "#5b4a3a" },
  Arenosols: { ar: "رملية (أرينوسول)", note: "ترشيحٌ عالٍ — القناة فيها تحتاج تبطيناً، والريّ بالتنقيط", en: "Sandy (Arenosol)", noteEn: "High seepage — a canal here needs lining, and fields need drip", fill: "#e9d59a" },
  Leptosols: { ar: "ضحلة صخرية (ليبتوسول)", note: "حفرٌ صعب ورقعةٌ لا تصلح للزراعة", en: "Shallow, stony (Leptosol)", noteEn: "Hard digging, and ground unfit for farming", fill: "#9a9a9a" },
  Regosols: { ar: "مفكّكة غير متطوّرة (ريغوسول)", note: "خفيفة؛ تُزرع بعناية وتنجرف", en: "Loose, undeveloped (Regosol)", noteEn: "Light; farm with care, it erodes", fill: "#d8c7a4" },
  Cambisols: { ar: "حديثة التكوّن (كامبيسول)", note: "متوسطة، تصلح للزراعة المرويّة", en: "Young soil (Cambisol)", noteEn: "Medium, good for irrigated farming", fill: "#c49a6c" },
  Calcisols: { ar: "كلسية (كالسيسول)", note: "كربونات في القطاع؛ تُراقب القلوية", en: "Calcareous (Calcisol)", noteEn: "Carbonates in the profile; watch the alkalinity", fill: "#e3d3c3" },
  Gypsisols: { ar: "جبسية (جيبسيسول)", note: "الجبس يذوب تحت القنوات — خطر هبوط", en: "Gypsum soil (Gypsisol)", noteEn: "Gypsum dissolves under canals — a risk of subsidence", fill: "#f1ece0" },
  Fluvisols: { ar: "رسوبية نهرية (فلوفيسول)", note: "خصبة، على ضفاف المجاري", en: "River alluvium (Fluvisol)", noteEn: "Fertile, along watercourses", fill: "#7fa7a0" },
  Luvisols: { ar: "طين مغسول (لوفيسول)", note: "خصبة ومتوسطة النفاذية", en: "Leached clay (Luvisol)", noteEn: "Fertile, moderately permeable", fill: "#b5764a" },
  Lixisols: { ar: "مغسولة فقيرة (ليكسيسول)", note: "ضعيفة الخصوبة، تحتاج تسميداً", en: "Leached, poor (Lixisol)", noteEn: "Low fertility, needs fertiliser", fill: "#cf9b6b" },
  Solonetz: { ar: "صودية (سولونتز)", note: "صوديوم عالٍ — أفسدت مشاريع ريّ في المنطقة", en: "Sodic (Solonetz)", noteEn: "High sodium — it has spoilt irrigation schemes in the region", fill: "#8f6fa3" },
  Solonchaks: { ar: "ملحية (سولونتشاك)", note: "ملوحة — لا تُروى دون صرف", en: "Saline (Solonchak)", noteEn: "Salinity — do not irrigate without drainage", fill: "#c9b3d9" },
  Plinthosols: { ar: "حديدية (بلينثوسول)", note: "طبقة حديدية تتصلّب", en: "Ironstone (Plinthosol)", noteEn: "An iron-rich layer that hardens", fill: "#a0522d" },
  Planosols: { ar: "مسطّحة صمّاء (بلانوسول)", note: "طبقةٌ لا ينفذ منها الماء — تغدق في الخريف", en: "Flat, impermeable (Planosol)", noteEn: "A layer water cannot pass — waterlogs in the rainy season", fill: "#6f8fa8" },
  Nitisols: { ar: "حمراء عميقة (نيتيسول)", note: "من أخصب الترب الاستوائية", en: "Deep red (Nitisol)", noteEn: "Among the most fertile tropical soils", fill: "#8c2d19" },
  Acrisols: { ar: "حمضية مغسولة (أكريسول)", note: "حمضيّة فقيرة، تحتاج جيراً وسماداً", en: "Acid, leached (Acrisol)", noteEn: "Acid and poor, needs lime and fertiliser", fill: "#d9824a" },
  Ferralsols: { ar: "حديدية عتيقة (فيرالسول)", note: "عميقة وفقيرة الغذاء", en: "Old iron-rich (Ferralsol)", noteEn: "Deep and poor in nutrients", fill: "#c0392b" },
  Andosols: { ar: "بركانية (أندوسول)", note: "خصبة خفيفة — تربة جبل مرّة", en: "Volcanic (Andosol)", noteEn: "Fertile and light — the soil of Jebel Marra", fill: "#3d3d3d" },
};

export const wrbInfo = (name: string | null) =>
  name ? (WRB[name] ?? { ar: name, note: "", en: name, noteEn: "", fill: "#cccccc" }) : null;

/** The Arabic name without the international one — what fits a phone legend. */
export const wrbShort = (name: string) => (WRB[name]?.ar ?? name).split(" (")[0];

export const wrbShortEn = (name: string) => (WRB[name]?.en ?? name).split(" (")[0];
