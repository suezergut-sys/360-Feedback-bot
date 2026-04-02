export const INTERVIEW_STEPS = [
  "opening",
  "example",
  "sar",
  "strengths",
  "growth",
  "more",
] as const;

export const MAX_QUESTIONS_PER_MARKER = 3;

export type InterviewStep = (typeof INTERVIEW_STEPS)[number];
export type InterviewPhase = "consent" | "interview" | "completed";

export type InterviewState = {
  phase: InterviewPhase;
  competencyIndex: number;
  stepIndex: number;
  markerIndex: number;
  markerQuestionCount: number;
  completed: boolean;
  lastQuestion?: string;
};

export function createInitialInterviewState(): InterviewState {
  return {
    phase: "consent",
    competencyIndex: 0,
    stepIndex: 0,
    markerIndex: 0,
    markerQuestionCount: 0,
    completed: false,
  };
}

export function parseInterviewState(raw: unknown): InterviewState {
  if (!raw || typeof raw !== "object") {
    return createInitialInterviewState();
  }

  const state = raw as Partial<InterviewState>;

  return {
    phase: state.phase === "interview" || state.phase === "completed" ? state.phase : "consent",
    competencyIndex: Number.isInteger(state.competencyIndex) ? Math.max(0, Number(state.competencyIndex)) : 0,
    stepIndex: Number.isInteger(state.stepIndex) ? Math.max(0, Number(state.stepIndex)) : 0,
    markerIndex: Number.isInteger(state.markerIndex) ? Math.max(0, Number(state.markerIndex)) : 0,
    markerQuestionCount: Number.isInteger(state.markerQuestionCount) ? Math.max(0, Number(state.markerQuestionCount)) : 0,
    completed: Boolean(state.completed),
    lastQuestion: typeof state.lastQuestion === "string" ? state.lastQuestion : undefined,
  };
}

export function getCurrentStep(state: InterviewState): InterviewStep {
  return INTERVIEW_STEPS[Math.min(state.stepIndex, INTERVIEW_STEPS.length - 1)];
}

export function looksLikeConsent(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  const yesWords = ["да", "согласен", "согласна", "ок", "хорошо", "начнем", "начинаем", "yes"];

  return yesWords.some((word) => normalized.includes(word));
}

export function looksLikeNoAnswer(text: string): boolean {
  const normalized = text.trim().toLowerCase();

  const noAnswerPatterns = [
    "не знаю",
    "не помню",
    "не могу вспомнить",
    "не могу сказать",
    "не могу ответить",
    "не могу привести",
    "нет примера",
    "нет ответа",
    "затрудняюсь",
    "сложно ответить",
    "ничего не приходит в голову",
    "не было случаев",
    "без комментариев",
  ];

  return noAnswerPatterns.some((pattern) => normalized.includes(pattern));
}

export function moveToNextMethodologyStep(state: InterviewState): InterviewState {
  const nextStepIndex = state.stepIndex + 1;

  if (nextStepIndex < INTERVIEW_STEPS.length) {
    return {
      ...state,
      stepIndex: nextStepIndex,
    };
  }

  return {
    ...state,
    competencyIndex: state.competencyIndex + 1,
    stepIndex: 0,
    markerIndex: 0,
    markerQuestionCount: 0,
  };
}

export function moveToNextCompetency(state: InterviewState): InterviewState {
  return {
    ...state,
    competencyIndex: state.competencyIndex + 1,
    stepIndex: 0,
    markerIndex: 0,
    markerQuestionCount: 0,
  };
}

export function moveToNextMarker(state: InterviewState): InterviewState {
  return {
    ...state,
    markerIndex: state.markerIndex + 1,
    stepIndex: 0,
    markerQuestionCount: 0,
  };
}

export function incrementMarkerQuestionCount(state: InterviewState): InterviewState {
  return {
    ...state,
    markerQuestionCount: state.markerQuestionCount + 1,
  };
}

export function resetMarkerProgress(state: InterviewState): InterviewState {
  return {
    ...state,
    markerIndex: 0,
    markerQuestionCount: 0,
  };
}

export function withInterviewStarted(state: InterviewState): InterviewState {
  return {
    ...state,
    phase: "interview",
  };
}

export function withInterviewCompleted(state: InterviewState): InterviewState {
  return {
    ...state,
    phase: "completed",
    completed: true,
  };
}

export function buildFallbackQuestion(competencyName: string, step: InterviewStep, marker?: string | null): string {
  const markerHint = marker ? ` Фокус на маркере: ${marker}.` : "";

  switch (step) {
    case "opening":
      return `Как в целом проявляется компетенция "${competencyName}" у коллеги в повседневной работе?${markerHint}`;
    case "example":
      return `Можете привести конкретный пример по "${competencyName}" за последние месяцы?${markerHint}`;
    case "sar":
      return `Уточните контекст: какая была ситуация, что сделал человек, и к какому результату это привело?${markerHint}`;
    case "strengths":
      return `Какие сильные стороны вы здесь видите?${markerHint}`;
    case "growth":
      return `Какие зоны роста вы бы выделили?${markerHint}`;
    case "more":
      return `Есть ли еще наблюдения по этой компетенции, которые важно добавить?${markerHint}`;
    default:
      return `Можете рассказать подробнее?${markerHint}`;
  }
}

export function normalizeQuestionText(text: string | undefined): string {
  if (!text) {
    return "";
  }

  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isRepeatedQuestion(previous: string | undefined, next: string | undefined): boolean {
  const prev = normalizeQuestionText(previous);
  const curr = normalizeQuestionText(next);

  if (!prev || !curr) {
    return false;
  }

  if (prev === curr) {
    return true;
  }

  if (prev.length >= 20 && curr.includes(prev)) {
    return true;
  }

  if (curr.length >= 20 && prev.includes(curr)) {
    return true;
  }

  const prevTokens = new Set(prev.split(" ").filter(Boolean));
  const currTokens = new Set(curr.split(" ").filter(Boolean));
  const minTokenCount = Math.min(prevTokens.size, currTokens.size);

  if (minTokenCount < 4) {
    return false;
  }

  let overlapCount = 0;
  for (const token of prevTokens) {
    if (currTokens.has(token)) {
      overlapCount += 1;
    }
  }

  const smallCoverage = overlapCount / minTokenCount;
  const largeCoverage = overlapCount / Math.max(prevTokens.size, currTokens.size);

  if (smallCoverage >= 0.75 && largeCoverage >= 0.5) {
    return true;
  }

  return false;
}
