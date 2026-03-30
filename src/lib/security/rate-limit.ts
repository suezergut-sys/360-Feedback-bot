import { getKvClient } from "@/lib/kv/client";

type LocalEntry = {
  count: number;
  resetAt: number;
};

const localMap = new Map<string, LocalEntry>();

export async function checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const kv = getKvClient();
  const nowMs = Date.now();

  if (kv) {
    const redisKey = `ratelimit:${key}`;
    const count = await kv.incr(redisKey);

    if (count === 1) {
      await kv.expire(redisKey, windowSeconds);
    }

    return Number(count) <= limit;
  }

  const existing = localMap.get(key);

  if (!existing || existing.resetAt <= nowMs) {
    localMap.set(key, {
      count: 1,
      resetAt: nowMs + windowSeconds * 1000,
    });

    return true;
  }

  existing.count += 1;
  localMap.set(key, existing);

  return existing.count <= limit;
}
