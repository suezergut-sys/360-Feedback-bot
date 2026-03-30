import { Redis } from "@upstash/redis";
import { env, hasKvConfig } from "@/lib/env";

let redisClient: Redis | null = null;

export function getKvClient(): Redis | null {
  if (!hasKvConfig()) {
    return null;
  }

  if (!redisClient) {
    redisClient = new Redis({
      url: env.KV_REST_API_URL!,
      token: env.KV_REST_API_TOKEN!,
    });
  }

  return redisClient;
}
