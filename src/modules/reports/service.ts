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

function fallbackExtraction(competencyName: string, transcript: string) {
  const lines = transcript
    .split("\n")
    .map((line) => line.replace(/^-+\s*/, "").trim())
    .filter(Boolean);

  const evidence = lines.slice(0, 5);

  return {
    competency_name: competencyName,
    evidence: evidence.length > 0 ? evidence : ["Недостаточно данных для уверенного вывода."],
    strengths: evidence.length > 0 ? [evidence[0]] : [],
    growth_areas: evidence.length > 1 ? [evidence[evidence.length - 1]] : [],
    examples: evidence.slice(0, 2),
    specificity: "low" as const,
    confidence: 0.35,
  };
}

function fallbackCompetencyReport(aggregate: {
  competencyName: string;
  strengths: string[];
  growthAreas: string[];
  evidence: string[];
  examples: string[];
  averageConfidence: number;
  respondentCount: number;
}) {
  return {
    competency_name: aggregate.competencyName,
    short_summary: `Собрано ${aggregate.respondentCount} источников обратной связи по компетенции "${aggregate.competencyName}".`,
    strengths: aggregate.strengths.slice(0, 5),
    growth_areas: aggregate.growthAreas.slice(0, 5),
    behavior_patterns: aggregate.evidence.slice(0, 6),
    examples: aggregate.examples.slice(0, 5),
    conflicting_signals: [],
    recommendations: [
      "Продолжить сбор наблюдений для повышения достоверности.",
      "Проверить динамику по компетенции на следующем цикле 360.",
    ],
    data_completeness: aggregate.respondentCount >= 3 ? ("medium" as const) : ("low" as const),
    confidence_level: Math.max(0.3, aggregate.averageConfidence || 0.3),
  };
}

function fallbackOverallReport(aggregates: Array<ReturnType<typeof assembleCompetencyAggregate>>) {
  const topStrengths = aggregates.flatMap((item) => item.strengths).slice(0, 7);
  const topGrowth = aggregates.flatMap((item) => item.growthAreas).slice(0, 7);
  const themes = aggregates.flatMap((item) => item.evidence).slice(0, 8);

  return {
    executive_summary: "Отчет сформирован на основе текущего объема качественной обратной связи.",
    key_strengths: topStrengths.length > 0 ? topStrengths : ["Недостаточно данных"],
    key_development_areas: topGrowth.length > 0 ? topGrowth : ["Недостаточно данных"],
    repeated_themes: themes.length > 0 ? themes : ["Повторяющиеся темы пока не выявлены"],
    blind_spots: ["Часть компетенций может требовать дополнительного сбора примеров."],
    near_term_recommendations: [
      "Провести follow-up беседы по ключевым зонам роста.",
      "Повторить цикл 360 после внедрения изменений.",
    ],
    confidence_level: 0.45,
  };
}

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

    let extracted;
    try {
      extracted = await extractCompetencyFeedback({
        systemPrompt: EXTRACTION_SYSTEM_PROMPT,
        userPrompt: buildExtractionPrompt(competency, transcript),
      });
    } catch {
      extracted = fallbackExtraction(competency.name, transcript);
    }

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
    let competencyReport;
    try {
      competencyReport = await generateCompetencyReport({
        systemPrompt: REPORT_SYSTEM_PROMPT,
        userPrompt: buildCompetencyReportPrompt(aggregate.competencyName, JSON.stringify(aggregate)),
      });
    } catch {
      competencyReport = fallbackCompetencyReport(aggregate);
    }

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
  let overallReport;
  try {
    overallReport = await generateOverallReport({
      systemPrompt: REPORT_SYSTEM_PROMPT,
      userPrompt: buildOverallReportPrompt(JSON.stringify(overallInput)),
    });
  } catch {
    overallReport = fallbackOverallReport(aggregates);
  }

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
