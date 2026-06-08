import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { isAdminUser, requireUser } from "./lib/auth";
import {
  auditBottleImageStorage,
  bottlesToCsv,
  bulkUpdateBottleModeration,
  isBottleStatus,
  listAdminBottles,
  listAdminEvents,
  listBottlesForExport,
  updateBottleModeration
} from "./lib/admin";
import { CATEGORIES, extensionFromMime, validateBottleInput, validateImage } from "./lib/content";
import {
  bottleToApi,
  ensureDailyQuota,
  getDailyQuota,
  getMetrics,
  getWall,
  grantQuota,
  listFeaturedBottles,
  listLatestBottles,
  recordEvent,
  remainingQuota
} from "./lib/db";
import { ApiError, errorBoundary, getToday, jsonError, jsonOk, requestId, securityHeaders, toInt } from "./lib/http";
import { checkBindings } from "./lib/health";
import { enforceRateLimit } from "./lib/rateLimit";
import { isReportReason, submitBottleReport } from "./lib/reports";
import { verifyTurnstile } from "./lib/turnstile";
import type { AuthUser, BottleCategory, BottleRow, ModerationMessage, RuntimeEnv } from "./lib/types";

type Variables = {
  requestId?: string;
  user: AuthUser;
};

const app = new Hono<{ Bindings: RuntimeEnv; Variables: Variables }>();

app.onError((error, c) => {
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
});

app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) {
    return jsonError(404, "not_found", "接口不存在。");
  }

  return new Response("Not Found", { status: 404 });
});

app.use("*", requestId);
app.use("*", securityHeaders);
app.use("*", errorBoundary);
app.use(
  "/api/*",
  cors({
    origin: (origin, c) => {
      const allowed = (c.env.ALLOWED_ORIGINS ?? "")
        .split(",")
        .map((item: string) => item.trim())
        .filter(Boolean);
      if (!origin) {
        return origin;
      }
      if (allowed.length === 0) {
        return c.env.ENVIRONMENT === "production" ? "" : origin;
      }
      return allowed.includes(origin) ? origin : "";
    },
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Authorization", "Content-Type", "X-Dev-User"],
    credentials: true
  })
);

app.get("/api/health", async (c) => {
  const bindings = await checkBindings(c.env);
  return jsonOk({
    ok: bindings.ok,
    app: c.env.APP_NAME,
    environment: c.env.ENVIRONMENT,
    now: new Date().toISOString(),
    bindings: bindings.checks
  }, { status: bindings.ok ? 200 : 503 });
});

app.get("/api/bootstrap", requireUser, async (c) => {
  const user = c.get("user");
  const quota = await ensureDailyQuota(c.env, user);
  const [latest, featured, wall, metrics] = await Promise.all([
    listLatestBottles(c.env, 8),
    listFeaturedBottles(c.env, 9),
    getWall(c.env, user.id),
    getMetrics(c.env)
  ]);
  await recordEvent(c.env, "bootstrap", user.id);

  return jsonOk({
    user,
    categories: CATEGORIES,
    quota: {
      day: quota.day,
      earned: quota.earned,
      used: quota.used,
      remaining: remainingQuota(c.env, quota),
      max: toInt(c.env.MAX_DAILY_DREDGES, 4),
      shareCount: quota.share_count,
      throwCount: quota.throw_count,
      inviteCount: quota.invite_count
    },
    tasks: makeTasks(quota),
    latest,
    featured,
    wall,
    metrics,
    security: {
      turnstileSiteKey: c.env.TURNSTILE_SITE_KEY || null,
      turnstileRequired: c.env.TURNSTILE_REQUIRED === "true"
    }
  });
});

app.post("/api/bottles", requireUser, async (c) => {
  const user = c.get("user");
  await Promise.all([
    enforceRateLimit(c.env, { parts: ["bottle", "user", user.id], limit: 12, windowSeconds: 86400 }),
    enforceRateLimit(c.env, { parts: ["bottle", "ip", clientIp(c)], limit: 60, windowSeconds: 3600 })
  ]);
  const form = await c.req.formData();
  const imageEntry = form.get("image");
  const image = validateImage(imageEntry instanceof File ? imageEntry : null);
  await verifyTurnstile(
    c.env,
    String(form.get("turnstileToken") ?? "") || null,
    c.req.header("CF-Connecting-IP")
  );
  const input = await validateBottleInput(c.env, {
    title: String(form.get("title") ?? ""),
    gameName: String(form.get("gameName") ?? ""),
    category: String(form.get("category") ?? "") as BottleCategory,
    description: String(form.get("description") ?? ""),
    template: String(form.get("template") ?? "standard")
  });

  const id = crypto.randomUUID();
  const imageKey = `bottles/${user.id}/${id}.${extensionFromMime(image.type)}`;
  await c.env.BOTTLE_IMAGES.put(imageKey, image.stream(), {
    httpMetadata: {
      contentType: image.type
    },
    customMetadata: {
      bottleId: id,
      authorId: user.id
    }
  });

  try {
    await c.env.DB.prepare(
      `INSERT INTO bottles
        (id, author_id, title, game_name, category, description, image_key, image_mime, template, status, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'approved', datetime('now'), datetime('now'))`
    )
      .bind(
        id,
        user.id,
        input.title,
        input.gameName,
        input.category,
        input.description,
        imageKey,
        image.type,
        input.template
      )
      .run();
  } catch (error) {
    try {
      await c.env.BOTTLE_IMAGES.delete(imageKey);
    } catch (cleanupError) {
      console.error(
        JSON.stringify({
          type: "r2_cleanup_failed",
          imageKey,
          message: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
        })
      );
    }
    throw error;
  }

  await grantQuota(c.env, user.id, "throw", 1);
  await recordEvent(c.env, "bottle_created", user.id, { bottleId: id, category: input.category });

  if (c.env.MODERATION_QUEUE) {
    const message: ModerationMessage = {
      bottleId: id,
      authorId: user.id,
      category: input.category,
      createdAt: new Date().toISOString()
    };
    c.executionCtx.waitUntil(c.env.MODERATION_QUEUE.send(message));
  }

  const row = await c.env.DB.prepare(
    `SELECT bottles.*, users.display_name AS author_name
     FROM bottles JOIN users ON users.id = bottles.author_id
     WHERE bottles.id = ?1`
  )
    .bind(id)
    .first<BottleRow>();

  if (!row) {
    throw new ApiError(500, "create_failed", "漂流瓶创建失败。");
  }

  return jsonOk({ bottle: bottleToApi(row) }, { status: 201 });
});

app.post("/api/dredge", requireUser, async (c) => {
  const user = c.get("user");
  await enforceRateLimit(c.env, { parts: ["dredge", "user", user.id], limit: 30, windowSeconds: 60 });
  const quota = await ensureDailyQuota(c.env, user);
  if (remainingQuota(c.env, quota) <= 0) {
    throw new ApiError(429, "quota_exhausted", "今日打捞次数已经用完。");
  }

  const eligible = await c.env.DB.prepare(
    `SELECT COUNT(*) AS count
     FROM bottles
     WHERE bottles.status = 'approved'
       AND bottles.author_id != ?1
       AND bottles.id NOT IN (
         SELECT bottle_id FROM dredges WHERE user_id = ?1
       )`
  )
    .bind(user.id)
    .first<{ count: number }>();
  const eligibleCount = eligible?.count ?? 0;

  if (eligibleCount <= 0) {
    throw new ApiError(404, "no_bottle_available", "暂时没有可打捞的新漂流瓶。");
  }

  const offset = secureRandomInt(eligibleCount);
  const bottle = await c.env.DB.prepare(
    `SELECT bottles.*, users.display_name AS author_name
     FROM bottles
     JOIN users ON users.id = bottles.author_id
     WHERE bottles.status = 'approved'
       AND bottles.author_id != ?1
       AND bottles.id NOT IN (
         SELECT bottle_id FROM dredges WHERE user_id = ?1
       )
     ORDER BY bottles.created_at DESC
     LIMIT 1 OFFSET ?2`
  )
    .bind(user.id, offset)
    .first<BottleRow>();

  if (!bottle) {
    throw new ApiError(404, "no_bottle_available", "暂时没有可打捞的新漂流瓶。");
  }

  const dredgeId = crypto.randomUUID();
  const day = getToday();
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO dredges (id, user_id, bottle_id, created_at)
       VALUES (?1, ?2, ?3, datetime('now'))`
    ).bind(dredgeId, user.id, bottle.id),
    c.env.DB.prepare(
      `UPDATE daily_quotas
       SET used = used + 1, updated_at = datetime('now')
       WHERE user_id = ?1 AND day = ?2`
    ).bind(user.id, day),
    c.env.DB.prepare(
      `INSERT INTO activity_events (id, user_id, type, metadata, created_at)
       VALUES (?1, ?2, 'bottle_dredged', ?3, datetime('now'))`
    ).bind(crypto.randomUUID(), user.id, JSON.stringify({ bottleId: bottle.id }))
  ]);

  const updatedQuota = await getDailyQuota(c.env, user.id, day);
  return jsonOk({
    bottle: bottleToApi(bottle),
    quota: {
      day,
      earned: updatedQuota.earned,
      used: updatedQuota.used,
      remaining: remainingQuota(c.env, updatedQuota),
      max: toInt(c.env.MAX_DAILY_DREDGES, 4)
    }
  });
});

app.post("/api/bottles/:id/report", requireUser, async (c) => {
  const user = c.get("user");
  await enforceRateLimit(c.env, { parts: ["report", "user", user.id], limit: 20, windowSeconds: 86400 });

  const bottleId = (c.req.param("id") ?? "").trim();
  if (!bottleId || bottleId.length > 80 || !/^[a-z0-9-]+$/i.test(bottleId)) {
    throw new ApiError(400, "invalid_bottle_id", "漂流瓶 ID 无效。");
  }

  const payload = await c.req.json<{ reason?: unknown; details?: unknown }>();
  if (!isReportReason(payload.reason)) {
    throw new ApiError(400, "invalid_report_reason", "请选择有效的举报原因。");
  }

  const details = String(payload.details ?? "").trim();
  if (details.length > 500) {
    throw new ApiError(400, "invalid_report_details", "补充说明不能超过 500 字。");
  }

  const report = await submitBottleReport(
    c.env,
    user,
    bottleId,
    payload.reason,
    details ? details.slice(0, 500) : null
  );
  await recordEvent(c.env, "bottle_reported", user.id, {
    bottleId,
    reason: payload.reason,
    reportCount: report.reportCount,
    autoQueued: report.autoQueued
  });

  return jsonOk({ report });
});

app.post("/api/wall", requireUser, async (c) => {
  const user = c.get("user");
  const payload = await c.req.json<{ bottleId?: string; slot?: number; layout?: "grid4" | "grid9" }>();
  const bottleId = payload.bottleId?.trim();
  const slot = Number(payload.slot);
  const layout = payload.layout === "grid4" ? "grid4" : "grid9";

  if (!bottleId || !Number.isInteger(slot) || slot < 1 || slot > 9) {
    throw new ApiError(400, "invalid_wall_slot", "请选择有效的安利墙位置。");
  }

  if (layout === "grid4" && slot > 4) {
    throw new ApiError(400, "invalid_wall_slot", "四宫格只能使用 1-4 号位置。");
  }

  const dredged = await c.env.DB.prepare(
    `SELECT id FROM dredges WHERE user_id = ?1 AND bottle_id = ?2`
  )
    .bind(user.id, bottleId)
    .first<{ id: string }>();

  if (!dredged) {
    throw new ApiError(403, "not_dredged", "只能收藏自己打捞到的漂流瓶。");
  }

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO wall_slots (user_id, slot, bottle_id, layout, updated_at)
       VALUES (?1, ?2, ?3, ?4, datetime('now'))
       ON CONFLICT(user_id, slot) DO UPDATE SET
         bottle_id = excluded.bottle_id,
         layout = excluded.layout,
         updated_at = datetime('now')`
    ).bind(user.id, slot, bottleId, layout),
    c.env.DB.prepare(
      `UPDATE dredges SET saved_to_wall = 1 WHERE user_id = ?1 AND bottle_id = ?2`
    ).bind(user.id, bottleId)
  ]);

  await recordEvent(c.env, "wall_saved", user.id, { bottleId, slot, layout });
  return jsonOk({ wall: await getWall(c.env, user.id) });
});

app.post("/api/tasks/share", requireUser, async (c) => {
  const user = c.get("user");
  await enforceRateLimit(c.env, { parts: ["share", "user", user.id], limit: 10, windowSeconds: 3600 });
  const quota = await ensureDailyQuota(c.env, user);
  if (quota.share_count >= 1) {
    return jsonOk({
      granted: false,
      message: "今日分享任务已经完成。",
      quota: await getDailyQuota(c.env, user.id)
    });
  }

  await grantQuota(c.env, user.id, "share", 1);
  await recordEvent(c.env, "share_completed", user.id);
  return jsonOk({ granted: true, quota: await getDailyQuota(c.env, user.id) });
});

app.get("/api/wall/:userId", requireUser, async (c) => {
  const userId = c.req.param("userId");
  if (!userId) {
    throw new ApiError(400, "invalid_user", "无效的安利墙用户。");
  }
  return jsonOk({ wall: await getWall(c.env, userId) });
});

app.get("/api/admin/metrics", requireUser, async (c) => {
  if (!isAdminUser(c.env, c.get("user"))) {
    return jsonError(403, "admin_required", "当前账号没有后台访问权限。");
  }

  return jsonOk({
    metrics: await getMetrics(c.env),
    categories: await getCategoryBreakdown(c.env),
    latest: await listLatestBottles(c.env, 20)
  });
});

app.get("/api/admin/bottles", requireUser, async (c) => {
  if (!isAdminUser(c.env, c.get("user"))) {
    return jsonError(403, "admin_required", "当前账号没有后台访问权限。");
  }

  const statusParam = c.req.query("status") ?? "all";
  if (statusParam !== "all" && statusParam !== "reported" && !isBottleStatus(statusParam)) {
    throw new ApiError(400, "invalid_bottle_status", "请选择有效的审核状态。");
  }

  const status = statusParam as "all" | "reported" | "approved" | "pending" | "rejected";
  const limit = Math.min(Math.max(toInt(c.req.query("limit"), 50), 1), 200);
  return jsonOk({
    bottles: await listAdminBottles(c.env, status, limit)
  });
});

app.get("/api/admin/events", requireUser, async (c) => {
  if (!isAdminUser(c.env, c.get("user"))) {
    return jsonError(403, "admin_required", "当前账号没有后台访问权限。");
  }

  const type = (c.req.query("type") ?? "").trim();
  if (type && (type.length > 64 || !/^[a-z0-9_:-]+$/i.test(type))) {
    throw new ApiError(400, "invalid_event_type", "请选择有效的事件类型。");
  }

  const limit = Math.min(Math.max(toInt(c.req.query("limit"), 20), 1), 100);
  return jsonOk({
    events: await listAdminEvents(c.env, limit, type || undefined)
  });
});

app.get("/api/admin/export/bottles.csv", requireUser, async (c) => {
  if (!isAdminUser(c.env, c.get("user"))) {
    return jsonError(403, "admin_required", "当前账号没有后台访问权限。");
  }

  const statusParam = c.req.query("status") ?? "all";
  if (statusParam !== "all" && statusParam !== "reported" && !isBottleStatus(statusParam)) {
    throw new ApiError(400, "invalid_export_status", "请选择有效的导出状态。");
  }

  const status = statusParam as "all" | "reported" | "approved" | "pending" | "rejected";
  const limit = Math.min(Math.max(toInt(c.req.query("limit"), 1000), 1), 5000);
  const rows = await listBottlesForExport(c.env, status, limit);
  const csv = bottlesToCsv(rows);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="guanghe-bottles-${status}.csv"`
    }
  });
});

app.post("/api/admin/bottles/moderation/bulk", requireUser, async (c) => {
  const user = c.get("user");
  if (!isAdminUser(c.env, user)) {
    return jsonError(403, "admin_required", "当前账号没有后台访问权限。");
  }

  const payload = await c.req.json<{
    bottleIds?: unknown;
    status?: unknown;
    featuredScore?: unknown;
  }>();
  if (!Array.isArray(payload.bottleIds) || !isBottleStatus(payload.status)) {
    throw new ApiError(400, "invalid_bulk_moderation_payload", "请选择内容并提供有效的审核状态。");
  }

  const bottleIds = [...new Set(payload.bottleIds.map((item) => String(item).trim()).filter(Boolean))];
  if (bottleIds.length === 0) {
    throw new ApiError(400, "invalid_bulk_moderation_payload", "请选择至少 1 条漂流瓶。");
  }
  if (bottleIds.length > 100) {
    throw new ApiError(400, "bulk_moderation_limit", "一次最多批量处理 100 条漂流瓶。");
  }
  if (bottleIds.some((id) => id.length > 80 || !/^[a-z0-9-]+$/i.test(id))) {
    throw new ApiError(400, "invalid_bulk_moderation_payload", "漂流瓶 ID 格式无效。");
  }

  const featuredScore =
    typeof payload.featuredScore === "number" && Number.isFinite(payload.featuredScore)
      ? Math.max(0, Math.min(999, Math.trunc(payload.featuredScore)))
      : null;
  const bottles = await bulkUpdateBottleModeration(c.env, bottleIds, payload.status, featuredScore);
  if (bottles.length === 0) {
    throw new ApiError(404, "bottle_not_found", "所选漂流瓶不存在。");
  }

  await recordEvent(c.env, "admin_moderation_bulk_updated", user.id, {
    count: bottles.length,
    requestedCount: bottleIds.length,
    status: payload.status,
    featuredScore
  });

  return jsonOk({ bottles, updated: bottles.length });
});

app.post("/api/admin/bottles/:id/moderation", requireUser, async (c) => {
  const user = c.get("user");
  if (!isAdminUser(c.env, user)) {
    return jsonError(403, "admin_required", "当前账号没有后台访问权限。");
  }

  const bottleId = (c.req.param("id") ?? "").trim();
  const payload = await c.req.json<{ status?: unknown; featuredScore?: unknown }>();
  if (!bottleId || !isBottleStatus(payload.status)) {
    throw new ApiError(400, "invalid_moderation_payload", "请选择有效的审核状态。");
  }

  const featuredScore =
    typeof payload.featuredScore === "number" && Number.isFinite(payload.featuredScore)
      ? Math.max(0, Math.min(999, Math.trunc(payload.featuredScore)))
      : null;
  const bottle = await updateBottleModeration(c.env, bottleId, payload.status, featuredScore);
  if (!bottle) {
    throw new ApiError(404, "bottle_not_found", "漂流瓶不存在。");
  }

  await recordEvent(c.env, "admin_moderation_updated", user.id, {
    bottleId,
    status: payload.status,
    featuredScore
  });

  return jsonOk({ bottle });
});

app.get("/api/admin/storage/audit", requireUser, async (c) => {
  if (!isAdminUser(c.env, c.get("user"))) {
    return jsonError(403, "admin_required", "当前账号没有后台访问权限。");
  }

  const limit = Math.min(Math.max(toInt(c.req.query("limit"), 1000), 1), 1000);
  return jsonOk({
    storage: await auditBottleImageStorage(c.env, limit, c.req.query("cursor"))
  });
});

app.get("/media/*", async (c) => {
  const key = c.req.path.replace(/^\/media\//, "");
  if (!isSafeMediaKey(key)) {
    throw new ApiError(400, "invalid_media_key", "无效的图片地址。");
  }

  const object = await c.env.BOTTLE_IMAGES.get(key);
  if (!object) {
    throw new ApiError(404, "media_not_found", "图片不存在。");
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  headers.set("ETag", object.httpEtag);
  return new Response(object.body, { headers });
});

function makeTasks(quota: Awaited<ReturnType<typeof getDailyQuota>>) {
  return [
    {
      id: "login",
      title: "每日登录",
      progress: quota.login_granted,
      limit: 1,
      reward: "+1 次打捞机会",
      done: quota.login_granted >= 1
    },
    {
      id: "throw",
      title: "投出 1 个漂流瓶",
      progress: quota.throw_count,
      limit: 1,
      reward: "+1 次打捞机会",
      done: quota.throw_count >= 1
    },
    {
      id: "share",
      title: "分享活动或安利墙",
      progress: quota.share_count,
      limit: 1,
      reward: "+1 次打捞机会",
      done: quota.share_count >= 1
    },
    {
      id: "invite",
      title: "成功邀请新玩家",
      progress: quota.invite_count,
      limit: 2,
      reward: "+2 次打捞机会",
      done: quota.invite_count >= 2
    }
  ];
}

function clientIp(c: Context<{ Bindings: RuntimeEnv; Variables: Variables }>) {
  return c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For") ?? "unknown";
}

function secureRandomInt(maxExclusive: number) {
  const maxUint32 = 0x100000000;
  const threshold = maxUint32 - (maxUint32 % maxExclusive);
  const buffer = new Uint32Array(1);

  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= threshold);

  return buffer[0] % maxExclusive;
}

function isSafeMediaKey(key: string) {
  return (
    key.length > 0 &&
    key.length <= 240 &&
    key.startsWith("bottles/") &&
    /^[a-z0-9/_-]+\.(jpg|png|webp|gif)$/i.test(key) &&
    !key.includes("..") &&
    !key.includes("//")
  );
}

async function getCategoryBreakdown(env: RuntimeEnv) {
  const result = await env.DB.prepare(
    `SELECT category, COUNT(*) AS count
     FROM bottles
     WHERE status = 'approved'
     GROUP BY category
     ORDER BY count DESC`
  ).all<{ category: string; count: number }>();
  return result.results ?? [];
}

export default {
  fetch(request: Request, env: RuntimeEnv, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx);
  },

  async queue(batch: MessageBatch<ModerationMessage>, env: RuntimeEnv) {
    for (const message of batch.messages) {
      const { bottleId, authorId, category } = message.body;
      try {
        await recordEvent(env, "moderation_queued", authorId, {
          bottleId,
          category
        });
        message.ack();
      } catch (error) {
        console.error(
          JSON.stringify({
            type: "queue_message_failed",
            bottleId,
            message: error instanceof Error ? error.message : String(error)
          })
        );
        message.retry();
      }
    }
  }
};
