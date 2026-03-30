import OpenAI from "openai";
import { requireEnv } from "@/lib/env";

let client: OpenAI | null = null;

export function getOpenAiClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
  }

  return client;
}

export const OPENAI_MODELS = {
  interview: "gpt-4o-mini",
  extraction: "gpt-4o-mini",
  report: "gpt-4o",
  transcription: "whisper-1",
} as const;
