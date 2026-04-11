import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

/**
 * Public report route — no auth required.
 * Accessible via /api/reports/[token]
 * Delegates to the campaign HTML route with public_token param.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const campaign = await prisma.campaign.findUnique({
    where: { publicReportToken: token },
    select: { id: true },
  });

  if (!campaign) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const url = new URL(req.url);
  const target = `${url.protocol}//${url.host}/api/campaigns/${campaign.id}/reports/html?embed=1&public_token=${encodeURIComponent(token)}`;

  return NextResponse.redirect(target, { status: 307 });
}
