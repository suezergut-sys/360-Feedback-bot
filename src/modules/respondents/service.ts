import crypto from "node:crypto";
import { RespondentStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { respondentInputSchema, type RespondentInput } from "@/lib/validators/respondent";

export async function listRespondents(campaignId: string) {
  return prisma.respondent.findMany({
    where: { campaignId },
    orderBy: { createdAt: "desc" },
  });
}

export async function createRespondent(campaignId: string, payload: RespondentInput) {
  const data = respondentInputSchema.parse(payload);

  return prisma.respondent.create({
    data: {
      campaignId,
      displayName: data.displayName,
      inviteToken: crypto.randomUUID(),
      status: RespondentStatus.invited,
    },
  });
}

export async function linkRespondentTelegramAccount(params: {
  respondentId: string;
  telegramUserId: bigint;
  telegramUsername?: string;
}) {
  return prisma.respondent.update({
    where: { id: params.respondentId },
    data: {
      telegramUserId: params.telegramUserId,
      telegramUsername: params.telegramUsername,
      status: RespondentStatus.started,
    },
  });
}

export async function setRespondentStatus(respondentId: string, status: RespondentStatus) {
  return prisma.respondent.update({
    where: { id: respondentId },
    data: { status },
  });
}

export async function findRespondentByToken(token: string) {
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
