import { NextResponse } from "next/server";
import { requireEnv } from "@/lib/env";
import { processDueJobs } from "@/lib/jobs/processor";

export const runtime = "nodejs";

function isCronAuthorized(request: Request) {
  const auth = request.headers.get("authorization");
  const expected = `Bearer ${requireEnv("CRON_SECRET")}`;

  return auth === expected;
}

export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const result = await processDueJobs(15);
  return NextResponse.json({ ok: true, ...result });
}
