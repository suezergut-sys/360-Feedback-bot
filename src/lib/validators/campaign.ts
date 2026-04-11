import { z } from "zod";

export const campaignStatusSchema = z.enum(["draft", "active", "paused", "completed", "archived"]);

export const campaignInputSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(5).max(4000),
  subjectName: z.string().min(2).max(200),
  status: campaignStatusSchema.default("draft"),
  language: z.string().default("ru"),
});

export type CampaignInput = z.infer<typeof campaignInputSchema>;
