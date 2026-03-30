import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { ADMIN_SESSION_COOKIE } from "@/lib/auth/session";
import { env, requireEnv } from "@/lib/env";

const protectedPrefixes = ["/campaigns"];
const publicPaths = ["/login", "/api/telegram/webhook", "/api/health", "/api/cron/jobs"];

async function isValidAdminToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, new TextEncoder().encode(requireEnv("AUTH_SECRET")), {
      algorithms: ["HS256"],
    });

    return true;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (publicPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  if (pathname === "/") {
    const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;

    if (!token || !(await isValidAdminToken(token))) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    return NextResponse.redirect(new URL("/campaigns", request.url));
  }

  if (protectedPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;

    if (!token || !(await isValidAdminToken(token))) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/campaigns/:path*", "/login", "/api/:path*"],
};
