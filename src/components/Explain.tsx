/**
 * شرح في مكان القرار.
 *
 * The rule this component exists to enforce: a screen that needs a manual to be
 * understood is a broken screen. A separate help page is a symptom, not a cure —
 * it drifts out of date, and a visitor who is confused mid-form will not leave
 * the form to go read it.
 *
 * So the explanation sits where the decision is made, in one plain sentence, in
 * the language a farmer or an investor actually uses. Three shapes, deliberately
 * few, because a page with five kinds of callout is noisier than a page with
 * none:
 *
 *   hint  — quiet, always visible. Explains a field before it is filled in.
 *   why   — explains the platform's reasoning where a user might suspect a trick
 *           ("why do you need my coordinates?"). Trust is built here or nowhere.
 *   warn  — a real consequence the user cannot undo by pressing back.
 *
 * There is no fourth. A designer reaching for one should write a shorter
 * sentence instead.
 */

export type ExplainTone = "hint" | "why" | "warn";

const TONE: Record<ExplainTone, { icon: string; className: string }> = {
  hint: {
    icon: "؟",
    className: "border-border bg-background text-muted",
  },
  why: {
    icon: "◆",
    className: "border-primary/30 bg-primary/5 text-foreground",
  },
  warn: {
    icon: "!",
    className: "border-danger/40 bg-danger/5 text-foreground",
  },
};

export default function Explain({
  tone = "hint",
  children,
}: {
  tone?: ExplainTone;
  children: React.ReactNode;
}) {
  const { icon, className } = TONE[tone];

  return (
    <p
      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-relaxed ${className}`}
    >
      <span
        aria-hidden
        className="mt-px flex size-4 shrink-0 items-center justify-center rounded-full border border-current text-[10px] font-bold opacity-70"
      >
        {icon}
      </span>
      <span>{children}</span>
    </p>
  );
}

/**
 * An empty state that teaches instead of apologising.
 *
 * "لا توجد بيانات" tells a first-time visitor nothing about what this page is
 * for or what to do next — and the first visit is exactly when a page is
 * hardest to understand. Every empty list on the platform should say what the
 * thing is, and offer the one action that ends the emptiness.
 */
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center">
      <p className="font-bold">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
        {children}
      </p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

/**
 * Where the visitor is in a multi-step flow, and how much is left.
 *
 * Shown before the first field rather than after the last, because the common
 * reason people abandon a form is not difficulty — it is not knowing whether
 * they are one minute or twenty from the end.
 */
export function Steps({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  return (
    <ol className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {steps.map((label, i) => {
        const state =
          i < current ? "done" : i === current ? "current" : "upcoming";

        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${
                state === "current"
                  ? "bg-primary font-medium text-primary-foreground"
                  : state === "done"
                    ? "text-primary"
                    : "text-muted"
              }`}
            >
              <span aria-hidden>{state === "done" ? "✓" : i + 1}</span>
              {label}
            </span>
            {i < steps.length - 1 && (
              <span aria-hidden className="text-muted">
                ←
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
