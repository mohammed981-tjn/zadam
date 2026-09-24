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
export const WRB: Record<string, { ar: string; note: string; fill: string }> = {
  Vertisols: { ar: "طينية متشقّقة (فيرتيسول)", note: "تمسك الماء جيداً وتتشقّق حين تجفّ — تحتاج تبطيناً مرناً", fill: "#5b4a3a" },
  Arenosols: { ar: "رملية (أرينوسول)", note: "ترشيحٌ عالٍ — القناة فيها تحتاج تبطيناً، والريّ بالتنقيط", fill: "#e9d59a" },
  Leptosols: { ar: "ضحلة صخرية (ليبتوسول)", note: "حفرٌ صعب ورقعةٌ لا تصلح للزراعة", fill: "#9a9a9a" },
  Regosols: { ar: "مفكّكة غير متطوّرة (ريغوسول)", note: "خفيفة؛ تُزرع بعناية وتنجرف", fill: "#d8c7a4" },
  Cambisols: { ar: "حديثة التكوّن (كامبيسول)", note: "متوسطة، تصلح للزراعة المرويّة", fill: "#c49a6c" },
  Calcisols: { ar: "كلسية (كالسيسول)", note: "كربونات في القطاع؛ تُراقب القلوية", fill: "#e3d3c3" },
  Gypsisols: { ar: "جبسية (جيبسيسول)", note: "الجبس يذوب تحت القنوات — خطر هبوط", fill: "#f1ece0" },
  Fluvisols: { ar: "رسوبية نهرية (فلوفيسول)", note: "خصبة، على ضفاف المجاري", fill: "#7fa7a0" },
  Luvisols: { ar: "طين مغسول (لوفيسول)", note: "خصبة ومتوسطة النفاذية", fill: "#b5764a" },
  Lixisols: { ar: "مغسولة فقيرة (ليكسيسول)", note: "ضعيفة الخصوبة، تحتاج تسميداً", fill: "#cf9b6b" },
  Solonetz: { ar: "صودية (سولونتز)", note: "صوديوم عالٍ — أفسدت مشاريع ريّ في المنطقة", fill: "#8f6fa3" },
  Solonchaks: { ar: "ملحية (سولونتشاك)", note: "ملوحة — لا تُروى دون صرف", fill: "#c9b3d9" },
  Plinthosols: { ar: "حديدية (بلينثوسول)", note: "طبقة حديدية تتصلّب", fill: "#a0522d" },
  Planosols: { ar: "مسطّحة صمّاء (بلانوسول)", note: "طبقةٌ لا ينفذ منها الماء — تغدق في الخريف", fill: "#6f8fa8" },
  Nitisols: { ar: "حمراء عميقة (نيتيسول)", note: "من أخصب الترب الاستوائية", fill: "#8c2d19" },
  Acrisols: { ar: "حمضية مغسولة (أكريسول)", note: "حمضيّة فقيرة، تحتاج جيراً وسماداً", fill: "#d9824a" },
  Ferralsols: { ar: "حديدية عتيقة (فيرالسول)", note: "عميقة وفقيرة الغذاء", fill: "#c0392b" },
  Andosols: { ar: "بركانية (أندوسول)", note: "خصبة خفيفة — تربة جبل مرّة", fill: "#3d3d3d" },
};

export const wrbInfo = (name: string | null) =>
  name ? (WRB[name] ?? { ar: name, note: "", fill: "#cccccc" }) : null;

/** The Arabic name without the international one — what fits a phone legend. */
export const wrbShort = (name: string) => (WRB[name]?.ar ?? name).split(" (")[0];
