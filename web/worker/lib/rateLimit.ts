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

  try {
    await env.GH_CONFIG.put(key, JSON.stringify(next), { expirationTtl: ttl });
  } catch (error) {
    // KV 对同一个键有写入频率上限。共享 IP 桶写失败时只丢这一次计数，不能让正常用户的请求 500。
    console.error(
      JSON.stringify({
        type: "rate_limit_write_failed",
        scope: options.parts[0] ?? "unknown",
        message: error instanceof Error ? error.message : String(error)
      })
    );
  }
}

function safeKeyPart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 96) || "unknown";
}
