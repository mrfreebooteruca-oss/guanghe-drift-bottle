import { bottleToApi } from "./db";
import type { BottleRow, RuntimeEnv } from "./types";

export type BottleStatus = "approved" | "pending" | "rejected";
export type AdminBottleFilter = BottleStatus | "all" | "reported";

export type BottleExportRow = {
  id: string;
  title: string;
  game_name: string;
  category: string;
  status: BottleStatus;
  featured_score: number;
  report_count: number;
  author_id: string;
  author_name: string | null;
  image_key: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminBottleRow = BottleExportRow & {
  description: string;
  image_url: string | null;
  template: string;
};

export type AdminBottle = {
  id: string;
  title: string;
  gameName: string;
  category: string;
  description: string;
  imageUrl: string;
  template: string;
  status: BottleStatus;
  featuredScore: number;
  reportCount: number;
  authorName: string;
  createdAt: string;
  updatedAt: string;
};

export type StorageAuditResult = {
  scannedR2Objects: number;
  trackedD1Images: number;
  orphanKeysSample: string[];
  missingKeysSample: string[];
  truncated: boolean;
  cursor: string | null;
};

export type AdminEventRow = {
  id: string;
  user_id: string | null;
  type: string;
  metadata: string | null;
  created_at: string;
};

export type AdminEvent = {
  id: string;
  userId: string | null;
  type: string;
  metadata: string | null;
  createdAt: string;
};

export function isBottleStatus(value: unknown): value is BottleStatus {
  return value === "approved" || value === "pending" || value === "rejected";
}

export async function listBottlesForExport(
  env: RuntimeEnv,
  status: AdminBottleFilter,
  limit: number
) {
  const base = `SELECT bottles.id, bottles.title, bottles.game_name, bottles.category,
      bottles.status, bottles.featured_score, bottles.report_count, bottles.author_id,
      users.display_name AS author_name, bottles.image_key, bottles.created_at, bottles.updated_at
    FROM bottles
    JOIN users ON users.id = bottles.author_id`;
  const query =
    status === "all"
      ? `${base} ORDER BY bottles.created_at DESC LIMIT ?1`
      : status === "reported"
        ? `${base} WHERE bottles.report_count > 0 ORDER BY bottles.report_count DESC, bottles.created_at DESC LIMIT ?1`
      : `${base} WHERE bottles.status = ?1 ORDER BY bottles.created_at DESC LIMIT ?2`;
  const prepared =
    status === "all" || status === "reported"
      ? env.DB.prepare(query).bind(limit)
      : env.DB.prepare(query).bind(status, limit);
  const result = await prepared.all<BottleExportRow>();
  return result.results ?? [];
}

export async function listAdminBottles(env: RuntimeEnv, status: AdminBottleFilter, limit: number) {
  const base = `SELECT bottles.id, bottles.title, bottles.game_name, bottles.category,
      bottles.description, bottles.status, bottles.featured_score, bottles.report_count,
      bottles.author_id, users.display_name AS author_name, bottles.image_key,
      bottles.image_url, bottles.template, bottles.created_at, bottles.updated_at
    FROM bottles
    JOIN users ON users.id = bottles.author_id`;
  const query =
    status === "all"
      ? `${base} ORDER BY bottles.created_at DESC LIMIT ?1`
      : status === "reported"
        ? `${base} WHERE bottles.report_count > 0 ORDER BY bottles.report_count DESC, bottles.created_at DESC LIMIT ?1`
      : `${base} WHERE bottles.status = ?1 ORDER BY bottles.created_at DESC LIMIT ?2`;
  const prepared =
    status === "all" || status === "reported"
      ? env.DB.prepare(query).bind(limit)
      : env.DB.prepare(query).bind(status, limit);
  const result = await prepared.all<AdminBottleRow>();
  return (result.results ?? []).map(adminBottleToApi);
}

export async function listAdminBottlesByIds(env: RuntimeEnv, bottleIds: string[]) {
  if (bottleIds.length === 0) return [];
  const placeholders = bottleIds.map((_, index) => `?${index + 1}`).join(", ");
  const result = await env.DB.prepare(
    `SELECT bottles.id, bottles.title, bottles.game_name, bottles.category,
      bottles.description, bottles.status, bottles.featured_score, bottles.report_count,
      bottles.author_id, users.display_name AS author_name, bottles.image_key,
      bottles.image_url, bottles.template, bottles.created_at, bottles.updated_at
    FROM bottles
    JOIN users ON users.id = bottles.author_id
    WHERE bottles.id IN (${placeholders})
    ORDER BY bottles.created_at DESC`
  )
    .bind(...bottleIds)
    .all<AdminBottleRow>();
  return (result.results ?? []).map(adminBottleToApi);
}

export async function updateBottleModeration(
  env: RuntimeEnv,
  bottleId: string,
  status: BottleStatus,
  featuredScore: number | null
) {
  await env.DB.prepare(
    `UPDATE bottles
     SET status = ?1, featured_score = COALESCE(?2, featured_score), updated_at = datetime('now')
     WHERE id = ?3`
  )
    .bind(status, featuredScore, bottleId)
    .run();

  const row = await env.DB.prepare(
    `SELECT bottles.*, users.display_name AS author_name
     FROM bottles JOIN users ON users.id = bottles.author_id
     WHERE bottles.id = ?1`
  )
    .bind(bottleId)
    .first<BottleRow>();

  return row ? bottleToApi(row) : null;
}

export async function bulkUpdateBottleModeration(
  env: RuntimeEnv,
  bottleIds: string[],
  status: BottleStatus,
  featuredScore: number | null
) {
  const uniqueIds = [...new Set(bottleIds)];
  if (uniqueIds.length === 0) return [];

  await env.DB.batch(
    uniqueIds.map((bottleId) =>
      env.DB.prepare(
        `UPDATE bottles
         SET status = ?1, featured_score = COALESCE(?2, featured_score), updated_at = datetime('now')
         WHERE id = ?3`
      ).bind(status, featuredScore, bottleId)
    )
  );

  return listAdminBottlesByIds(env, uniqueIds);
}

export async function listAdminEvents(env: RuntimeEnv, limit: number, type?: string) {
  const base = `SELECT id, user_id, type, metadata, created_at FROM activity_events`;
  const prepared = type
    ? env.DB.prepare(`${base} WHERE type = ?1 ORDER BY created_at DESC LIMIT ?2`).bind(type, limit)
    : env.DB.prepare(`${base} ORDER BY created_at DESC LIMIT ?1`).bind(limit);
  const result = await prepared.all<AdminEventRow>();
  return (result.results ?? []).map(adminEventToApi);
}

function adminBottleToApi(row: AdminBottleRow): AdminBottle {
  return {
    id: row.id,
    title: row.title,
    gameName: row.game_name,
    category: row.category,
    description: row.description,
    imageUrl: row.image_key ? `/media/${row.image_key}` : row.image_url ?? "",
    template: row.template,
    status: row.status,
    featuredScore: row.featured_score,
    reportCount: row.report_count,
    authorName: row.author_name ?? "匿名光核玩家",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function adminEventToApi(row: AdminEventRow): AdminEvent {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    metadata: row.metadata,
    createdAt: row.created_at
  };
}

export async function auditBottleImageStorage(
  env: RuntimeEnv,
  limit: number,
  cursor?: string
): Promise<StorageAuditResult> {
  const [objects, imageRows] = await Promise.all([
    env.BOTTLE_IMAGES.list({
      prefix: "bottles/",
      limit,
      cursor
    }),
    env.DB.prepare(
      `SELECT image_key
       FROM bottles
       WHERE image_key IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 5000`
    ).all<{ image_key: string }>()
  ]);
  const trackedKeys = new Set((imageRows.results ?? []).map((row) => row.image_key));
  const scannedKeys = new Set(objects.objects.map((object) => object.key));
  const orphanKeysSample = objects.objects
    .map((object) => object.key)
    .filter((key) => !trackedKeys.has(key))
    .slice(0, 25);
  const missingKeysSample = objects.truncated
    ? []
    : [...trackedKeys].filter((key) => !scannedKeys.has(key)).slice(0, 25);

  return {
    scannedR2Objects: objects.objects.length,
    trackedD1Images: trackedKeys.size,
    orphanKeysSample,
    missingKeysSample,
    truncated: objects.truncated,
    cursor: objects.truncated ? objects.cursor ?? null : null
  };
}

export function bottlesToCsv(rows: BottleExportRow[]) {
  const headers = [
    "id",
    "title",
    "game_name",
    "category",
    "status",
    "featured_score",
    "report_count",
    "author_id",
    "author_name",
    "image_key",
    "created_at",
    "updated_at"
  ];
  const body = rows.map((row) =>
    [
      row.id,
      row.title,
      row.game_name,
      row.category,
      row.status,
      row.featured_score,
      row.report_count,
      row.author_id,
      row.author_name ?? "",
      row.image_key ?? "",
      row.created_at,
      row.updated_at
    ].map(csvCell)
  );

  return [headers, ...body].map((line) => line.join(",")).join("\n");
}

function csvCell(value: string | number) {
  let text = String(value);
  if (/^[=+\-@]/.test(text)) {
    text = `'${text}`;
  }

  if (!/[",\n\r]/.test(text)) {
    return text;
  }

  return `"${text.replace(/"/g, '""')}"`;
}
