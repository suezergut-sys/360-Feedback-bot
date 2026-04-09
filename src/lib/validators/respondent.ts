import { z } from "zod";

export const RESPONDENT_ROLE_LABELS: Record<string, string> = {
  self: "Самооценка",
  manager: "Руководитель",
  colleague: "Коллега",
  client: "Клиент",
  employee: "Сотрудник",
};

export const respondentInputSchema = z.object({
  displayName: z.string().min(2).max(120).optional(),
  role: z.enum(["self", "manager", "colleague", "client", "employee"]).default("colleague"),
  position: z.string().max(200).optional(),
  department: z.string().max(200).optional(),
});

export type RespondentInput = z.infer<typeof respondentInputSchema>;
