import type { Locale } from "./i18n";

export function formatUsd(amount: number, locale: Locale = "ar") {
  return new Intl.NumberFormat(locale === "en" ? "en-US" : "ar", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export function riskLabel(risk: string, locale: Locale = "ar") {
  const labels =
    locale === "en"
      ? { low: "Low", medium: "Medium", high: "High" }
      : { low: "منخفض", medium: "متوسط", high: "مرتفع" };
  return labels[risk as keyof typeof labels] ?? risk;
}

const STATUS_EN: Record<string, string> = {
  draft: "Draft",
  open: "Open for investment",
  funded: "Fully funded",
  in_progress: "In progress",
  completed: "Completed",
};

export function statusLabel(status: string, locale: Locale = "ar") {
  if (locale === "en") return STATUS_EN[status] ?? status;
  return (
    {
      draft: "مسودة",
      open: "مفتوح للاستثمار",
      funded: "تم تمويله بالكامل",
      in_progress: "قيد التنفيذ",
      completed: "مكتمل",
    }[status] ?? status
  );
}

const TOPIC_EN: Record<string, string> = {
  soil: "Soil",
  pest: "Pests",
  water: "Irrigation and water",
  variety: "Varieties",
  institutional: "Institutional models",
  general: "General",
  agronomy: "Crop husbandry",
  technology: "Technologies",
  livestock: "Livestock",
  economics: "Economics and marketing",
};

export function topicLabel(topic: string, locale: Locale = "ar") {
  if (locale === "en") return TOPIC_EN[topic] ?? topic;
  return (
    {
      soil: "تربة",
      pest: "آفات",
      water: "ري ومياه",
      variety: "أصناف",
      institutional: "نماذج مؤسسية",
      general: "عام",
      agronomy: "خدمة المحصول",
      technology: "تقنيات",
      livestock: "ثروة حيوانية",
      economics: "اقتصاد وتسويق",
    }[topic] ?? topic
  );
}

export function cropVisual(projectName: string) {
  if (projectName.includes("قطن"))
    return { emoji: "🌱", gradient: "from-emerald-600 to-emerald-800" };
  if (projectName.includes("قمح"))
    return { emoji: "🌾", gradient: "from-amber-500 to-amber-700" };
  if (projectName.includes("سمسم"))
    return { emoji: "🌻", gradient: "from-yellow-500 to-orange-600" };
  if (projectName.includes("ذرة") || projectName.includes("الذرة"))
    return { emoji: "🌽", gradient: "from-yellow-400 to-amber-600" };
  return { emoji: "🌿", gradient: "from-primary to-emerald-800" };
}
