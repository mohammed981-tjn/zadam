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
  return { supabase, user: data.user };
}

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
  const s = data.session;
  return {
    session: {
      access_token: s.access_token,
      refresh_token: s.refresh_token,
      expires_at: s.expires_at ?? Math.floor(Date.now() / 1000) + (s.expires_in ?? 3600),
    },
  } as const;
}
