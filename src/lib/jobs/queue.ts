import { JobStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export type JobType = "extract_feedback" | "generate_reports" | "generate_ai_analysis";

export async function enqueueJob(type: JobType, payload: Record<string, unknown>, runAt?: Date) {
  return prisma.job.create({
    data: {
      type,
      payloadJson: payload as Prisma.InputJsonValue,
      status: JobStatus.pending,
      runAt: runAt ?? new Date(),
    },
  });
}

export async function fetchDuePendingJobs(limit = 10) {
  return prisma.job.findMany({
    where: {
      status: JobStatus.pending,
      runAt: { lte: new Date() },
    },
    orderBy: [{ runAt: "asc" }, { createdAt: "asc" }],
    take: limit,
  });
}
