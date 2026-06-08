import { ApiError } from "./http";
import type { RuntimeEnv } from "./types";

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type RateLimitOptions = {
  parts: string[];
  limit: number;
  windowSeconds: number;
};

export async function enforceRateLimit(env: RuntimeEnv, options: RateLimitOptions) {
  const now = Date.now();
  const key = `rate:${options.parts.map(safeKeyPart).join(":")}`;
  const current = await env.GH_CONFIG.get<RateLimitBucket>(key, "json");
  const bucket =
    current && current.resetAt > now
      ? current
      : { count: 0, resetAt: now + options.windowSeconds * 1000 };

  if (bucket.count >= options.limit) {
    throw new ApiError(429, "rate_limited", "操作太频繁了，稍后再试。");
  }

  const next = {
    count: bucket.count + 1,
    resetAt: bucket.resetAt
  };
  const ttl = Math.max(60, Math.ceil((next.resetAt - now) / 1000) + 5);

  await env.GH_CONFIG.put(key, JSON.stringify(next), { expirationTtl: ttl });
}

function safeKeyPart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 96) || "unknown";
}
