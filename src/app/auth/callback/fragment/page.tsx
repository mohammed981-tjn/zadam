"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

/**
 * The half of the callback a server cannot do.
 *
 * Supabase's implicit flow returns the session in the URL fragment —
 * `#access_token=…&refresh_token=…&type=recovery`. A fragment is never sent to
 * the server, by design and by every browser, so the route handler next door
 * genuinely cannot see it. Someone landing here has arrived with a link whose
 * credential is visible only to JavaScript.
 *
 * This page exists so that case ends in a session rather than in silence. It
 * reads the fragment, hands the tokens to the browser client, and then sends
 * the visitor on to set their password.
 *
 * It is the fallback, not the main path. The route handler covers `code` and
 * `token_hash`, which are what a correctly configured project sends; this
 * covers a project still on the older template, and its existence is why a
 * template that nobody remembered to change does not read as "the link is
 * broken".
 */
export default function AuthFragmentPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    /*
     * All of it inside one async function, including the checks that could be
     * answered immediately.
     *
     * Setting state synchronously in an effect body triggers a cascading render
     * and the linter refuses it — rightly. Deferring the whole sequence keeps
     * the three outcomes (bad link, failed session, success) on one path
     * instead of splitting them across a synchronous half and an async half.
     */
    let cancelled = false;

    async function complete() {
      const hash = window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : window.location.hash;
      const params = new URLSearchParams(hash);

      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      const type = params.get("type");
      const described = params.get("error_description") ?? params.get("error");

      if (described) {
        if (!cancelled) {
          setError("انتهت صلاحية الرابط أو استُخدم من قبل. اطلب رابطاً جديداً.");
        }
        return;
      }

      if (!accessToken || !refreshToken) {
        if (!cancelled) {
          setError(
            "الرابط لا يحمل بيانات صالحة. اطلب رابطاً جديداً، وافتحه كاملاً كما وصلك.",
          );
        }
        return;
      }

      const supabase = createClient();
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (cancelled) return;

      if (sessionError) {
        setError("تعذّر إكمال الرابط. اطلب رابطاً جديداً.");
        return;
      }

      // Clear the fragment before navigating: tokens must not stay in the
      // address bar, in history, or in whatever the visitor pastes next.
      window.history.replaceState(null, "", window.location.pathname);
      router.replace(type === "recovery" ? "/reset/confirm" : "/dashboard");
    }

    void complete();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="mx-auto max-w-sm px-4 py-16 text-center">
      {error ? (
        <>
          <h1 className="mb-2 text-xl font-bold">الرابط لم يعد صالحاً</h1>
          <p className="mb-6 text-sm leading-relaxed text-muted">{error}</p>
          <Link
            href="/reset"
            className="inline-block rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
          >
            اطلب رابطاً جديداً
          </Link>
        </>
      ) : (
        <p className="text-sm text-muted">جارٍ التحقّق من الرابط…</p>
      )}
    </div>
  );
}
