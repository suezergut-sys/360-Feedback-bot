import type { CompetencyFeedback, Competency } from "@prisma/client";

export type AggregatedCompetencyInput = {
  competency: Pick<Competency, "id" | "name" | "description">;
  feedback: Pick<
    CompetencyFeedback,
    "evidenceSummary" | "strengthsText" | "growthAreasText" | "examplesText" | "confidenceScore" | "payloadJson"
  >[];
};

export function assembleCompetencyAggregate(input: AggregatedCompetencyInput) {
  const evidence = input.feedback.flatMap((item) => splitLines(item.evidenceSummary));
  const strengths = input.feedback.flatMap((item) => splitLines(item.strengthsText));
  const growthAreas = input.feedback.flatMap((item) => splitLines(item.growthAreasText));
  const examples = input.feedback.flatMap((item) => splitLines(item.examplesText));

  return {
    competencyId: input.competency.id,
    competencyName: input.competency.name,
    competencyDescription: input.competency.description,
    respondentCount: input.feedback.length,
    evidence: dedupe(evidence),
    strengths: dedupe(strengths),
    growthAreas: dedupe(growthAreas),
    examples: dedupe(examples),
    averageConfidence:
      input.feedback.length === 0
        ? 0
        : Number((input.feedback.reduce((acc, item) => acc + item.confidenceScore, 0) / input.feedback.length).toFixed(3)),
  };
}

export function assembleOverallThemes(aggregates: ReturnType<typeof assembleCompetencyAggregate>[]) {
  return {
    competencies: aggregates.map((aggregate) => ({
      competency_name: aggregate.competencyName,
      strengths: aggregate.strengths,
      growth_areas: aggregate.growthAreas,
      repeated_signals: aggregate.evidence,
      examples: aggregate.examples,
      average_confidence: aggregate.averageConfidence,
      respondent_count: aggregate.respondentCount,
    })),
  };
}

export function competencyReportToMarkdown(payload: {
  competency_name: string;
  short_summary: string;
  strengths: string[];
  growth_areas: string[];
  behavior_patterns: string[];
  examples: string[];
  conflicting_signals: string[];
  recommendations: string[];
  data_completeness: string;
  confidence_level: number;
}): string {
  return [
    `## ${payload.competency_name}`,
    "",
    payload.short_summary,
    "",
    "### Сильные стороны",
    ...renderBullets(payload.strengths),
    "",
    "### Зоны роста",
    ...renderBullets(payload.growth_areas),
    "",
    "### Наблюдаемые паттерны",
    ...renderBullets(payload.behavior_patterns),
    "",
    "### Примеры",
    ...renderBullets(payload.examples),
    "",
    "### Противоречивые сигналы",
    ...renderBullets(payload.conflicting_signals),
    "",
    "### Рекомендации",
    ...renderBullets(payload.recommendations),
    "",
    `Полнота данных: ${payload.data_completeness}`,
    `Уверенность: ${payload.confidence_level}`,
  ].join("\n");
}

export function overallReportToMarkdown(payload: {
  executive_summary: string;
  key_strengths: string[];
  key_development_areas: string[];
  repeated_themes: string[];
  blind_spots: string[];
  near_term_recommendations: string[];
  confidence_level: number;
}): string {
  return [
    "## Общий отчет кампании",
    "",
    payload.executive_summary,
    "",
    "### Ключевые сильные стороны",
    ...renderBullets(payload.key_strengths),
    "",
    "### Ключевые зоны развития",
    ...renderBullets(payload.key_development_areas),
    "",
    "### Повторяющиеся темы",
    ...renderBullets(payload.repeated_themes),
    "",
    "### Возможные слепые зоны",
    ...renderBullets(payload.blind_spots),
    "",
    "### Рекомендации на ближайший период",
    ...renderBullets(payload.near_term_recommendations),
    "",
    `Уверенность: ${payload.confidence_level}`,
  ].join("\n");
}

function splitLines(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function dedupe(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function renderBullets(items: string[]): string[] {
  if (items.length === 0) {
    return ["- Нет данных"];
  }

  return items.map((item) => `- ${item}`);
}
