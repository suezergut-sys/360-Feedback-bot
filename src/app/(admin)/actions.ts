"use server";

import { redirect } from "next/navigation";
import { clearAdminSessionCookie } from "@/lib/auth/session";

export async function logoutAction() {
  await clearAdminSessionCookie();
  redirect("/login");
}
