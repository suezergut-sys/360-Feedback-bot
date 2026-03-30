import { describe, expect, it } from "vitest";
import {
  assembleCompetencyAggregate,
  assembleOverallThemes,
  overallReportToMarkdown,
} from "@/modules/reports/assembly";

describe("report assembly", () => {
  it("aggregates and deduplicates competency signals", () => {
    const aggregate = assembleCompetencyAggregate({
      competency: {
        id: "c1",
        name: "Communication",
        description: "desc",
      },
      feedback: [
        {
          evidenceSummary: "A\nB",
          strengthsText: "S1",
          growthAreasText: "G1",
          examplesText: "E1",
          confidenceScore: 0.7,
          payloadJson: {},
        },
        {
          evidenceSummary: "A\nC",
          strengthsText: "S2",
          growthAreasText: "G2",
          examplesText: "E2",
          confidenceScore: 0.9,
          payloadJson: {},
        },
      ],
    });

    expect(aggregate.evidence).toEqual(["A", "B", "C"]);
    expect(aggregate.averageConfidence).toBe(0.8);
  });

  it("builds overall markdown", () => {
    const themes = assembleOverallThemes([
      {
        competencyId: "c1",
        competencyName: "Leadership",
        competencyDescription: "desc",
        respondentCount: 2,
        evidence: ["Signal 1"],
        strengths: ["Strength 1"],
        growthAreas: ["Growth 1"],
        examples: ["Example 1"],
        averageConfidence: 0.75,
      },
    ]);

    expect(themes.competencies).toHaveLength(1);

    const markdown = overallReportToMarkdown({
      executive_summary: "Summary",
      key_strengths: ["S"],
      key_development_areas: ["D"],
      repeated_themes: ["T"],
      blind_spots: ["B"],
      near_term_recommendations: ["R"],
      confidence_level: 0.7,
    });

    expect(markdown).toContain("Общий отчет кампании");
  });
});
