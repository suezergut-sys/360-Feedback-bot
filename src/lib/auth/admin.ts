import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { getAdminSessionFromCookies } from "@/lib/auth/session";

export async function requireAdminSession() {
  const session = await getAdminSessionFromCookies();

  if (!session) {
    redirect("/login");
  }

  const admin = await prisma.admin.findUnique({
    where: { id: session.adminId },
    select: { id: true, email: true, name: true },
  });

  if (!admin) {
    redirect("/login");
  }

  return admin;
}
