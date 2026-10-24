import { redirect } from "next/navigation";
import EntryScreen from "@/components/EntryScreen";
import { createClient } from "@/lib/supabase/server";
import { homeFor, safeNext } from "@/lib/authEntry";

/**
 * «أنشئ حساباً» — the one sign-in screen with the name already open
 * (backlog 142). The address is kept: links, the app and shared messages point
 * here. Someone signed in goes on to where they were going, or to their lands.
 */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; as?: string }>;
}) {
  const { error, next: rawNext, as } = await searchParams;
  const next = safeNext(rawNext);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect(next ?? (await homeFor(supabase, user.id)));

  // ?as=investor: from «سجّل لتطلب الشراكة» on an opportunity (the owner, 24
  // October: «كيف حيسجّل المستثمر؟»).
  return <EntryScreen next={next} error={error} startNew investor={as === "investor"} />;
}
