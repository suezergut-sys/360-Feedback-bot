"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth/admin";
import { prisma } from "@/lib/db/prisma";
import { createCampaign } from "@/modules/campaigns/service";
import { processDueJobs } from "@/lib/jobs/processor";
import { enqueueJob } from "@/lib/jobs/queue";
import { logger } from "@/lib/logging/logger";
import { campaignInputSchema } from "@/lib/validators/campaign";
import { competencyInputSchema } from "@/lib/validators/competency";
import { respondentInputSchema } from "@/lib/validators/respondent";
import { sendTelegramMessage } from "@/lib/telegram/client";
import { env } from "@/lib/env";
import type { RespondentRole } from "@prisma/client";

const ALL_ROLES: RespondentRole[] = ["self", "manager", "colleague", "client", "employee"];


function parseBehavioralMarkers(value: string): string[] {
  return value
    .split(/\n|,|;/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export async function createCampaignAction(formData: FormData) {
  const admin = await requireAdminSession();

  const parsed = campaignInputSchema.safeParse({
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    subjectName: String(formData.get("subjectName") ?? ""),
    status: String(formData.get("status") ?? "draft"),
    language: String(formData.get("language") ?? "ru"),
    welcomeMessage: String(formData.get("welcomeMessage") ?? ""),
    closingMessage: String(formData.get("closingMessage") ?? ""),
  });

  if (!parsed.success) {
    redirect("/campaigns/new?error=campaign_validation");
  }

  const campaign = await createCampaign(admin.id, parsed.data);

  redirect(`/campaigns/${campaign.id}/edit`);
}

export async function updateCampaignAction(formData: FormData) {
  const admin = await requireAdminSession();
  const campaignId = String(formData.get("campaignId") ?? "");

  const parsed = campaignInputSchema.safeParse({
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    subjectName: String(formData.get("subjectName") ?? ""),
    status: String(formData.get("status") ?? "draft"),
    language: String(formData.get("language") ?? "ru"),
    welcomeMessage: String(formData.get("welcomeMessage") ?? ""),
    closingMessage: String(formData.get("closingMessage") ?? ""),
  });

  if (!parsed.success) {
    redirect(`/campaigns/${campaignId}/edit?error=campaign_validation`);
  }

  // Check if status is being changed to "completed"
  const previousCampaign = await prisma.campaign.findFirst({
    where: { id: campaignId, ownerAdminId: admin.id },
    select: { status: true, publicReportToken: true, title: true },
  });

  const isCompletingNow = parsed.data.status === "completed" && previousCampaign?.status !== "completed";

  // Generate public token if completing for the first time
  const publicReportToken =
    isCompletingNow && !previousCampaign?.publicReportToken
      ? crypto.randomUUID()
      : undefined;

  await prisma.campaign.updateMany({
    where: {
      id: campaignId,
      ownerAdminId: admin.id,
    },
    data: {
      ...parsed.data,
      ...(publicReportToken ? { publicReportToken } : {}),
    },
  });

  // Send Telegram notification to self-assessment respondent when campaign completes
  if (isCompletingNow) {
    const token = publicReportToken ?? previousCampaign?.publicReportToken;
    if (token) {
      try {
        const appUrl = env.APP_BASE_URL || process.env.VERCEL_URL || "";
        const reportUrl = appUrl
          ? `${appUrl.startsWith("http") ? appUrl : `https://${appUrl}`}/api/reports/${token}`
          : null;

        if (reportUrl) {
          const selfRespondent = await prisma.respondent.findFirst({
            where: { campaignId, role: "self", telegramUserId: { not: null } },
            select: { telegramUserId: true },
          });

          if (selfRespondent?.telegramUserId) {
            const campaignTitle = previousCampaign?.title ?? parsed.data.title;
            const message = [
              "Привет!",
              `Завершился опрос «${campaignTitle}».`,
              `По <a href="${reportUrl}">ссылке</a> ты можешь посмотреть его результаты.`,
            ].join("\n");

            await sendTelegramMessage(selfRespondent.telegramUserId.toString(), message, "HTML");
          }
        }
      } catch (err) {
        logger.warn("Failed to send completion notification to self respondent", {
          campaignId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  revalidatePath(`/campaigns/${campaignId}/edit`);
  revalidatePath("/campaigns");
}

export async function createCompetencyAction(formData: FormData) {
  const admin = await requireAdminSession();
  const campaignId = String(formData.get("campaignId") ?? "");

  const campaign = await prisma.campaign.findFirst({
    where: {
      id: campaignId,
      ownerAdminId: admin.id,
    },
    select: { id: true },
  });

  if (!campaign) {
    redirect("/campaigns");
  }

  const payload = competencyInputSchema.parse({
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    behavioralMarkers: parseBehavioralMarkers(String(formData.get("behavioralMarkers") ?? "")),
    priorityOrder: Number(formData.get("priorityOrder") ?? 1),
    enabled: String(formData.get("enabled") ?? "true") === "true",
  });

  await prisma.competency.create({
    data: {
      campaignId,
      name: payload.name,
      description: payload.description,
      behavioralMarkers: payload.behavioralMarkers,
      priorityOrder: payload.priorityOrder,
      enabled: payload.enabled,
    },
  });

  revalidatePath(`/campaigns/${campaignId}/competencies`);
}

export async function updateCompetencyAction(formData: FormData) {
  const admin = await requireAdminSession();
  const campaignId = String(formData.get("campaignId") ?? "");
  const competencyId = String(formData.get("competencyId") ?? "");

  const payload = competencyInputSchema.parse({
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    behavioralMarkers: parseBehavioralMarkers(String(formData.get("behavioralMarkers") ?? "")),
    priorityOrder: Number(formData.get("priorityOrder") ?? 1),
    enabled: String(formData.get("enabled") ?? "true") === "true",
  });

  await prisma.competency.updateMany({
    where: {
      id: competencyId,
      campaignId,
      campaign: {
        ownerAdminId: admin.id,
      },
    },
    data: {
      name: payload.name,
      description: payload.description,
      behavioralMarkers: payload.behavioralMarkers,
      priorityOrder: payload.priorityOrder,
      enabled: payload.enabled,
    },
  });

  revalidatePath(`/campaigns/${campaignId}/competencies`);
}

export async function toggleCompetencyAction(formData: FormData) {
  const admin = await requireAdminSession();
  const campaignId = String(formData.get("campaignId") ?? "");
  const competencyId = String(formData.get("competencyId") ?? "");
  const enabled = String(formData.get("enabled") ?? "true") === "true";

  await prisma.competency.updateMany({
    where: {
      id: competencyId,
      campaignId,
      campaign: {
        ownerAdminId: admin.id,
      },
    },
    data: { enabled },
  });

  revalidatePath(`/campaigns/${campaignId}/competencies`);
}

export async function createRespondentAction(formData: FormData) {
  const admin = await requireAdminSession();
  const campaignId = String(formData.get("campaignId") ?? "");

  const payload = respondentInputSchema.parse({
    displayName: String(formData.get("displayName") ?? "").trim() || undefined,
    role: String(formData.get("role") ?? "colleague"),
    position: String(formData.get("position") ?? "").trim() || undefined,
    department: String(formData.get("department") ?? "").trim() || undefined,
  });

  const campaign = await prisma.campaign.findFirst({
    where: {
      id: campaignId,
      ownerAdminId: admin.id,
    },
    select: { id: true },
  });

  if (!campaign) {
    redirect("/campaigns");
  }

  await prisma.respondent.create({
    data: {
      campaignId,
      displayName: payload.displayName,
      role: payload.role,
      position: payload.position,
      department: payload.department,
      inviteToken: crypto.randomUUID(),
      status: "invited",
    },
  });

  revalidatePath(`/campaigns/${campaignId}/respondents`);
  revalidatePath(`/campaigns/${campaignId}/progress`);
}

export async function triggerAnalysisAction(formData: FormData) {
  const admin = await requireAdminSession();
  const campaignId = String(formData.get("campaignId") ?? "");

  const campaign = await prisma.campaign.findFirst({
    where: {
      id: campaignId,
      ownerAdminId: admin.id,
    },
    select: { id: true },
  });

  if (!campaign) {
    redirect("/campaigns");
  }

  const sessionsWithResponses = await prisma.interviewSession.findMany({
    where: {
      campaignId,
      messages: {
        some: {
          senderType: "respondent",
        },
      },
    },
    select: {
      respondentId: true,
    },
    distinct: ["respondentId"],
  });

  for (const session of sessionsWithResponses) {
    await enqueueJob("extract_feedback", {
      campaignId,
      respondentId: session.respondentId,
    });
  }

  await enqueueJob("generate_reports", {
    campaignId,
  });

  try {
    await processDueJobs(Math.max(10, sessionsWithResponses.length + 3));
  } catch (error) {
    logger.warn("Manual report trigger queued jobs but immediate processing failed", {
      campaignId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  revalidatePath(`/campaigns/${campaignId}/reports`);
  revalidatePath(`/campaigns/${campaignId}/responses`);
}

export async function updateRoleMessagesAction(formData: FormData) {
  const admin = await requireAdminSession();
  const campaignId = String(formData.get("campaignId") ?? "");

  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, ownerAdminId: admin.id },
    select: { id: true },
  });

  if (!campaign) {
    redirect("/campaigns");
  }

  for (const role of ALL_ROLES) {
    const greeting = String(formData.get(`greeting_${role}`) ?? "").trim() || null;
    const closing = String(formData.get(`closing_${role}`) ?? "").trim() || null;

    await prisma.campaignRoleMessage.upsert({
      where: { campaignId_role: { campaignId, role } },
      create: { campaignId, role, greetingMessage: greeting, closingMessage: closing },
      update: { greetingMessage: greeting, closingMessage: closing },
    });
  }

  revalidatePath(`/campaigns/${campaignId}/edit`);
}

export async function importRoleMessagesAction(formData: FormData) {
  const admin = await requireAdminSession();
  const campaignId = String(formData.get("campaignId") ?? "");
  const sourceCampaignId = String(formData.get("sourceCampaignId") ?? "");

  if (!sourceCampaignId || sourceCampaignId === campaignId) {
    redirect(`/campaigns/${campaignId}/edit`);
  }

  const [target, source] = await Promise.all([
    prisma.campaign.findFirst({ where: { id: campaignId, ownerAdminId: admin.id }, select: { id: true } }),
    prisma.campaign.findFirst({ where: { id: sourceCampaignId, ownerAdminId: admin.id }, select: { id: true } }),
  ]);

  if (!target || !source) {
    redirect("/campaigns");
  }

  const sourceMessages = await prisma.campaignRoleMessage.findMany({
    where: { campaignId: sourceCampaignId },
  });

  for (const msg of sourceMessages) {
    await prisma.campaignRoleMessage.upsert({
      where: { campaignId_role: { campaignId, role: msg.role } },
      create: { campaignId, role: msg.role, greetingMessage: msg.greetingMessage, closingMessage: msg.closingMessage },
      update: { greetingMessage: msg.greetingMessage, closingMessage: msg.closingMessage },
    });
  }

  revalidatePath(`/campaigns/${campaignId}/edit`);
}
