import { z } from "zod";

export const competencyInputSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().min(5).max(1200),
  behavioralMarkers: z.array(z.string().min(2).max(250)).min(1).max(20),
  priorityOrder: z.number().int().min(1).max(1000),
  enabled: z.boolean().default(true),
});

export type CompetencyInput = z.infer<typeof competencyInputSchema>;
