import { z } from "zod";

const fromSchema = z.object({
  id: z.number(),
  username: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  language_code: z.string().optional(),
});

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
  from: fromSchema.optional(),
  date: z.number().int(),
});

const callbackQuerySchema = z.object({
  id: z.string(),
  from: fromSchema,
  message: z
    .object({
      message_id: z.number().int(),
      chat: z.object({ id: z.number() }),
    })
    .optional(),
  data: z.string().optional(),
});

export const telegramUpdateSchema = z.object({
  update_id: z.number().int(),
  message: messageSchema.optional(),
  edited_message: messageSchema.optional(),
  callback_query: callbackQuerySchema.optional(),
});

export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;
export type TelegramCallbackQuery = z.infer<typeof callbackQuerySchema>;
