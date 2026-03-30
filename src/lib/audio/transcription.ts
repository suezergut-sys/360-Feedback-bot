import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getOpenAiClient, OPENAI_MODELS } from "@/lib/openai/client";
import { downloadTelegramFile, getTelegramFilePath } from "@/lib/telegram/client";

async function removeFileSafe(filePath: string): Promise<void> {
  try {
    await fs.promises.unlink(filePath);
  } catch {
    // ignore
  }
}

export async function transcribeTelegramVoice(fileId: string): Promise<string> {
  const filePath = await getTelegramFilePath(fileId);
  const fileBuffer = Buffer.from(await downloadTelegramFile(filePath));
  const extension = path.extname(filePath) || ".ogg";
  const tempPath = path.join(os.tmpdir(), `telegram-audio-${randomUUID()}${extension}`);

  await fs.promises.writeFile(tempPath, fileBuffer);

  try {
    const client = getOpenAiClient();
    const result = await client.audio.transcriptions.create({
      file: fs.createReadStream(tempPath),
      model: OPENAI_MODELS.transcription,
      language: "ru",
      temperature: 0,
    });

    const text = result.text?.trim();

    if (!text) {
      throw new Error("Transcription returned empty text");
    }

    return text;
  } finally {
    await removeFileSafe(tempPath);
  }
}
