import Link from "next/link";
import type { Project } from "@/types/database";
import { cropVisual, formatUsd, riskLabel, statusLabel } from "@/lib/format";

const riskColor: Record<string, string> = {
  low: "bg-primary/10 text-primary",
  medium: "bg-accent/10 text-accent",
  high: "bg-danger/10 text-danger",
};

export default function ProjectCard({ project }: { project: Project }) {
  const fundedPct = Math.min(
    100,
    Math.round((project.shares_sold / project.total_shares) * 100),
  );
  const { emoji, gradient } = cropVisual(project.name);

  return (
    <Link
      href={`/projects/${project.slug}`}
      className="flex flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-card p-5 pt-0 transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div
        className={`-mx-5 flex h-24 items-center justify-center bg-gradient-to-br ${gradient} text-5xl`}
        aria-hidden
      >
        {emoji}
      </div>

      <div className="flex items-start justify-between gap-2">
        <h3 className="text-lg font-bold">{project.name}</h3>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${riskColor[project.risk_level]}`}
        >
          مخاطرة {riskLabel(project.risk_level)}
        </span>
      </div>

      <p className="text-sm text-muted">{project.location}</p>

      {project.description && (
        <p className="line-clamp-2 text-sm text-foreground/80">
          {project.description}
        </p>
      )}

      <div className="mt-1 flex items-center justify-between text-sm">
        <span className="text-muted">{project.total_feddans} فدان</span>
        <span className="font-medium text-primary">
          {statusLabel(project.status)}
        </span>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-border">
        <div className="h-full bg-primary" style={{ width: `${fundedPct}%` }} />
      </div>
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{fundedPct}% ممول</span>
        <span>
          الحصة من {formatUsd(project.price_per_share)}
          {project.expected_annual_return
            ? ` · عائد متوقع ${project.expected_annual_return}%`
            : ""}
        </span>
      </div>
    </Link>
  );
}
