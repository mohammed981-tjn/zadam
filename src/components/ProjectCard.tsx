import Link from "next/link";
import type { Project } from "@/types/database";
import { cropVisual, formatUsd, riskLabel, statusLabel } from "@/lib/format";
import type { Locale } from "@/lib/i18n";

const riskColor: Record<string, string> = {
  low: "bg-primary/10 text-primary",
  medium: "bg-accent/10 text-accent",
  high: "bg-danger/10 text-danger",
};

export default function ProjectCard({
  project,
  locale = "ar",
  verifiedLand,
}: {
  project: Project;
  locale?: Locale;
  /** The project stands on a land the administrators verified (backlog 130), with that land's documents. */
  verifiedLand?: { documents: number; required: number };
}) {
  const en = locale === "en";
  const fundedPct = Math.min(
    100,
    Math.round((project.shares_sold / project.total_shares) * 100),
  );
  const { emoji, gradient } = cropVisual(project.name);

  return (
    <Link
      href={`/projects/${project.slug}`}
      className="reveal flex flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-card p-5 pt-0 shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-float"
    >
      <div
        className={`-mx-5 flex h-24 items-center justify-center bg-gradient-to-br ${gradient} text-5xl`}
        aria-hidden
      >
        {emoji}
      </div>

      {project.is_demo && (
        <span className="-mb-1 w-fit rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent">
          {en ? "Illustrative example — not a real offer" : "نموذج توضيحي — ليس عرضاً حقيقياً"}
        </span>
      )}

      <div className="flex items-start justify-between gap-2">
        <h3 className="text-lg font-bold">{project.name}</h3>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${riskColor[project.risk_level]}`}
        >
          {en ? `${riskLabel(project.risk_level, locale)} risk` : `خطر ${riskLabel(project.risk_level)}`}
        </span>
      </div>

      <p className="text-sm text-muted">{project.location}</p>

      {verifiedLand && (
        <span className="-mt-1 w-fit rounded-full bg-leaf/10 px-2.5 py-1 text-xs font-bold text-leaf">
          {en
            ? `On verified land · ${verifiedLand.documents} of ${verifiedLand.required} documents on file`
            : `على أرضٍ موثّقة · ${verifiedLand.documents} من ${verifiedLand.required} مستندات في الملفّ`}
        </span>
      )}

      {project.description && (
        <p className="line-clamp-2 text-sm text-foreground/80">
          {project.description}
        </p>
      )}

      <div className="mt-1 flex items-center justify-between text-sm">
        <span className="text-muted">{project.total_feddans} {en ? "feddans" : "فدان"}</span>
        <span className="font-medium text-primary">
          {statusLabel(project.status, locale)}
        </span>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-border">
        <div className="h-full bg-primary" style={{ width: `${fundedPct}%` }} />
      </div>
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{fundedPct}% {en ? "funded" : "ممول"}</span>
        <span>
          {en ? "Share from " : "الحصة من "}
          {formatUsd(project.price_per_share, locale)}
          {project.expected_annual_return
            ? en
              ? ` · expected return ${project.expected_annual_return}%`
              : ` · عائد متوقع ${project.expected_annual_return}%`
            : ""}
        </span>
      </div>
    </Link>
  );
}
