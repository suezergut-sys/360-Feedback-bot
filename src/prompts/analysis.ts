import type { Competency } from "@prisma/client";

export function buildExtractionPrompt(competency: Pick<Competency, "name" | "description">, transcript: string): string {
  return [
    "Преобразуй обратную связь в структурированные наблюдения по компетенции.",
    "Не придумывай факты и не добавляй информацию, которой нет в тексте.",
    `Компетенция: ${competency.name}`,
    `Описание: ${competency.description}`,
    "Транскрипт и ответы:",
    transcript,
  ].join("\n\n");
}

export function buildCompetencyReportPrompt(competencyName: string, payload: string): string {
  return [
    "Собери итог по компетенции для отчета 360.",
    "Сохраняй нюансы, выделяй противоречия, не придумывай доказательства.",
    `Компетенция: ${competencyName}`,
    "Исходные агрегированные данные:",
    payload,
  ].join("\n\n");
}

export function buildOverallReportPrompt(payload: string): string {
  return [
    "Собери общий отчет кампании 360 по качественной обратной связи.",
    "Не используй числовые рейтинги, только текстовые выводы.",
    "Не раскрывай персональные данные без необходимости.",
    "Агрегированные данные:",
    payload,
  ].join("\n\n");
}
