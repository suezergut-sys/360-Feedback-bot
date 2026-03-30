import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ ok: true, service: "360-feedback-ai-bot" });
}
