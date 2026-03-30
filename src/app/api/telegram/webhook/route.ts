import { NextResponse } from "next/server";
import { requireEnv } from "@/lib/env";
import { telegramUpdateSchema } from "@/lib/validators/telegram";
import { ensureUpdateNotProcessed } from "@/lib/kv/idempotency";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logging/logger";
import {
  extractStartToken,
  sendTelegramMessage,
  sendTelegramTyping,
} from "@/lib/telegram/client";
import {
  handleFinishCommand,
  handleHelpCommand,
  handleRespondentMessage,
  handleResumeCommand,
  handleStartCommand,
} from "@/modules/interviews/service";
import { transcribeTelegramVoice } from "@/lib/audio/transcription";

export const runtime = "nodejs";

function isSecretValid(request: Request): boolean {
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  const expected = requireEnv("TELEGRAM_WEBHOOK_SECRET");
  return Boolean(secret && secret === expected);
}

export async function POST(request: Request) {
  if (!isSecretValid(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const body = await request.json();
  const parsed = telegramUpdateSchema.safeParse(body);

  if (!parsed.success) {
    logger.warn("Invalid telegram update payload", {
      issues: parsed.error.issues,
    });

    return NextResponse.json({ ok: true });
  }

  const update = parsed.data;
  const accepted = await ensureUpdateNotProcessed(update.update_id);

  if (!accepted) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const message = update.message ?? update.edited_message;

  if (!message?.from) {
    return NextResponse.json({ ok: true });
  }

  const userId = BigInt(message.from.id);
  const chatId = message.chat.id;

  const limited = await checkRateLimit(`telegram:user:${userId.toString()}`, 50, 60);

  if (!limited) {
    await sendTelegramMessage(chatId, "Слишком много запросов. Попробуйте через минуту.");
    return NextResponse.json({ ok: true });
  }

  const text = message.text?.trim();

  try {
    let replyText: string;

    if (text?.startsWith("/start")) {
      replyText = await handleStartCommand({
        inviteToken: extractStartToken(text),
        telegramUserId: userId,
        telegramUsername: message.from.username,
        chatId,
      });
    } else if (text === "/help") {
      replyText = await handleHelpCommand();
    } else if (text === "/resume") {
      replyText = await handleResumeCommand(userId, chatId);
    } else if (text === "/finish") {
      replyText = await handleFinishCommand(userId);
    } else {
      await sendTelegramTyping(chatId);

      if (message.voice?.file_id) {
        try {
          const transcriptText = await transcribeTelegramVoice(message.voice.file_id);

          replyText = await handleRespondentMessage({
            chatId,
            telegramUserId: userId,
            telegramUsername: message.from.username,
            telegramMessageId: message.message_id,
            text: undefined,
            transcriptText,
            messageType: "voice",
            metadata: {
              telegramVoiceFileId: message.voice.file_id,
              duration: message.voice.duration,
              mimeType: message.voice.mime_type,
              size: message.voice.file_size,
            },
          });
        } catch (error) {
          logger.warn("Voice transcription failed", {
            userId: userId.toString(),
            error: error instanceof Error ? error.message : String(error),
          });

          replyText =
            "Не удалось распознать голосовое сообщение. Попробуйте отправить голос еще раз или ответьте текстом.";
        }
      } else {
        replyText = await handleRespondentMessage({
          chatId,
          telegramUserId: userId,
          telegramUsername: message.from.username,
          telegramMessageId: message.message_id,
          text,
          transcriptText: text,
          messageType: "text",
          metadata: {
            languageCode: message.from.language_code,
          },
        });
      }
    }

    await sendTelegramMessage(chatId, replyText);

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("Telegram webhook handler failed", {
      updateId: update.update_id,
      error: error instanceof Error ? error.message : String(error),
    });

    try {
      await sendTelegramMessage(chatId, "Произошла ошибка обработки. Попробуйте повторить позже.");
    } catch {
      // ignore
    }

    return NextResponse.json({ ok: true });
  }
}
