import { z } from "zod";

const messageSchema = z.object({
  message_id: z.number().int(),
  text: z.string().optional(),
  voice: z
    .object({
      file_id: z.string(),
      duration: z.number().int().optional(),
      mime_type: z.string().optional(),
      file_size: z.number().int().optional(),
    })
    .optional(),
  chat: z.object({
    id: z.number(),
    type: z.string(),
  }),
  from: z
    .object({
      id: z.number(),
      username: z.string().optional(),
      first_name: z.string().optional(),
      last_name: z.string().optional(),
      language_code: z.string().optional(),
    })
    .optional(),
  date: z.number().int(),
});

export const telegramUpdateSchema = z.object({
  update_id: z.number().int(),
  message: messageSchema.optional(),
  edited_message: messageSchema.optional(),
});

export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;
