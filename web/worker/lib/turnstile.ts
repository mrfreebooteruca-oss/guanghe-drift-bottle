import { ApiError } from "./http";
import type { RuntimeEnv } from "./types";

type TurnstileResponse = {
  success: boolean;
  challenge_ts?: string;
  hostname?: string;
  "error-codes"?: string[];
  action?: string;
  cdata?: string;
};

export async function verifyTurnstile(
  env: RuntimeEnv,
  token: string | null,
  remoteIp?: string,
  allowUnconfigured = false
) {
  const required = env.TURNSTILE_REQUIRED === "true";
  const secret = env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    // 缺密钥时默认拒绝，只有本机开发进程可以跳过，避免两个开关同时写错就等于零防护。
    if (required || !allowUnconfigured) {
      throw new ApiError(500, "turnstile_not_configured", "人机校验尚未配置。");
    }
    return;
  }

  if (!token) {
    throw new ApiError(400, "turnstile_required", "请完成人机校验后再投递。");
  }

  const body = new FormData();
  body.set("secret", secret);
  body.set("response", token);
  if (remoteIp) {
    body.set("remoteip", remoteIp);
  }

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body
  });

  if (!response.ok) {
    throw new ApiError(502, "turnstile_unavailable", "人机校验服务暂时不可用。");
  }

  const result = (await response.json()) as TurnstileResponse;
  if (!result.success) {
    throw new ApiError(
      400,
      "turnstile_failed",
      `人机校验失败：${result["error-codes"]?.join(", ") || "unknown"}`
    );
  }
}
