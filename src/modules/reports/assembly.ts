import type { CompetencyFeedback, Competency, Respondent } from "@prisma/client";

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

// ─── Visual report helpers ────────────────────────────────────────────────────

export type RespondentRole = "self" | "manager" | "colleague" | "client";

export type FeedbackClassification = "strength" | "development" | "both" | "none";

export function classifyFeedback(fb: { strengthsText: string; growthAreasText: string }): FeedbackClassification {
  const hasStrength = fb.strengthsText.trim().length > 0;
  const hasGrowth = fb.growthAreasText.trim().length > 0;
  if (hasStrength && hasGrowth) return "both";
  if (hasStrength) return "strength";
  if (hasGrowth) return "development";
  return "none";
}

type RespondentWithRole = Pick<Respondent, "id" | "displayName" | "role" | "position" | "department" | "status">;

// Rating from button presses (1–5 or null = N/A)
export type RatingRow = {
  respondentId: string;
  competencyId: string;
  rating: number | null;
};

// Open question answer (competencyId = null messages)
export type OpenAnswerRow = {
  respondentId: string;
  text: string;
};

type CompetencyRow = Pick<Competency, "id" | "name" | "description" | "groupName" | "priorityOrder" | "behavioralMarkers">;

export type VisualCompetencyData = {
  id: string;
  name: string;
  description: string;
  behavioralMarkers: string[];
  totalDevelopment: number;
  totalStrength: number;
  byRole: Record<RespondentRole, { development: number; strength: number; respondentCount: number }>;
};

export type VisualReportGroup = {
  groupName: string;
  competencies: VisualCompetencyData[];
};

export type OpenAnswerEntry = {
  respondentName: string;
  role: RespondentRole;
  // answers in order: strengths, growth, stop, other
  answers: string[];
};

export type VisualReportData = {
  subject: { name: string; surveyTitle: string };
  experts: Array<{ displayName: string; role: RespondentRole; position: string | null; department: string | null; status: string }>;
  competencyGroups: VisualReportGroup[];
  top5Development: Array<{ name: string; count: number }>;
  top5Strength: Array<{ name: string; count: number }>;
  openQuestionAnswers: OpenAnswerEntry[];
};

// Classify a numeric rating into strength / development / neutral
function classifyRating(rating: number | null): "strength" | "development" | "neutral" {
  if (rating === null) return "neutral";
  if (rating >= 4) return "strength";
  if (rating <= 2) return "development";
  return "neutral";
}

export function buildVisualReportData(
  subject: { name: string; title: string },
  competencies: CompetencyRow[],
  respondents: RespondentWithRole[],
  allRatings: RatingRow[],
  openAnswersByRespondent: Map<string, string[]>,
): VisualReportData {
  const ALL_ROLES: RespondentRole[] = ["self", "manager", "colleague", "client"];

  const respondentById = new Map(respondents.map((r) => [r.id, r]));

  const emptyByRole = (): Record<RespondentRole, { development: number; strength: number; respondentCount: number }> => ({
    self: { development: 0, strength: 0, respondentCount: 0 },
    manager: { development: 0, strength: 0, respondentCount: 0 },
    colleague: { development: 0, strength: 0, respondentCount: 0 },
    client: { development: 0, strength: 0, respondentCount: 0 },
  });

  const sorted = [...competencies].sort((a, b) => a.priorityOrder - b.priorityOrder);

  const competencyDataList: VisualCompetencyData[] = sorted.map((comp) => {
    const compRatings = allRatings.filter((r) => r.competencyId === comp.id);
    const byRole = emptyByRole();

    for (const ratingRow of compRatings) {
      const respondent = respondentById.get(ratingRow.respondentId);
      if (!respondent) continue;
      const role = respondent.role as RespondentRole;
      const classification = classifyRating(ratingRow.rating);

      byRole[role].respondentCount += 1;
      if (classification === "strength") byRole[role].strength += 1;
      if (classification === "development") byRole[role].development += 1;
    }

    const totalStrength = ALL_ROLES.reduce((s, r) => s + byRole[r].strength, 0);
    const totalDevelopment = ALL_ROLES.reduce((s, r) => s + byRole[r].development, 0);

    const markers = Array.isArray(comp.behavioralMarkers)
      ? (comp.behavioralMarkers as string[])
      : [];

    return {
      id: comp.id,
      name: comp.name,
      description: comp.description,
      behavioralMarkers: markers,
      totalDevelopment,
      totalStrength,
      byRole,
    };
  });

  // Group competencies
  const groupMap = new Map<string, VisualCompetencyData[]>();
  for (const comp of competencyDataList) {
    const compDef = sorted.find((c) => c.id === comp.id)!;
    const groupName = compDef.groupName ?? "Компетенции";
    if (!groupMap.has(groupName)) groupMap.set(groupName, []);
    groupMap.get(groupName)!.push(comp);
  }

  const competencyGroups: VisualReportGroup[] = Array.from(groupMap.entries()).map(([groupName, comps]) => ({
    groupName,
    competencies: comps,
  }));

  // Top-5
  const top5Development = [...competencyDataList]
    .sort((a, b) => b.totalDevelopment - a.totalDevelopment)
    .slice(0, 5)
    .filter((c) => c.totalDevelopment > 0)
    .map((c) => ({ name: c.name, count: c.totalDevelopment }));

  const top5Strength = [...competencyDataList]
    .sort((a, b) => b.totalStrength - a.totalStrength)
    .slice(0, 5)
    .filter((c) => c.totalStrength > 0)
    .map((c) => ({ name: c.name, count: c.totalStrength }));

  const experts = respondents.map((r) => ({
    displayName: r.displayName ?? "Без имени",
    role: r.role as RespondentRole,
    position: r.position,
    department: r.department,
    status: r.status,
  }));

  // Open question answers grouped by respondent
  const openQuestionAnswers: OpenAnswerEntry[] = respondents
    .filter((r) => openAnswersByRespondent.has(r.id))
    .map((r) => ({
      respondentName: r.displayName ?? "Без имени",
      role: r.role as RespondentRole,
      answers: openAnswersByRespondent.get(r.id) ?? [],
    }));

  return {
    subject: { name: subject.name, surveyTitle: subject.title },
    experts,
    competencyGroups,
    top5Development,
    top5Strength,
    openQuestionAnswers,
  };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

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
