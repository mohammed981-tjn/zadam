import { redirect } from "next/navigation";
import EntryScreen from "@/components/EntryScreen";
import { createClient } from "@/lib/supabase/server";
import { homeFor, safeNext } from "@/lib/authEntry";

/**
 * الدخول والتسجيل — شاشةٌ واحدة (البند ١٤٢).
 *
 * `/signup` renders the same screen with the name open. Someone already signed
 * in is sent on to where they were going, never shown a sign-in form: the
 * owner, signed in, kept being told «سجّل» when he pressed «سجّل أرضك».
 *
 * `error` and `message` still arrive in the address from the flows that
 * redirect here — the confirmation resend, the password reset, the older
 * actions a cached page may still post to.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; next?: string }>;
}) {
  const { error, message, next: rawNext } = await searchParams;
  const next = safeNext(rawNext);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect(next ?? (await homeFor(supabase, user.id)));

  return <EntryScreen next={next} error={error} message={message} startNew={false} />;
}
