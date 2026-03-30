import { prisma } from "@/lib/db/prisma";
import { getKvClient } from "@/lib/kv/client";
import { logger } from "@/lib/logging/logger";

export async function ensureUpdateNotProcessed(updateId: number): Promise<boolean> {
  const kv = getKvClient();
  const key = `telegram:update:${updateId}`;

  if (kv) {
    try {
      const result = await kv.set(key, "1", {
        ex: 60 * 60,
        nx: true,
      });

      if (result === "OK") {
        return true;
      }

      return false;
    } catch (error) {
      logger.warn("KV idempotency check failed, falling back to database", {
        updateId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  try {
    await prisma.telegramUpdateLog.create({
      data: { updateId: BigInt(updateId) },
    });

    return true;
  } catch {
    return false;
  }
}
