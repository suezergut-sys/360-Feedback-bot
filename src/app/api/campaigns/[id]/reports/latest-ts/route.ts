import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAdminSessionFromCookies } from "@/lib/auth/session";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSessionFromCookies();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;

  const campaign = await prisma.campaign.findFirst({
    where: { id, ownerAdminId: session.adminId },
    select: { id: true },
  });

  if (!campaign) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const report = await prisma.analysisReport.findFirst({
    where: { campaignId: id },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  return NextResponse.json({ ts: report?.createdAt?.toISOString() ?? null });
}
