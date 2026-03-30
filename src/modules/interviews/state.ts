export const INTERVIEW_STEPS = [
  "opening",
  "example",
  "sar",
  "strengths",
  "growth",
  "more",
] as const;

export type InterviewStep = (typeof INTERVIEW_STEPS)[number];
export type InterviewPhase = "consent" | "interview" | "completed";

export type InterviewState = {
  phase: InterviewPhase;
  competencyIndex: number;
  stepIndex: number;
  completed: boolean;
  lastQuestion?: string;
};

export function createInitialInterviewState(): InterviewState {
  return {
    phase: "consent",
    competencyIndex: 0,
    stepIndex: 0,
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
    completed: Boolean(state.completed),
    lastQuestion: typeof state.lastQuestion === "string" ? state.lastQuestion : undefined,
  };
}

export function getCurrentStep(state: InterviewState): InterviewStep {
  return INTERVIEW_STEPS[Math.min(state.stepIndex, INTERVIEW_STEPS.length - 1)];
}

export function looksLikeConsent(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  const yesWords = ["да", "согласен", "согласна", "ок", "хорошо", "начнем", "начинаем"];

  return yesWords.some((word) => normalized.includes(word));
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
  };
}

export function moveToNextCompetency(state: InterviewState): InterviewState {
  return {
    ...state,
    competencyIndex: state.competencyIndex + 1,
    stepIndex: 0,
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

export function buildFallbackQuestion(competencyName: string, step: InterviewStep): string {
  switch (step) {
    case "opening":
      return `Как в целом проявляется компетенция "${competencyName}" у коллеги в повседневной работе?`;
    case "example":
      return `Можете привести конкретный пример по "${competencyName}" за последние месяцы?`;
    case "sar":
      return "Уточните контекст: какая была ситуация, что сделал человек, и к какому результату это привело?";
    case "strengths":
      return "Какие сильные стороны вы здесь видите?";
    case "growth":
      return "Какие зоны роста вы бы выделили?";
    case "more":
      return "Есть ли еще наблюдения по этой компетенции, которые важно добавить?";
    default:
      return "Можете рассказать подробнее?";
  }
}
