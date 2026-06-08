import { verifyToken } from "@clerk/backend";
import type { Context, Next } from "hono";
import { ApiError } from "./http";
import type { AuthUser, RuntimeEnv } from "./types";

type Variables = {
  user: AuthUser;
};

export async function requireUser(
  c: Context<{ Bindings: RuntimeEnv; Variables: Variables }>,
  next: Next
) {
  const user = await authenticate(c);
  c.set("user", user);
  await ensureUser(c.env, user);
  await next();
}

async function authenticate(c: Context<{ Bindings: RuntimeEnv; Variables: Variables }>): Promise<AuthUser> {
  const authEnabled = c.env.CLERK_AUTH_ENABLED === "true";
  const devUser = c.req.header("X-Dev-User");

  if (!authEnabled && devUser) {
    return {
      id: sanitizeUserId(devUser),
      displayName: "光核演示玩家",
      isDemo: true
    };
  }

  if (!authEnabled && c.env.ENVIRONMENT !== "production") {
    return {
      id: "demo-user-local",
      displayName: "光核演示玩家",
      isDemo: true
    };
  }

  const token = extractToken(c);
  if (!token) {
    throw new ApiError(401, "auth_required", "请先登录后再继续。");
  }

  const verified = await verifyToken(token, {
    secretKey: c.env.CLERK_SECRET_KEY,
    jwtKey: c.env.CLERK_JWT_KEY
  });

  if (!verified.sub) {
    throw new ApiError(401, "invalid_session", "登录状态无效，请重新登录。");
  }

  return {
    id: verified.sub,
    displayName: "光核玩家",
    isDemo: false
  };
}

function extractToken(c: Context<{ Bindings: RuntimeEnv; Variables: Variables }>) {
  const authorization = c.req.header("Authorization");
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }

  const cookie = c.req.header("Cookie") ?? "";
  const session = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("__session="));
  return session ? decodeURIComponent(session.slice("__session=".length)) : null;
}

function sanitizeUserId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || "demo-user-local";
}

export async function ensureUser(env: RuntimeEnv, user: AuthUser) {
  const inviteCode = await makeInviteCode(user.id);
  await env.DB.prepare(
    `INSERT INTO users (id, display_name, avatar_url, invite_code, created_at, last_seen_at)
     VALUES (?1, ?2, ?3, ?4, datetime('now'), datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       display_name = excluded.display_name,
       avatar_url = excluded.avatar_url,
       last_seen_at = datetime('now')`
  )
    .bind(user.id, user.displayName, user.avatarUrl ?? null, inviteCode)
    .run();
}

export function isAdminUser(env: RuntimeEnv, user: AuthUser) {
  const adminIds = (env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return adminIds.includes(user.id);
}

async function makeInviteCode(userId: string) {
  const input = new TextEncoder().encode(userId);
  const digest = await crypto.subtle.digest("SHA-256", input);
  const bytes = Array.from(new Uint8Array(digest)).slice(0, 5);
  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}
