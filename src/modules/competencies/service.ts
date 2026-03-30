import { prisma } from "@/lib/db/prisma";
import { competencyInputSchema, type CompetencyInput } from "@/lib/validators/competency";

export async function listCompetencies(campaignId: string) {
  return prisma.competency.findMany({
    where: { campaignId },
    orderBy: { priorityOrder: "asc" },
  });
}

export async function createCompetency(campaignId: string, payload: CompetencyInput) {
  const data = competencyInputSchema.parse(payload);

  return prisma.competency.create({
    data: {
      campaignId,
      ...data,
      behavioralMarkers: data.behavioralMarkers,
    },
  });
}

export async function updateCompetency(competencyId: string, campaignId: string, payload: CompetencyInput) {
  const data = competencyInputSchema.parse(payload);

  return prisma.competency.updateMany({
    where: { id: competencyId, campaignId },
    data: {
      name: data.name,
      description: data.description,
      behavioralMarkers: data.behavioralMarkers,
      priorityOrder: data.priorityOrder,
      enabled: data.enabled,
    },
  });
}

export async function toggleCompetency(campaignId: string, competencyId: string, enabled: boolean) {
  return prisma.competency.updateMany({
    where: { id: competencyId, campaignId },
    data: { enabled },
  });
}

export async function deleteCompetency(campaignId: string, competencyId: string) {
  return prisma.competency.deleteMany({
    where: { id: competencyId, campaignId },
  });
}
