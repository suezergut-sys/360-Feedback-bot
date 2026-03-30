import { z } from "zod";

export const extractionResultSchema = z.object({
  competency_name: z.string(),
  evidence: z.array(z.string()).default([]),
  strengths: z.array(z.string()).default([]),
  growth_areas: z.array(z.string()).default([]),
  examples: z.array(z.string()).default([]),
  specificity: z.enum(["low", "medium", "high"]).default("medium"),
  confidence: z.number().min(0).max(1),
});

export const competencyReportSchema = z.object({
  competency_name: z.string(),
  short_summary: z.string(),
  strengths: z.array(z.string()).default([]),
  growth_areas: z.array(z.string()).default([]),
  behavior_patterns: z.array(z.string()).default([]),
  examples: z.array(z.string()).default([]),
  conflicting_signals: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
  data_completeness: z.enum(["low", "medium", "high"]),
  confidence_level: z.number().min(0).max(1),
});

export const overallReportSchema = z.object({
  executive_summary: z.string(),
  key_strengths: z.array(z.string()).default([]),
  key_development_areas: z.array(z.string()).default([]),
  repeated_themes: z.array(z.string()).default([]),
  blind_spots: z.array(z.string()).default([]),
  near_term_recommendations: z.array(z.string()).default([]),
  confidence_level: z.number().min(0).max(1),
});

export type ExtractionResult = z.infer<typeof extractionResultSchema>;
export type CompetencyReportResult = z.infer<typeof competencyReportSchema>;
export type OverallReportResult = z.infer<typeof overallReportSchema>;
