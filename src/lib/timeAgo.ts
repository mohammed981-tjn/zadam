import type { Locale } from "@/lib/i18n";

/** How long ago, in words — the notifications list and the inbox say it the same way. */
export function timeAgo(iso: string, locale: Locale): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (locale === "en") {
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return days === 1 ? "1 day ago" : `${days} days ago`;
    return new Date(iso).toLocaleDateString("en-GB", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }
  if (seconds < 60) return "الآن";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `قبل ${minutes} دقيقة`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `قبل ${hours} ساعة`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `قبل ${days} يوم`;

  return new Date(iso).toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
