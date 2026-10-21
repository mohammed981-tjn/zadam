import Icon, { type IconName } from "@/components/Icon";

/**
 * The top of a screen, said the same way everywhere it is used (backlog 121):
 * which part of the site you are in, as a small hibiscus label with its icon;
 * the title, with the short bar that opens a section; and one paragraph saying
 * what the page is for. Pages had each set their own h1 at their own size,
 * some with a back link above it and some without.
 */
export default function PageHeader({
  icon,
  eyebrow,
  title,
  children,
}: {
  icon?: IconName;
  eyebrow?: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="mb-6">
      {eyebrow && (
        <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-rose/10 px-3 py-1 text-xs font-bold text-rose">
          {icon && <Icon name={icon} className="size-4" />}
          {eyebrow}
        </p>
      )}
      <h1 className="title-bar font-black leading-tight" style={{ fontSize: "var(--text-title)" }}>
        {title}
      </h1>
      {children && <div className="mt-3 text-sm leading-relaxed text-muted">{children}</div>}
    </header>
  );
}
