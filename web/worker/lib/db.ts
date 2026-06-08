import { getToday, toInt } from "./http";
import type { ApiBottle, AuthUser, BottleRow, DailyQuotaRow, RuntimeEnv, WallSlotRow } from "./types";

export function bottleToApi(row: BottleRow): ApiBottle {
  return {
    id: row.id,
    title: row.title,
    gameName: row.game_name,
    category: row.category,
    description: row.description,
    imageUrl: row.image_key ? `/media/${row.image_key}` : row.image_url ?? "",
    template: row.template,
    status: row.status,
    authorName: row.author_name ?? "匿名光核玩家",
    createdAt: row.created_at,
    featuredScore: row.featured_score
  };
}

export async function ensureDailyQuota(env: RuntimeEnv, user: AuthUser) {
  const day = getToday();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO daily_quotas
      (user_id, day, earned, used, login_granted, updated_at)
     VALUES (?1, ?2, 1, 0, 1, datetime('now'))`
  )
    .bind(user.id, day)
    .run();

  return getDailyQuota(env, user.id, day);
}

export async function getDailyQuota(env: RuntimeEnv, userId: string, day = getToday()) {
  const row = await env.DB.prepare(
    `SELECT user_id, day, earned, used, share_count, throw_count, invite_count, login_granted, updated_at
     FROM daily_quotas
     WHERE user_id = ?1 AND day = ?2`
  )
    .bind(userId, day)
    .first<DailyQuotaRow>();

  return (
    row ?? {
      user_id: userId,
      day,
      earned: 0,
      used: 0,
      share_count: 0,
      throw_count: 0,
      invite_count: 0,
      login_granted: 0,
      updated_at: new Date().toISOString()
    }
  );
}

export function remainingQuota(env: RuntimeEnv, quota: DailyQuotaRow) {
  const max = toInt(env.MAX_DAILY_DREDGES, 4);
  return Math.max(0, Math.min(max, quota.earned) - quota.used);
}

export async function grantQuota(
  env: RuntimeEnv,
  userId: string,
  type: "throw" | "share" | "invite",
  delta: number
) {
  const day = getToday();
  const max = toInt(env.MAX_DAILY_DREDGES, 4);
  const current = await getDailyQuota(env, userId, day);
  const nextEarned = Math.min(max, current.earned + delta);
  const field =
    type === "throw" ? "throw_count" : type === "share" ? "share_count" : "invite_count";

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO daily_quotas (user_id, day, earned, used, updated_at)
       VALUES (?1, ?2, ?3, 0, datetime('now'))
       ON CONFLICT(user_id, day) DO UPDATE SET
         earned = ?3,
         ${field} = ${field} + 1,
         updated_at = datetime('now')`
    ).bind(userId, day, nextEarned),
    env.DB.prepare(
      `INSERT INTO task_events (id, user_id, type, day, delta, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))`
    ).bind(crypto.randomUUID(), userId, type, day, delta)
  ]);
}

export async function listLatestBottles(env: RuntimeEnv, limit = 8) {
  const result = await env.DB.prepare(
    `SELECT bottles.*, users.display_name AS author_name
     FROM bottles
     JOIN users ON users.id = bottles.author_id
     WHERE bottles.status = 'approved'
     ORDER BY bottles.created_at DESC
     LIMIT ?1`
  )
    .bind(limit)
    .all<BottleRow>();
  return (result.results ?? []).map(bottleToApi);
}

export async function listFeaturedBottles(env: RuntimeEnv, limit = 8) {
  const result = await env.DB.prepare(
    `SELECT bottles.*, users.display_name AS author_name
     FROM bottles
     JOIN users ON users.id = bottles.author_id
     WHERE bottles.status = 'approved'
     ORDER BY bottles.featured_score DESC, bottles.created_at DESC
     LIMIT ?1`
  )
    .bind(limit)
    .all<BottleRow>();
  return (result.results ?? []).map(bottleToApi);
}

export async function getWall(env: RuntimeEnv, userId: string) {
  const result = await env.DB.prepare(
    `SELECT wall_slots.user_id, wall_slots.slot, wall_slots.layout, wall_slots.updated_at,
            bottles.*, users.display_name AS author_name
     FROM wall_slots
     JOIN bottles ON bottles.id = wall_slots.bottle_id
     JOIN users ON users.id = bottles.author_id
     WHERE wall_slots.user_id = ?1
     ORDER BY wall_slots.slot ASC`
  )
    .bind(userId)
    .all<WallSlotRow>();

  return (result.results ?? []).map((row) => ({
    slot: row.slot,
    layout: row.layout,
    bottle: bottleToApi(row)
  }));
}

export async function getMetrics(env: RuntimeEnv) {
  const [users, bottles, dredges, wall, active] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS count FROM users").first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM bottles").first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM dredges").first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM wall_slots").first<{ count: number }>(),
    env.DB.prepare(
      "SELECT COUNT(DISTINCT user_id) AS count FROM activity_events WHERE created_at >= datetime('now', '-1 day')"
    ).first<{ count: number }>()
  ]);

  return {
    participants: users?.count ?? 0,
    bottles: bottles?.count ?? 0,
    dredges: dredges?.count ?? 0,
    wallItems: wall?.count ?? 0,
    activeUsers24h: active?.count ?? 0
  };
}

export async function recordEvent(
  env: RuntimeEnv,
  type: string,
  userId?: string | null,
  metadata?: Record<string, unknown>
) {
  await env.DB.prepare(
    `INSERT INTO activity_events (id, user_id, type, metadata, created_at)
     VALUES (?1, ?2, ?3, ?4, datetime('now'))`
  )
    .bind(crypto.randomUUID(), userId ?? null, type, metadata ? JSON.stringify(metadata) : null)
    .run();
}
