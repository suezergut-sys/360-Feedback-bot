import { describe, expect, it } from "vitest";
import { extractionResultSchema } from "@/lib/validators/analysis";

describe("extraction schema", () => {
  it("parses valid extraction payload", () => {
    const payload = {
      competency_name: "Communication",
      evidence: ["Explains decisions clearly"],
      strengths: ["Clear communication"],
      growth_areas: ["Escalate risks earlier"],
      examples: ["Project X timeline slip"],
      specificity: "medium",
      confidence: 0.84,
    };

    const result = extractionResultSchema.parse(payload);

    expect(result.competency_name).toBe("Communication");
    expect(result.confidence).toBe(0.84);
  });

  it("rejects out-of-range confidence", () => {
    expect(() =>
      extractionResultSchema.parse({
        competency_name: "Leadership",
        evidence: [],
        strengths: [],
        growth_areas: [],
        examples: [],
        specificity: "high",
        confidence: 2,
      }),
    ).toThrow();
  });
});
