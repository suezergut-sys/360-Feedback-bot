import { ReportType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  extractCompetencyFeedback,
  generateCompetencyReport,
  generateOverallReport,
} from "@/lib/openai/service";
import { logger } from "@/lib/logging/logger";
import {
  buildCompetencyReportPrompt,
  buildExtractionPrompt,
  buildOverallReportPrompt,
} from "@/prompts/analysis";
import {
  assembleCompetencyAggregate,
  assembleOverallThemes,
  competencyReportToMarkdown,
  overallReportToMarkdown,
} from "@/modules/reports/assembly";

const EXTRACTION_SYSTEM_PROMPT = [
  "Ты анализируешь ответы респондента для 360 обратной связи.",
  "Возвращай только валидный JSON согласно указанной структуре.",
  "Не добавляй факты, которых нет в тексте.",
].join("\n");

const REPORT_SYSTEM_PROMPT = [
  "Ты составляешь качественный управленческий отчет по 360 обратной связи.",
  "Возвращай только валидный JSON по требуемой структуре.",
  "Соблюдай нейтральный тон и опирайся только на входные данные.",
].join("\n");

async function getNextReportVersion(campaignId: string, reportType: ReportType, competencyId?: string | null) {
  const latest = await prisma.analysisReport.findFirst({
    where: {
      campaignId,
      reportType,
      competencyId: competencyId ?? null,
    },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  return (latest?.version ?? 0) + 1;
}

export async function runExtractionForRespondent(campaignId: string, respondentId: string): Promise<void> {
  const [competencies, session] = await Promise.all([
    prisma.competency.findMany({
      where: { campaignId, enabled: true },
      orderBy: { priorityOrder: "asc" },
    }),
    prisma.interviewSession.findUnique({
      where: {
        campaignId_respondentId: {
          campaignId,
          respondentId,
        },
      },
      include: {
        messages: {
          where: { senderType: "respondent" },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
  ]);

  if (!session) {
    return;
  }

  for (const competency of competencies) {
    const competencyMessages = session.messages.filter((message) => message.competencyId === competency.id);

    if (competencyMessages.length === 0) {
      continue;
    }

    const transcript = competencyMessages
      .map((message) => `- ${message.transcriptText ?? message.rawText ?? ""}`)
      .join("\n");

    const extracted = await extractCompetencyFeedback({
      systemPrompt: EXTRACTION_SYSTEM_PROMPT,
      userPrompt: buildExtractionPrompt(competency, transcript),
    });

    await prisma.competencyFeedback.upsert({
      where: {
        campaignId_respondentId_competencyId: {
          campaignId,
          respondentId,
          competencyId: competency.id,
        },
      },
      update: {
        evidenceSummary: extracted.evidence.join("\n"),
        strengthsText: extracted.strengths.join("\n"),
        growthAreasText: extracted.growth_areas.join("\n"),
        examplesText: extracted.examples.join("\n"),
        confidenceScore: extracted.confidence,
        sourceMessageIds: competencyMessages.map((message) => message.id),
        payloadJson: extracted,
      },
      create: {
        campaignId,
        respondentId,
        competencyId: competency.id,
        evidenceSummary: extracted.evidence.join("\n"),
        strengthsText: extracted.strengths.join("\n"),
        growthAreasText: extracted.growth_areas.join("\n"),
        examplesText: extracted.examples.join("\n"),
        confidenceScore: extracted.confidence,
        sourceMessageIds: competencyMessages.map((message) => message.id),
        payloadJson: extracted,
      },
    });
  }
}

export async function generateReportsForCampaign(campaignId: string): Promise<void> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      competencies: {
        where: { enabled: true },
        orderBy: { priorityOrder: "asc" },
      },
    },
  });

  if (!campaign) {
    return;
  }

  const allFeedback = await prisma.competencyFeedback.findMany({
    where: { campaignId },
    include: { competency: true },
  });

  const aggregates = campaign.competencies.map((competency) =>
    assembleCompetencyAggregate({
      competency,
      feedback: allFeedback.filter((item) => item.competencyId === competency.id),
    }),
  );

  for (const aggregate of aggregates) {
    const competencyReport = await generateCompetencyReport({
      systemPrompt: REPORT_SYSTEM_PROMPT,
      userPrompt: buildCompetencyReportPrompt(aggregate.competencyName, JSON.stringify(aggregate)),
    });

    const version = await getNextReportVersion(campaignId, ReportType.competency, aggregate.competencyId);

    await prisma.analysisReport.create({
      data: {
        campaignId,
        reportType: ReportType.competency,
        competencyId: aggregate.competencyId,
        contentMarkdown: competencyReportToMarkdown(competencyReport),
        contentJson: competencyReport,
        version,
      },
    });
  }

  const overallInput = assembleOverallThemes(aggregates);
  const overallReport = await generateOverallReport({
    systemPrompt: REPORT_SYSTEM_PROMPT,
    userPrompt: buildOverallReportPrompt(JSON.stringify(overallInput)),
  });

  const overallVersion = await getNextReportVersion(campaignId, ReportType.overall, null);

  await prisma.analysisReport.create({
    data: {
      campaignId,
      reportType: ReportType.overall,
      competencyId: null,
      contentMarkdown: overallReportToMarkdown(overallReport),
      contentJson: overallReport,
      version: overallVersion,
    },
  });

  logger.info("Reports generated", {
    campaignId,
    competenciesProcessed: aggregates.length,
    overallVersion,
  });
}

export async function listReportsForCampaign(campaignId: string) {
  return prisma.analysisReport.findMany({
    where: { campaignId },
    include: { competency: true },
    orderBy: [{ reportType: "asc" }, { createdAt: "desc" }],
  });
}
