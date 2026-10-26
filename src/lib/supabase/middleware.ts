import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // A temporary password the administration read out over the phone (AUTH-05) is changed before anything else: the
  // administrator knows it, so the account is not its owner's until it is. Pages only — the change itself, signing out
  // and the server's own routes pass.
  const path = request.nextUrl.pathname;
  if (
    user?.user_metadata?.must_change_password === true &&
    request.method === "GET" &&
    path !== "/account/password" &&
    !path.startsWith("/api/") &&
    !path.startsWith("/auth/")
  ) {
    const to = request.nextUrl.clone();
    to.pathname = "/account/password";
    to.search = "";
    const redirect = NextResponse.redirect(to);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  return response;
}
