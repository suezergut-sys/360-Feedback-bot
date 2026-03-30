import { prisma } from "@/lib/db/prisma";
import { getAdminSessionFromCookies } from "@/lib/auth/session";

export async function requireAdminForApi() {
  const session = await getAdminSessionFromCookies();

  if (!session) {
    return null;
  }

  return prisma.admin.findUnique({
    where: { id: session.adminId },
    select: { id: true, email: true, name: true },
  });
}
