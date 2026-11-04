import { headers } from "next/headers";
import { loginTo, REQUEST_PATH_HEADER, safeNext } from "@/lib/authEntry";

/**
 * إلى الدخول، ثمّ العودة إلى حيث كان الزائر.
 *
 * The audit of 3 November 2026 (web-flows-8; the owner's question 13): about a hundred places sent a visitor who was
 * not signed in to a bare "/login", so the link that brought them — a notification's «وقّع العقد», a page shared on
 * WhatsApp — was lost at the sign-in screen, and they landed on their home page instead of the thing they came for.
 *
 * The proxy puts the path the visitor asked for on every request (`REQUEST_PATH_HEADER`, set over anything they sent);
 * `loginHrefHere` reads it and gives the sign-in screen with it as `next`. A page writes
 * `if (!user) redirect(await loginHrefHere());` — `redirect` itself, so TypeScript still knows `user` is there after.
 * The path goes through `safeNext` like any other return path, so nothing here can send anyone off the site. For a
 * server action the request is the page the form was on, which is where they should come back to.
 */

/** The path this request was for, if it is one we may return to. */
export async function requestPath(): Promise<string | null> {
  return safeNext((await headers()).get(REQUEST_PATH_HEADER));
}

/** The sign-in screen, coming back to this request's page afterwards (or plain, when there is none to return to). */
export async function loginHrefHere(): Promise<string> {
  const here = await requestPath();
  return here ? loginTo(here) : "/login";
}
