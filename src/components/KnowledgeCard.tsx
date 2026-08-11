import type { KnowledgeEntry } from "@/types/database";
import { topicLabel } from "@/lib/format";

export default function KnowledgeCard({ entry }: { entry: KnowledgeEntry }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
          {entry.crop}
        </span>
        <span className="rounded-full bg-border/60 px-2.5 py-1 text-xs">
          {topicLabel(entry.topic)}
        </span>
      </div>
      <h3 className="font-bold">{entry.title}</h3>
      <p className="line-clamp-3 text-sm text-foreground/80">{entry.content}</p>
      {entry.source_country && (
        <p className="mt-1 text-xs text-muted">
          المصدر: {entry.source_country}
        </p>
      )}
    </div>
  );
}
