import type { KnowledgeEntry } from "@/types/database";
import { topicLabel } from "@/lib/format";
import type { Locale } from "@/lib/i18n";

/**
 * The entry itself stays in the language it was written in — the knowledge base
 * is Arabic — and only the card's own labels follow the reader.
 */
export default function KnowledgeCard({
  entry,
  locale = "ar",
}: {
  entry: KnowledgeEntry;
  locale?: Locale;
}) {
  return (
    // The id is where the news page points each day's new entries.
    <div id={`k-${entry.id}`} className="reveal flex scroll-mt-24 flex-col gap-2 rounded-2xl border border-border bg-card p-5 shadow-card transition duration-200 hover:shadow-raised">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
          {entry.crop}
        </span>
        <span className="rounded-full bg-border/60 px-2.5 py-1 text-xs">
          {topicLabel(entry.topic, locale)}
        </span>
      </div>
      <h3 lang="ar" dir="rtl" className="font-bold">{entry.title}</h3>
      <p lang="ar" dir="rtl" className="line-clamp-3 text-sm text-foreground/80">{entry.content}</p>
      {entry.source_country && (
        <p className="mt-1 text-xs text-muted">
          {locale === "en" ? "Source" : "المصدر"}: {entry.source_country}
        </p>
      )}
    </div>
  );
}
