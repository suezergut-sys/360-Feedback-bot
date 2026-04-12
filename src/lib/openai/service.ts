import { z } from "zod";
import { getOpenAiClient, OPENAI_MODELS } from "@/lib/openai/client";
import { withOpenAiRetry } from "@/lib/openai/retry";
import {
  competencyReportSchema,
  extractionResultSchema,
  overallReportSchema,
  type CompetencyReportResult,
  type ExtractionResult,
  type OverallReportResult,
} from "@/lib/validators/analysis";
import { logger } from "@/lib/logging/logger";

const interviewDecisionSchema = z.object({
  next_question: z.string().min(5),
  advance_step: z.boolean(),
  move_next_competency: z.boolean(),
  finish_interview: z.boolean().default(false),
  step_name: z.string().min(2),
});

type InterviewHistoryItem = {
  sender: "respondent" | "assistant";
  text: string;
};

type InterviewRequest = {
  systemPrompt: string;
  history: InterviewHistoryItem[];
};

export type InterviewDecision = z.infer<typeof interviewDecisionSchema>;

function extractJsonText(text: string): unknown {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in model output");
  }

  return JSON.parse(trimmed.slice(start, end + 1));
}

async function callJsonMode<T>(params: {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  schema: z.ZodType<T>;
}): Promise<T> {
  const client = getOpenAiClient();

  const response = await withOpenAiRetry(() =>
    client.chat.completions.create({
      model: params.model,
      temperature: 0.2,
      messages: [
        { role: "system", content: params.systemPrompt },
        { role: "user", content: params.userPrompt },
      ],
      response_format: { type: "json_object" },
    }),
  );

  const text = response.choices[0]?.message?.content;

  if (!text) {
    throw new Error("Empty model response");
  }

  const raw = extractJsonText(text);
  return params.schema.parse(raw);
}

export async function generateInterviewDecision(input: InterviewRequest): Promise<InterviewDecision> {
  const historyText = input.history
    .slice(-10)
    .map((item) => `${item.sender === "respondent" ? "Респондент" : "Интервьюер"}: ${item.text}`)
    .join("\n");

  const userPrompt = [
    "Ниже история диалога. Сформируй следующий вопрос и решение по переходу этапов.",
    "Верни JSON с полями: next_question, advance_step, move_next_competency, finish_interview, step_name.",
    "Старайся задавать короткий и конкретный следующий вопрос.",
    "История:",
    historyText || "(история пока пустая)",
  ].join("\n\n");

  try {
    const parsed = await callJsonMode({
      model: OPENAI_MODELS.interview,
      systemPrompt: input.systemPrompt,
      userPrompt,
      schema: interviewDecisionSchema,
    });

    return {
      ...parsed,
      finish_interview: parsed.finish_interview ?? false,
    };
  } catch (error) {
    logger.warn("Interview decision fallback was used", {
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      next_question: "Можете привести конкретный пример из недавней рабочей ситуации?",
      advance_step: true,
      move_next_competency: false,
      finish_interview: false,
      step_name: "fallback_followup",
    };
  }
}

export async function extractCompetencyFeedback(params: {
  systemPrompt: string;
  userPrompt: string;
}): Promise<ExtractionResult> {
  const parsed = await callJsonMode({
    model: OPENAI_MODELS.extraction,
    systemPrompt: params.systemPrompt,
    userPrompt: params.userPrompt,
    schema: extractionResultSchema,
  });

  return {
    ...parsed,
    evidence: parsed.evidence ?? [],
    strengths: parsed.strengths ?? [],
    growth_areas: parsed.growth_areas ?? [],
    examples: parsed.examples ?? [],
    specificity: parsed.specificity ?? "medium",
  };
}

export async function generateCompetencyReport(params: {
  systemPrompt: string;
  userPrompt: string;
}): Promise<CompetencyReportResult> {
  const parsed = await callJsonMode({
    model: OPENAI_MODELS.report,
    systemPrompt: params.systemPrompt,
    userPrompt: params.userPrompt,
    schema: competencyReportSchema,
  });

  return {
    ...parsed,
    strengths: parsed.strengths ?? [],
    growth_areas: parsed.growth_areas ?? [],
    behavior_patterns: parsed.behavior_patterns ?? [],
    examples: parsed.examples ?? [],
    conflicting_signals: parsed.conflicting_signals ?? [],
    recommendations: parsed.recommendations ?? [],
  };
}

export async function generateAiAnalysis(params: {
  systemPrompt: string;
  userPrompt: string;
}): Promise<string> {
  const client = getOpenAiClient();

  const response = await withOpenAiRetry(() =>
    client.chat.completions.create({
      model: OPENAI_MODELS.report,
      temperature: 0.3,
      messages: [
        { role: "system", content: params.systemPrompt },
        { role: "user", content: params.userPrompt },
      ],
    }),
  );

  const text = response.choices[0]?.message?.content;
  if (!text) throw new Error("Empty AI analysis response");
  return text;
}

export async function generateOverallReport(params: {
  systemPrompt: string;
  userPrompt: string;
}): Promise<OverallReportResult> {
  const parsed = await callJsonMode({
    model: OPENAI_MODELS.report,
    systemPrompt: params.systemPrompt,
    userPrompt: params.userPrompt,
    schema: overallReportSchema,
  });

  return {
    ...parsed,
    key_strengths: parsed.key_strengths ?? [],
    key_development_areas: parsed.key_development_areas ?? [],
    repeated_themes: parsed.repeated_themes ?? [],
    blind_spots: parsed.blind_spots ?? [],
    near_term_recommendations: parsed.near_term_recommendations ?? [],
  };
}
