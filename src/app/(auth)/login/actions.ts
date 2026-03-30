"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { setAdminSessionCookie, signAdminSession } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/security/rate-limit";

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const allowed = await checkRateLimit(`login:${email}`, 10, 60);

  if (!allowed) {
    redirect("/login?error=too_many_requests");
  }

  const admin = await prisma.admin.findUnique({ where: { email } });

  if (!admin) {
    redirect("/login?error=invalid_credentials");
  }

  const valid = await verifyPassword(password, admin.passwordHash);

  if (!valid) {
    redirect("/login?error=invalid_credentials");
  }

  const token = await signAdminSession({
    adminId: admin.id,
    email: admin.email,
    name: admin.name,
  });

  await setAdminSessionCookie(token);

  redirect("/campaigns");
}
