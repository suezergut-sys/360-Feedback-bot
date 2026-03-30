import { describe, expect, it } from "vitest";
import {
  createInitialInterviewState,
  getCurrentStep,
  looksLikeConsent,
  moveToNextCompetency,
  moveToNextMethodologyStep,
  withInterviewCompleted,
} from "@/modules/interviews/state";

describe("interview state transitions", () => {
  it("starts in consent phase", () => {
    const state = createInitialInterviewState();
    expect(state.phase).toBe("consent");
    expect(getCurrentStep(state)).toBe("opening");
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
    const next = moveToNextCompetency(createInitialInterviewState());
    expect(next.competencyIndex).toBe(1);
    expect(next.stepIndex).toBe(0);
  });

  it("detects consent in russian", () => {
    expect(looksLikeConsent("Да, согласен")).toBe(true);
    expect(looksLikeConsent("нет")).toBe(false);
  });

  it("marks completion", () => {
    const completed = withInterviewCompleted(createInitialInterviewState());
    expect(completed.phase).toBe("completed");
    expect(completed.completed).toBe(true);
  });
});
