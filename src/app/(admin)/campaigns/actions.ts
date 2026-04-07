"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth/admin";
import { prisma } from "@/lib/db/prisma";
import { processDueJobs } from "@/lib/jobs/processor";
import { enqueueJob } from "@/lib/jobs/queue";
import { logger } from "@/lib/logging/logger";
import { campaignInputSchema } from "@/lib/validators/campaign";
import { competencyInputSchema } from "@/lib/validators/competency";
import { respondentInputSchema } from "@/lib/validators/respondent";

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

  const campaign = await prisma.campaign.create({
    data: {
      ownerAdminId: admin.id,
      ...parsed.data,
    },
  });

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

  await prisma.campaign.updateMany({
    where: {
      id: campaignId,
      ownerAdminId: admin.id,
    },
    data: parsed.data,
  });

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
