import type { Context, Next } from "hono";
import type { RuntimeEnv } from "./types";

type HttpVariables = {
  requestId?: string;
};

type HttpContext = Context<{ Bindings: RuntimeEnv; Variables: HttpVariables }>;

type ApiErrorBody = {
  error: {
    code: string;
    message: string;
  };
};

const LOCAL_DEV_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * 只有跑在本机 workerd 进程里的请求才算本地开发请求：主机名是回环地址，且没有 Cloudflare
 * 边缘注入的 CF-Ray 头。线上部署的 Worker 永远拿不到这个 true，所以开发用的放行分支不会
 * 因为某个环境变量写错而在公网生效。
 */
export function isLocalDevRequest(request: Request) {
  if (request.headers.get("CF-Ray")) {
    return false;
  }

  try {
    return LOCAL_DEV_HOSTNAMES.has(new URL(request.url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return Response.json({ data }, init);
}

export function jsonError(status: number, code: string, message: string) {
  const body: ApiErrorBody = { error: { code, message } };
  return Response.json(body, { status });
}

export async function requestId(c: HttpContext, next: Next) {
  const requestId = normalizeRequestId(c.req.header("X-Request-Id")) ?? c.req.header("CF-Ray") ?? crypto.randomUUID();
  c.set("requestId", requestId);
  await next();
  c.header("X-Request-Id", requestId);
}

export async function errorBoundary(c: HttpContext, next: Next) {
  try {
    await next();
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonError(error.status, error.code, error.message);
    }

    console.error(
      JSON.stringify({
        type: "api_error",
        requestId: c.get("requestId"),
        method: c.req.method,
        path: c.req.path,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      })
    );

    return jsonError(500, "internal_error", "服务暂时开小差了，请稍后再试。");
  }
}

export async function securityHeaders(c: HttpContext, next: Next) {
  await next();

  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header(
    "Permissions-Policy",
    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()"
  );

  if (new URL(c.req.url).protocol === "https:") {
    c.header("Strict-Transport-Security", "max-age=15552000");
  }

  if (c.req.path.startsWith("/api/")) {
    c.header("Cache-Control", "no-store");
    c.header("Vary", "Origin");
  }
}

function normalizeRequestId(value: string | undefined) {
  const id = value?.trim();
  if (!id || id.length > 96 || !/^[a-z0-9:._-]+$/i.test(id)) {
    return null;
  }

  return id;
}

export function getToday() {
  return new Date().toISOString().slice(0, 10);
}

export function toInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
