import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OAUTH_PROVIDERS, type OAuthProvider } from "@/lib/oauth";
import { CHALLENGE } from "@/lib/appHandoff";
import { tr } from "@/lib/i18n";
import { appLocale } from "@/lib/appLocale";

/**
 * «الدخول بحساب Google» في التطبيق (البند ١٧٣): يفتحه التطبيق في متصفّح الجوّال.
 *
 * The same sign-in as the website's button (`signInWithProvider`), back to the same `/auth/callback`, with one more
 * thing in the return address: the app's `challenge` (lib/appHandoff). Seeing it, the callback hands the session to
 * the app sealed instead of keeping it in this browser. The browser that starts here is the one that finishes, so
 * the PKCE cookie Supabase sets here is there to be read.
 */
export async function GET(req: Request) {
  const locale = appLocale(req);
  const url = new URL(req.url);
  const provider = url.searchParams.get("provider") as OAuthProvider;
  const challenge = url.searchParams.get("challenge") ?? "";
  if (!(OAUTH_PROVIDERS as readonly string[]).includes(provider) || !CHALLENGE.test(challenge)) {
    return NextResponse.json({ error: tr(locale, "طلبٌ غير صالح.", "Invalid request.") }, { status: 400 });
  }
  const side = url.searchParams.get("side") === "investor" ? "investor" : "farmer";
  const back = new URLSearchParams({ via: provider, side, app: challenge });

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${url.origin}/auth/callback?${back}` },
  });
  if (error || !data?.url) {
    console.error("app oauth: start failed:", provider, error?.message);
    return NextResponse.json({ error: tr(locale, "تعذّر الدخول بهذا الحساب الآن.", "Could not sign in with this account right now.") }, { status: 502 });
  }
  redirect(data.url);
}
