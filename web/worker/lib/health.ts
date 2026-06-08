import type { RuntimeEnv } from "./types";

export type BindingHealth = {
  ok: boolean;
  checks: {
    d1: HealthCheck;
    kv: HealthCheck;
    r2: HealthCheck;
    queue: HealthCheck;
  };
};

type HealthCheck = {
  ok: boolean;
  latencyMs: number;
  error?: string;
};

export async function checkBindings(env: RuntimeEnv): Promise<BindingHealth> {
  const [d1, kv, r2] = await Promise.all([
    timedCheck(async () => {
      await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    }),
    timedCheck(async () => {
      await env.GH_CONFIG.get("healthcheck:noop");
    }),
    timedCheck(async () => {
      await env.BOTTLE_IMAGES.list({ limit: 1 });
    })
  ]);
  const queue: HealthCheck = {
    ok: Boolean(env.MODERATION_QUEUE),
    latencyMs: 0,
    error: env.MODERATION_QUEUE ? undefined : "missing_binding"
  };

  return {
    ok: d1.ok && kv.ok && r2.ok && queue.ok,
    checks: { d1, kv, r2, queue }
  };
}

async function timedCheck(check: () => Promise<void>): Promise<HealthCheck> {
  const start = Date.now();
  try {
    await check();
    return {
      ok: true,
      latencyMs: Date.now() - start
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.name || "binding_error" : "binding_error"
    };
  }
}
