import { setAppPush } from "@/app/notifications/actions";
import { createClient } from "@/lib/supabase/server";
import { tr, type Locale } from "@/lib/i18n";

/**
 * «إشعارات الجوّال» (البند ٢٠٧): the switch for notifications that reach the Sudagri app on the phone while it is
 * closed. One switch for the account, read and written as the signed-in person (push_app_status / push_app_set); the
 * same switch is in «حسابي» in the app. The browser's own push (PushToggle, above it) is a separate thing, per browser.
 */
export default async function AppPushSetting({ locale }: { locale: Locale }) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("push_app_status");
  // Before the migration is applied the function is not there: the switch is simply not shown.
  if (error) return null;
  const s = (data ?? {}) as { enabled?: boolean; devices?: number };
  const enabled = s.enabled !== false;
  const devices = Number(s.devices ?? 0);

  return (
    <div className="mb-6 rounded-xl border border-border bg-card p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">{t("إشعارات الجوّال", "Phone app notifications")}</p>
          <p className="text-xs text-muted">
            {t(
              "تصل إلى تطبيق سوداقري على جوّالك وهو مغلق: تنبيه سعر، جرادٌ قرب أرضك، قيدٌ ينتظر اعتمادك، عقدٌ ينتظر توقيعك، رسالةٌ جديدة.",
              "They reach the Sudagri app on your phone while it is closed: a price alert, locusts near your land, an entry awaiting your approval, a contract awaiting your signature, a new message.",
            )}
          </p>
          <p className="mt-1 text-xs text-muted">
            {devices > 0
              ? t(`مسجَّلة على ${devices} جوّال.`, `Registered on ${devices} phone(s).`)
              : t("لم يدخل حسابَك جوّالٌ من التطبيق بعد.", "No phone has signed in to your account from the app yet.")}
          </p>
        </div>
        <form action={setAppPush}>
          {!enabled && <input type="hidden" name="enabled" value="on" />}
          <button
            type="submit"
            className={`rounded-lg px-4 py-2 text-sm font-medium ${enabled ? "border border-border" : "bg-primary text-primary-foreground"}`}
          >
            {enabled ? t("أطفئها", "Turn off") : t("شغّلها", "Turn on")}
          </button>
        </form>
      </div>
      <p className={`mt-2 text-xs ${enabled ? "text-primary" : "text-muted"}`}>
        {enabled
          ? t("مفعَّلة.", "On.")
          : t("مطفأة: لا يصل شيءٌ إلى الجوّال، والإشعارات هنا كما هي.", "Off: nothing reaches the phone; the notifications here are unchanged.")}
      </p>
    </div>
  );
}
