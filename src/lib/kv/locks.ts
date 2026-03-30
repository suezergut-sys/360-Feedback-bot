import { getKvClient } from "@/lib/kv/client";

export async function acquireSoftLock(key: string, ttlSeconds: number): Promise<boolean> {
  const kv = getKvClient();

  if (!kv) {
    return true;
  }

  const result = await kv.set(`lock:${key}`, "1", {
    ex: ttlSeconds,
    nx: true,
  });

  return result === "OK";
}

export async function releaseSoftLock(key: string): Promise<void> {
  const kv = getKvClient();

  if (!kv) {
    return;
  }

  await kv.del(`lock:${key}`);
}
