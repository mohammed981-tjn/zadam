import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/video/")) return guardVideo(request);
  const response = await updateSession(request);
  // A signed-in person's pages carry their name and, on the home page since item 206, their seasons, money and lands.
  // The service worker (public/sw.js) keeps public pages for the field; it must never keep one of these, or the next
  // person to pick up a shared phone reads it offline. This header is how it tells them apart.
  if (hasSession(request)) response.headers.set("x-sudagri-private", "1");
  return response;
}

/** A Supabase session cookie is present (its name is sb-<project>-auth-token, possibly split into .0/.1 chunks). */
function hasSession(request: NextRequest): boolean {
  return request.cookies.getAll().some((c) => /^sb-.+-auth-token(\.\d+)?$/.test(c.name) && c.value !== "");
}

/**
 * أفلام سوداقري تُشاهَد على المنصّة لا خارجها (المالك، 3 أكتوبر: «الفيديو لا
 * يمكن تحميله من الصفحة لأيّ جهة، فينتشر حصرياً على المنصّة»).
 *
 * Nothing a browser can play can be made impossible to copy — a screen
 * recorder takes whatever is on the screen — so this closes the easy doors and
 * leaves the films branded for the rest:
 *
 *  - Opening a film's file as a page of its own (a pasted link, "open video in
 *    new tab", a download manager that fetches it as a document) is what turns
 *    it into a "Save as". Browsers mark that request `Sec-Fetch-Dest:
 *    document`; a <video> on our pages sends `video`. The document request is
 *    sent to the homepage instead.
 *  - Another site embedding our files sends its own address as the Referer;
 *    that is refused, so the films play only inside the platform.
 *
 * A request with neither header (an old browser, a privacy setting that strips
 * the Referer) still plays: a film that fails for a real visitor costs more
 * than one more way round. The session refresh is skipped — media needs none.
 */
function guardVideo(request: NextRequest) {
  if (request.headers.get("sec-fetch-dest") === "document") {
    return NextResponse.redirect(new URL("/", request.url));
  }
  const referer = request.headers.get("referer");
  if (referer) {
    let host = "";
    try {
      host = new URL(referer).host;
    } catch {
      /* an unparsable Referer is treated as foreign */
    }
    if (host !== request.nextUrl.host) return new NextResponse(null, { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  // vendor/: the map's library as it ships (scripts/vendor-maplibre.mjs), which
  // needs no session refresh any more than an image does.
  matcher: [
    "/((?!_next/static|_next/image|vendor/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
