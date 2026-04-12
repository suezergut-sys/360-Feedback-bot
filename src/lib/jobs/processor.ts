import { JobStatus, type Job } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { acquireSoftLock, releaseSoftLock } from "@/lib/kv/locks";
import { fetchDuePendingJobs } from "@/lib/jobs/queue";
import { logger } from "@/lib/logging/logger";
import { generateReportsForCampaign, runExtractionForRespondent, generateAndSaveAiAnalysis } from "@/modules/reports/service";
import { sendTelegramMessage } from "@/lib/telegram/client";
import { env } from "@/lib/env";

const MAX_ATTEMPTS = 5;

function backoffMinutes(attempt: number): number {
  return Math.min(60, 2 ** attempt);
}

async function markJobRunning(jobId: string): Promise<boolean> {
  const result = await prisma.job.updateMany({
    where: {
      id: jobId,
      status: JobStatus.pending,
    },
    data: {
      status: JobStatus.running,
      attempts: {
        increment: 1,
      },
    },
  });

  return result.count === 1;
}

async function markJobCompleted(jobId: string) {
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: JobStatus.completed,
      lastError: null,
    },
  });
}

async function markJobFailedOrRetry(job: Job, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const shouldFail = job.attempts + 1 >= MAX_ATTEMPTS;

  await prisma.job.update({
    where: { id: job.id },
    data: {
      status: shouldFail ? JobStatus.failed : JobStatus.pending,
      runAt: shouldFail
        ? job.runAt
        : new Date(Date.now() + backoffMinutes(job.attempts + 1) * 60 * 1000),
      lastError: message.slice(0, 2000),
    },
  });

  logger.error("Job processing failed", {
    jobId: job.id,
    type: job.type,
    attempts: job.attempts + 1,
    shouldFail,
    error: message,
  });
}

async function processSingleJob(job: Job): Promise<void> {
  const payload = (job.payloadJson ?? {}) as Record<string, unknown>;

  if (job.type === "extract_feedback") {
    const campaignId = String(payload.campaignId ?? "");
    const respondentId = String(payload.respondentId ?? "");

    if (!campaignId || !respondentId) {
      throw new Error("extract_feedback payload is invalid");
    }

    await runExtractionForRespondent(campaignId, respondentId);
    return;
  }

  if (job.type === "generate_reports") {
    const campaignId = String(payload.campaignId ?? "");

    if (!campaignId) {
      throw new Error("generate_reports payload is invalid");
    }

    const lockKey = `report:${campaignId}`;
    const locked = await acquireSoftLock(lockKey, 120);

    if (!locked) {
      throw new Error("report generation lock not acquired");
    }

    try {
      await generateReportsForCampaign(campaignId);
    } finally {
      await releaseSoftLock(lockKey);
    }

    return;
  }

  if (job.type === "generate_ai_analysis") {
    const campaignId = String(payload.campaignId ?? "");

    if (!campaignId) {
      throw new Error("generate_ai_analysis payload is invalid");
    }

    await generateAndSaveAiAnalysis(campaignId);

    // Send Telegram notification to self-respondent now that analysis is ready
    try {
      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { title: true, publicReportToken: true },
      });

      if (campaign?.publicReportToken) {
        const appUrl = env.APP_BASE_URL || process.env.VERCEL_URL || "";
        const reportUrl = appUrl
          ? `${appUrl.startsWith("http") ? appUrl : `https://${appUrl}`}/api/reports/${campaign.publicReportToken}`
          : null;

        if (reportUrl) {
          const selfRespondent = await prisma.respondent.findFirst({
            where: { campaignId, role: "self", telegramUserId: { not: null } },
            select: { telegramUserId: true },
          });

          if (selfRespondent?.telegramUserId) {
            const message = [
              "Привет!",
              `Завершился опрос «${campaign.title}».`,
              `По <a href="${reportUrl}">ссылке</a> ты можешь посмотреть его результаты.`,
            ].join("\n");

            await sendTelegramMessage(selfRespondent.telegramUserId.toString(), message, "HTML");
          }
        }
      }
    } catch (err) {
      logger.warn("Failed to send completion notification after AI analysis", {
        campaignId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return;
  }

  throw new Error(`Unknown job type: ${job.type}`);
}

export async function processDueJobs(limit = 10): Promise<{ processed: number; failed: number }> {
  const dueJobs = await fetchDuePendingJobs(limit);
  let processed = 0;
  let failed = 0;

  for (const job of dueJobs) {
    const running = await markJobRunning(job.id);

    if (!running) {
      continue;
    }

    try {
      await processSingleJob(job);
      await markJobCompleted(job.id);
      processed += 1;
    } catch (error) {
      failed += 1;
      await markJobFailedOrRetry(job, error);
    }
  }

  return { processed, failed };
}
