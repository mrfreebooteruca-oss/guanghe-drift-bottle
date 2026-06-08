import { ApiError } from "./http";
import type { AuthUser, BottleRow, RuntimeEnv } from "./types";

export const REPORT_REASONS = [
  "spam",
  "harassment",
  "adult",
  "hate",
  "spoiler",
  "other"
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export type BottleReportResult = {
  bottleId: string;
  reportCount: number;
  status: BottleRow["status"];
  autoQueued: boolean;
};

const REPORT_AUTO_REVIEW_THRESHOLD = 3;

type BottleReportRow = Pick<BottleRow, "id" | "author_id" | "status" | "report_count">;

export function isReportReason(value: unknown): value is ReportReason {
  return typeof value === "string" && REPORT_REASONS.includes(value as ReportReason);
}

export async function submitBottleReport(
  env: RuntimeEnv,
  user: AuthUser,
  bottleId: string,
  reason: ReportReason,
  details: string | null
): Promise<BottleReportResult> {
  const bottle = await env.DB.prepare(
    `SELECT id, author_id, status, report_count
     FROM bottles
     WHERE id = ?1`
  )
    .bind(bottleId)
    .first<BottleReportRow>();

  if (!bottle) {
    throw new ApiError(404, "bottle_not_found", "漂流瓶不存在。");
  }

  if (bottle.author_id === user.id) {
    throw new ApiError(400, "cannot_report_own_bottle", "不能举报自己投递的漂流瓶。");
  }

  const reportId = crypto.randomUUID();
  const insert = await env.DB.prepare(
    `INSERT OR IGNORE INTO bottle_reports (id, bottle_id, reporter_id, reason, details, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))`
  )
    .bind(reportId, bottleId, user.id, reason, details)
    .run();

  if ((insert.meta.changes ?? 0) === 0) {
    throw new ApiError(409, "bottle_already_reported", "你已经举报过这只漂流瓶。");
  }

  const nextReportCount = bottle.report_count + 1;
  const autoQueued = bottle.status === "approved" && nextReportCount >= REPORT_AUTO_REVIEW_THRESHOLD;
  const nextStatus = autoQueued ? "pending" : bottle.status;
  await env.DB.prepare(
    `UPDATE bottles
     SET report_count = report_count + 1,
         status = CASE
           WHEN status = 'approved' AND report_count + 1 >= ?1 THEN 'pending'
           ELSE status
         END,
         updated_at = datetime('now')
     WHERE id = ?2`
  )
    .bind(REPORT_AUTO_REVIEW_THRESHOLD, bottleId)
    .run();

  return {
    bottleId,
    reportCount: nextReportCount,
    status: nextStatus,
    autoQueued
  };
}
