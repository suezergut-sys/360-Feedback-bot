import { describe, expect, it } from "vitest";
import {
  createInitialInterviewState,
  getCurrentStep,
  incrementMarkerQuestionCount,
  isRepeatedQuestion,
  looksLikeConsent,
  looksLikeNoAnswer,
  moveToNextCompetency,
  moveToNextMarker,
  moveToNextMethodologyStep,
  normalizeQuestionText,
  resetMarkerProgress,
  withInterviewCompleted,
} from "@/modules/interviews/state";

describe("interview state transitions", () => {
  it("starts in consent phase", () => {
    const state = createInitialInterviewState();
    expect(state.phase).toBe("consent");
    expect(getCurrentStep(state)).toBe("opening");
    expect(state.markerIndex).toBe(0);
    expect(state.markerQuestionCount).toBe(0);
  });

  it("advances methodology and competency", () => {
    let state = createInitialInterviewState();
    state = { ...state, phase: "interview" };

    for (let i = 0; i < 6; i += 1) {
      state = moveToNextMethodologyStep(state);
    }

    expect(state.competencyIndex).toBe(1);
    expect(state.stepIndex).toBe(0);
  });

  it("supports explicit competency switch", () => {
    const next = moveToNextCompetency({
      ...createInitialInterviewState(),
      markerIndex: 2,
      markerQuestionCount: 3,
    });
    expect(next.competencyIndex).toBe(1);
    expect(next.stepIndex).toBe(0);
    expect(next.markerIndex).toBe(0);
    expect(next.markerQuestionCount).toBe(0);
  });

  it("supports marker transitions", () => {
    const state = createInitialInterviewState();
    const movedMarker = moveToNextMarker({
      ...state,
      markerQuestionCount: 2,
      stepIndex: 3,
    });

    expect(movedMarker.markerIndex).toBe(1);
    expect(movedMarker.markerQuestionCount).toBe(0);
    expect(movedMarker.stepIndex).toBe(0);

    const incremented = incrementMarkerQuestionCount(movedMarker);
    expect(incremented.markerQuestionCount).toBe(1);

    const reset = resetMarkerProgress({
      ...incremented,
      markerIndex: 5,
      markerQuestionCount: 9,
    });
    expect(reset.markerIndex).toBe(0);
    expect(reset.markerQuestionCount).toBe(0);
  });

  it("detects consent in russian", () => {
    expect(looksLikeConsent("Да, согласен")).toBe(true);
    expect(looksLikeConsent("нет")).toBe(false);
  });

  it("detects no-answer phrases", () => {
    expect(looksLikeNoAnswer("не могу вспомнить конкретный пример")).toBe(true);
    expect(looksLikeNoAnswer("затрудняюсь ответить")).toBe(true);
    expect(looksLikeNoAnswer("могу привести пример из последнего проекта")).toBe(false);
  });

  it("marks completion", () => {
    const completed = withInterviewCompleted(createInitialInterviewState());
    expect(completed.phase).toBe("completed");
    expect(completed.completed).toBe(true);
  });

  it("normalizes and detects repeated questions", () => {
    expect(normalizeQuestionText("Какой вопрос Сумин задал, который был особенно эффективным?")).toBe(
      "какой вопрос сумин задал который был особенно эффективным",
    );

    expect(
      isRepeatedQuestion(
        "Какой вопрос Сумин задал, который был особенно эффективным?",
        "Какой вопрос Сумин задал, который, по вашему мнению, был особенно эффективным?",
      ),
    ).toBe(true);

    expect(isRepeatedQuestion("Какие сильные стороны вы видите?", "Какие зоны роста вы видите?")).toBe(false);
  });
});
