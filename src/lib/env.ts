import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  TELEGRAM_BOT_USERNAME: z.string().optional(),
  APP_BASE_URL: z.string().optional(),
  AUTH_SECRET: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  KV_REST_API_URL: z.string().optional(),
  KV_REST_API_TOKEN: z.string().optional(),
});

const raw = {
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
  TELEGRAM_BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME,
  APP_BASE_URL: process.env.APP_BASE_URL,
  AUTH_SECRET: process.env.AUTH_SECRET,
  CRON_SECRET: process.env.CRON_SECRET,
  KV_REST_API_URL: process.env.KV_REST_API_URL,
  KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN,
};

const parsed = envSchema.parse(raw);

const testDefaults: Record<string, string> = {
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  OPENAI_API_KEY: "test-openai-key",
  TELEGRAM_BOT_TOKEN: "test-telegram-token",
  TELEGRAM_WEBHOOK_SECRET: "test-telegram-webhook-secret",
  APP_BASE_URL: "http://localhost:3000",
  AUTH_SECRET: "test-auth-secret-value-1234567890",
  CRON_SECRET: "test-cron-secret-value-1234567890",
};

function withDefault(key: keyof typeof testDefaults, value: string | undefined): string {
  if (parsed.NODE_ENV === "test") {
    return value || testDefaults[key];
  }

  return value || "";
}

export const env = {
  NODE_ENV: parsed.NODE_ENV,
  DATABASE_URL: withDefault("DATABASE_URL", parsed.DATABASE_URL),
  OPENAI_API_KEY: withDefault("OPENAI_API_KEY", parsed.OPENAI_API_KEY),
  TELEGRAM_BOT_TOKEN: withDefault("TELEGRAM_BOT_TOKEN", parsed.TELEGRAM_BOT_TOKEN),
  TELEGRAM_WEBHOOK_SECRET: withDefault("TELEGRAM_WEBHOOK_SECRET", parsed.TELEGRAM_WEBHOOK_SECRET),
  TELEGRAM_BOT_USERNAME: parsed.TELEGRAM_BOT_USERNAME || "",
  APP_BASE_URL: withDefault("APP_BASE_URL", parsed.APP_BASE_URL),
  AUTH_SECRET: withDefault("AUTH_SECRET", parsed.AUTH_SECRET),
  CRON_SECRET: withDefault("CRON_SECRET", parsed.CRON_SECRET),
  KV_REST_API_URL: parsed.KV_REST_API_URL || "",
  KV_REST_API_TOKEN: parsed.KV_REST_API_TOKEN || "",
};

export function hasKvConfig(): boolean {
  return Boolean(env.KV_REST_API_URL && env.KV_REST_API_TOKEN);
}

export function requireEnv(name: keyof typeof env): string {
  const value = env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}
