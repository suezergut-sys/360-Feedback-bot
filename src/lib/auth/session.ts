import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { env, requireEnv } from "@/lib/env";

const encoder = new TextEncoder();

function getSecret() {
  return encoder.encode(requireEnv("AUTH_SECRET"));
}

export const ADMIN_SESSION_COOKIE = "admin_session";

export type AdminSession = {
  adminId: string;
  email: string;
  name: string;
};

type SessionPayload = AdminSession & {
  iat?: number;
  exp?: number;
};

export async function signAdminSession(session: AdminSession): Promise<string> {
  return new SignJWT(session)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function verifyAdminSession(token: string): Promise<SessionPayload | null> {
  try {
    const result = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
    const payload = result.payload as SessionPayload;

    if (!payload.adminId || !payload.email) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export async function getAdminSessionFromCookies(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  return verifyAdminSession(token);
}

export async function setAdminSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearAdminSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_SESSION_COOKIE);
}
