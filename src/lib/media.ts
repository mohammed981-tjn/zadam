/**
 * Public URL for an object in the `media` bucket.
 *
 * Built by hand rather than through `supabase.storage.getPublicUrl`, because
 * that needs a client and these URLs are wanted inside server components that
 * have already done their one database read. The shape is part of Supabase's
 * public API and does not change per project.
 *
 * The bucket is flagged public, so no token is involved and the URL is
 * cacheable by any CDN in front of it — which is the whole reason these images
 * live here and not in the private evidence bucket.
 */
const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

export function publicMediaUrl(path: string): string {
  return `${BASE}/storage/v1/object/public/media/${path}`;
}

/**
 * An external source link, or null.
 *
 * Only http(s) survives. A `javascript:` or `data:` URL rendered into an anchor
 * on the public canal page is stored cross-site scripting, and the credit link
 * is the one place there where an operator's free text becomes an href.
 *
 * It lives here rather than beside the action that uses it because a module
 * marked "use server" exports server actions and nothing else — a helper in one
 * becomes an endpoint, and a test importing it drags the whole action module in.
 */
export function safeSourceUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    return u.protocol === "http:" || u.protocol === "https:"
      ? u.toString()
      : null;
  } catch {
    // Not an absolute URL at all. A relative path is not a source citation.
    return null;
  }
}
