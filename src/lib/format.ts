export function formatUsd(amount: number) {
  return new Intl.NumberFormat("ar", { style: "currency", currency: "USD" }).format(amount);
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
