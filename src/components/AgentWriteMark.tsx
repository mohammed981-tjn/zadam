import { objectAgentWrite } from "@/app/agent/actions";
import type { AgentMark } from "@/lib/agentMarks";
import type { Locale } from "@/lib/i18n";
import { tr } from "@/lib/i18n";

/**
 * «سجّلها الوكيل …»: علامةٌ على مرحلةٍ اعتمدها وكيلٌ أو دليلٍ رفعه، ومعها نموذج الاعتراض لصاحب الموسم
 * (قرار المالك 6 نوفمبر). الاعتراض في القاعدة (agent_write_object): يُسجَّل ويُخبَر الوكيل، ويفتح المرحلة إن أمكن.
 */
export default function AgentWriteMark({
  mark,
  what,
  seasonId,
  canObject,
  locale,
  caption,
}: {
  mark: AgentMark;
  /** The evidence's caption, to say which one. */
  caption?: string | null;
  what: "stage" | "evidence";
  seasonId: string;
  canObject: boolean;
  locale: Locale;
}) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const who = mark.company ? `الوكيل «${mark.company}»` : "وكيلك";
  return (
    <div className="mt-2 rounded-lg bg-accent/10 px-3 py-2 text-xs">
      <p>
        {what === "stage"
          ? t(`سجّلها ${who}: اعتمد هذه المرحلة باسمك.`, `Recorded by your agent${mark.company ? ` ${mark.company}` : ""}: they signed off this stage in your name.`)
          : t(
              `سجّله ${who}: رفع الدليل${caption ? ` «${caption}»` : ""} باسمك.`,
              `Recorded by your agent${mark.company ? ` ${mark.company}` : ""}: they uploaded the evidence${caption ? ` “${caption}”` : ""} in your name.`,
            )}
      </p>
      {mark.objection ? (
        <p className="mt-1 text-danger">
          {t("اعترضت: ", "You objected: ")}
          {mark.objection.reason}
          {mark.objection.reopened && t(" — وفُتحت المرحلة من جديد.", " — and the stage was reopened.")}
        </p>
      ) : (
        canObject &&
        mark.actionId !== null && (
          <details className="mt-1">
            <summary className="cursor-pointer font-medium text-danger">{t("اعتراض", "Object")}</summary>
            <form action={objectAgentWrite} className="mt-2 flex flex-wrap items-end gap-2">
              <input type="hidden" name="action_id" value={mark.actionId} />
              <input type="hidden" name="from" value={`/seasons/${seasonId}`} />
              <input
                name="reason"
                required
                minLength={3}
                maxLength={500}
                placeholder={t("لماذا؟ يقرؤه الوكيل", "Why? The agent reads it")}
                className="min-w-48 flex-1 rounded-lg border border-border bg-background px-2 py-1"
              />
              <button className="rounded-lg bg-danger px-3 py-1 font-medium text-white hover:opacity-90">
                {t("أعترض", "Object")}
              </button>
            </form>
            <p className="mt-1 text-muted">
              {what === "stage"
                ? t(
                    "تُفتح المرحلة من جديد إن لم تُعتمد بعدها مرحلة، فتعتمدها أنت حين تتمّ. ودليلها يبقى.",
                    "The stage reopens if no later stage has been signed off, and you sign it off when it is done. Its evidence stays.",
                  )
                : t("يبقى الدليل، معلَّماً أنّك اعترضت عليه.", "The evidence stays, marked as objected to.")}
            </p>
          </details>
        )
      )}
    </div>
  );
}
