/**
 * الدخول بحساب Google أو Facebook (البند ١٥٣).
 *
 * The owner, 24 October: «أضف التسجيل بحساب جيميل وفيسبوك». Supabase signs
 * people in with either once the provider is switched on in its dashboard,
 * with the client id and secret from Google Cloud or Meta — keys the owner
 * holds and types there himself, never into a chat or this code.
 *
 * Until then a button would only lead to Supabase's «provider is not
 * enabled». So the buttons ask the project which providers are on: its public
 * settings endpoint answers that with the anon key, and a provider switched on
 * appears here within the hour with no change to the code.
 */

export const OAUTH_PROVIDERS = ["google", "facebook"] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export async function enabledProviders(): Promise<OAuthProvider[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  try {
    const res = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(4_000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { external?: Record<string, boolean> };
    return OAUTH_PROVIDERS.filter((p) => json.external?.[p] === true);
  } catch {
    // The sign-in screen must open even when this question cannot be asked.
    return [];
  }
}
