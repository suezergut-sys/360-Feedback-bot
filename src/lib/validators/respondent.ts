import { z } from "zod";

export const respondentInputSchema = z.object({
  displayName: z.string().min(2).max(120).optional(),
});

export type RespondentInput = z.infer<typeof respondentInputSchema>;
