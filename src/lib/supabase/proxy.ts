import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function refreshAuthSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data: claimData } = await supabase.auth.getClaims();

  if (request.nextUrl.pathname.startsWith("/commissioner/")) {
    const redirectWithCookies = (pathname: string) => {
      const redirect = NextResponse.redirect(new URL(pathname, request.url));
      response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
      return redirect;
    };
    const userId = claimData?.claims?.sub;
    if (!userId) {
      return redirectWithCookies("/login?next=%2Fcommissioner%2Finvites");
    }

    const { data: membership, error } = await supabase
      .from("league_memberships")
      .select("id")
      .eq("user_id", userId)
      .eq("role", "commissioner")
      .limit(1)
      .maybeSingle();

    if (error || !membership) {
      return redirectWithCookies("/login?error=commissioner");
    }
  }

  return response;
}
