import { env, requireEnv } from "@/lib/env";
import { logger } from "@/lib/logging/logger";

function getTelegramApiBase(): string {
  return `https://api.telegram.org/bot${requireEnv("TELEGRAM_BOT_TOKEN")}`;
}

function getTelegramFileBase(): string {
  return `https://api.telegram.org/file/bot${requireEnv("TELEGRAM_BOT_TOKEN")}`;
}

type TelegramApiResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

async function telegramApiRequest<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${getTelegramApiBase()}/${method}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as TelegramApiResponse<T>;

  if (!response.ok || !payload.ok || payload.result === undefined) {
    throw new Error(payload.description ?? `Telegram API ${method} failed`);
  }

  return payload.result;
}

export async function sendTelegramMessage(chatId: number | string, text: string): Promise<void> {
  await telegramApiRequest("sendMessage", {
    chat_id: chatId,
    text,
  });
}

export async function sendTelegramTyping(chatId: number | string): Promise<void> {
  try {
    await telegramApiRequest("sendChatAction", {
      chat_id: chatId,
      action: "typing",
    });
  } catch (error) {
    logger.warn("Failed to send typing action", {
      chatId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function getTelegramFilePath(fileId: string): Promise<string> {
  const response = await telegramApiRequest<{ file_path: string }>("getFile", { file_id: fileId });

  if (!response.file_path) {
    throw new Error("Telegram file_path is missing");
  }

  return response.file_path;
}

export async function downloadTelegramFile(filePath: string): Promise<ArrayBuffer> {
  const response = await fetch(`${getTelegramFileBase()}/${filePath}`);

  if (!response.ok) {
    throw new Error(`Failed to download telegram file (${response.status})`);
  }

  return response.arrayBuffer();
}

export function extractStartToken(text: string | undefined): string | null {
  if (!text) {
    return null;
  }

  const [command, token] = text.trim().split(/\s+/, 2);

  if (command !== "/start") {
    return null;
  }

  return token?.trim() || null;
}

export function buildInviteLink(token: string): string {
  if (env.TELEGRAM_BOT_USERNAME) {
    return `https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=${token}`;
  }

  return `${env.APP_BASE_URL}/telegram/start?token=${token}`;
}
