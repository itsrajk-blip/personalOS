import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/auth/", "/api/cron/", "/manifest.webmanifest", "/sw.js", "/icons/"];

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (PUBLIC_PATHS.some((p) => path.startsWith(p))) return NextResponse.next();
  if (process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_USER_ID) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(toSet) {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // Refreshes the session cookie when needed.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (path.startsWith("/api/")) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|ico|webmanifest)$).*)"],
};
