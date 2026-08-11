export function formatUsd(amount: number) {
  return new Intl.NumberFormat("ar", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export function riskLabel(risk: string) {
  return { low: "منخفض", medium: "متوسط", high: "مرتفع" }[risk] ?? risk;
}

export function statusLabel(status: string) {
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

export function topicLabel(topic: string) {
  return (
    {
      soil: "تربة",
      pest: "آفات",
      water: "ري ومياه",
      variety: "أصناف",
      institutional: "نماذج مؤسسية",
      general: "عام",
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
