import { CampaignStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { campaignInputSchema, type CampaignInput } from "@/lib/validators/campaign";
import { COMPETENCY_TEMPLATES } from "@/data/competency-templates";

type CampaignCreatePayload = CampaignInput & {
  welcomeMessage: string;
  closingMessage: string;
};

export async function listCampaigns(ownerAdminId: string) {
  return prisma.campaign.findMany({
    where: { ownerAdminId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: {
          respondents: true,
          sessions: true,
        },
      },
    },
  });
}

export async function getCampaignForAdmin(campaignId: string, ownerAdminId: string) {
  return prisma.campaign.findFirst({
    where: { id: campaignId, ownerAdminId },
    include: {
      competencies: {
        orderBy: { priorityOrder: "asc" },
      },
      respondents: {
        orderBy: { createdAt: "desc" },
      },
      sessions: true,
      reports: {
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

export async function createCampaign(ownerAdminId: string, payload: CampaignCreatePayload) {
  const { welcomeMessage, closingMessage, ...rest } = payload;
  const data = campaignInputSchema.parse(rest);

  return prisma.campaign.create({
    data: {
      ownerAdminId,
      ...data,
      welcomeMessage,
      closingMessage,
      competencies: {
        create: COMPETENCY_TEMPLATES.map((t) => ({
          name: t.name,
          description: t.description,
          groupName: t.groupName,
          priorityOrder: t.priorityOrder,
          behavioralMarkers: [],
          enabled: true,
        })),
      },
    },
  });
}

export async function updateCampaign(campaignId: string, ownerAdminId: string, payload: CampaignInput) {
  const data = campaignInputSchema.parse(payload);

  return prisma.campaign.updateMany({
    where: { id: campaignId, ownerAdminId },
    data,
  });
}

export async function updateCampaignStatus(campaignId: string, ownerAdminId: string, status: CampaignStatus) {
  return prisma.campaign.updateMany({
    where: { id: campaignId, ownerAdminId },
    data: { status },
  });
}

export async function getCampaignProgress(campaignId: string, ownerAdminId: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, ownerAdminId },
    include: {
      respondents: {
        select: { id: true, status: true },
      },
      sessions: {
        select: { id: true, completedAt: true, lastActivityAt: true, startedAt: true },
      },
      competencies: {
        where: { enabled: true },
        select: { id: true },
      },
    },
  });

  if (!campaign) {
    return null;
  }

  const invited = campaign.respondents.filter((r) => r.status === "invited").length;
  const started = campaign.respondents.filter((r) => r.status === "started").length;
  const completed = campaign.respondents.filter((r) => r.status === "completed").length;

  return {
    campaign,
    stats: {
      invited,
      started,
      completed,
      totalRespondents: campaign.respondents.length,
      totalCompetencies: campaign.competencies.length,
    },
  };
}

export async function listCampaignRawMessages(campaignId: string, ownerAdminId: string) {
  return prisma.message.findMany({
    where: {
      session: {
        campaignId,
        campaign: {
          ownerAdminId,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    include: {
      session: {
        include: {
          respondent: true,
        },
      },
      competency: true,
    },
    take: 400,
  });
}

export async function findCampaignByRespondentToken(token: string) {
  return prisma.respondent.findUnique({
    where: { inviteToken: token },
    include: {
      campaign: {
        include: {
          competencies: {
            where: { enabled: true },
            orderBy: { priorityOrder: "asc" },
          },
        },
      },
    },
  });
}

export async function deleteCampaign(campaignId: string, ownerAdminId: string) {
  return prisma.campaign.deleteMany({
    where: { id: campaignId, ownerAdminId },
  });
}

export async function findRespondentByTelegramUserId(telegramUserId: bigint) {
  return prisma.respondent.findFirst({
    where: { telegramUserId },
    include: {
      campaign: {
        include: {
          competencies: {
            where: { enabled: true },
            orderBy: { priorityOrder: "asc" },
          },
        },
      },
    },
  });
}

export type CampaignWithRelations = Prisma.CampaignGetPayload<{
  include: {
    competencies: true;
    respondents: true;
    sessions: true;
    reports: true;
  };
}>;
