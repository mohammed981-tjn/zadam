import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

/**
 * The phone app's session, carried as a bearer token (backlog 138).
 *
 * The website keeps its session in cookies; the app keeps the same Supabase
 * session on the phone and sends its access token with each request. This
 * builds a client that acts as that person, so row-level security applies
 * exactly as it does on the website — the routes under /api/app read through
 * it and hold no elevated key.
 *
 * The token is checked with the auth server (`getUser`), not just decoded: a
 * revoked session, or one signed out on another device, is refused here rather
 * than trusted until it expires.
 */
export async function clientFromBearer(
  req: Request,
): Promise<{ supabase: SupabaseClient; user: User } | null> {
  const token = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "")?.[1];
  if (!token) return null;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    },
  );

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  // A temporary password the administration read out over the phone is changed on the website before the app may use
  // the account (app-api-2 / public-api-5; the owner, question 24), as the website itself requires. It makes the owner
  // change it; it is not a lock against someone else who knows it (the flag is the account's own metadata).
  if (mustChangePasswordFirst(data.user)) return null;
  return { supabase, user: data.user };
}

/** The account still carries a temporary password set by an administrator (AUTH-05). */
export function mustChangePasswordFirst(user: Pick<User, "user_metadata">): boolean {
  return user.user_metadata?.must_change_password === true;
}

/** What the app shows when that is why it was refused. */
export const CHANGE_PASSWORD_FIRST =
  "كلمة المرور هذه مؤقّتة. افتح الموقع وادخل بها وغيّرها أوّلاً، ثمّ ادخل إلى التطبيق بكلمة المرور الجديدة.";

/**
 * Signs in with a password and hands back the session itself, for the app to
 * keep. A fresh client each time, holding nothing between requests.
 */
export async function passwordSession(email: string, password: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) return { error: error?.message ?? "no session" } as const;
  if (mustChangePasswordFirst(data.user)) {
    // Not handed to the phone: the session ends here, and the person is told where to change the password.
    // This session only («local»): a global sign-out would also end the website session where they change it.
    await supabase.auth.signOut({ scope: "local" });
    return { error: CHANGE_PASSWORD_FIRST, mustChange: true } as const;
  }
  const s = data.session;
  return {
    session: {
      access_token: s.access_token,
      refresh_token: s.refresh_token,
      expires_at: s.expires_at ?? Math.floor(Date.now() / 1000) + (s.expires_in ?? 3600),
    },
  } as const;
}
