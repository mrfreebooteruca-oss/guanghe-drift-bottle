import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const strict = args.has("--strict");
const checkRemote = args.has("--remote") || args.has("--remote-secrets");
const root = process.cwd();
const projectRoot = path.resolve(root, "..");
const configPath = path.join(root, "wrangler.jsonc");
const packagePath = path.join(root, "package.json");
const config = JSON.parse(stripJsonComments(readFileSync(configPath, "utf8")));
const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
const env = {
  ...readEnvFile(path.join(root, ".env.production")),
  ...readEnvFile(path.join(root, ".env.local")),
  ...process.env
};
const checks = [];

const production = config.env?.production ?? {};
const productionVars = production.vars ?? {};
const scripts = packageJson.scripts ?? {};

addProjectLedgerGates();
addCloudflareStackGates();
addProductionConfigGates();
addContentAndOpsGates();
addVerificationCommandGates();
addManualProductionEvidenceGates();
addRemoteGates();

const blockers = checks.filter((item) => item.severity === "blocker" && !item.ok);
const warnings = checks.filter((item) => item.severity === "warn" && !item.ok);
const status = blockers.length > 0 ? "BLOCKED" : warnings.length > 0 ? "REVIEW" : "READY";

console.log(`Commercial launch gates: ${status}`);
for (const group of groupNames()) {
  console.log(`\n${group}`);
  for (const item of checks.filter((entry) => entry.group === group)) {
    const marker = item.ok ? "OK" : item.severity.toUpperCase();
    console.log(`[${marker}] ${item.name} - ${item.detail}`);
  }
}

if (strict && checks.some((item) => !item.ok)) {
  process.exit(1);
}

function addProjectLedgerGates() {
  const required = [
    ["Project ledger", path.join(projectRoot, "PROJECT.md")],
    ["Root README", path.join(projectRoot, "README.md")],
    ["Architecture doc", path.join(projectRoot, "docs/ARCHITECTURE.md")],
    ["Deployment runbook", path.join(projectRoot, "docs/DEPLOYMENT.md")],
    ["Production credentials runbook", path.join(projectRoot, "docs/PRODUCTION-CREDENTIALS.md")],
    ["QA ledger", path.join(projectRoot, "docs/QA.md")],
    ["Backup runbook", path.join(projectRoot, "docs/BACKUP.md")],
    ["Web README", path.join(root, "README.md")],
    ["Worker README", path.join(root, "worker/README.md")],
    ["Scripts README", path.join(root, "scripts/README.md")]
  ];

  for (const [name, filePath] of required) {
    gate("Project Evidence", name, existsSync(filePath), `${path.relative(projectRoot, filePath)} exists.`);
  }
}

function addCloudflareStackGates() {
  gate("Cloudflare Stack", "Worker name", Boolean(config.name), `Worker name is ${config.name ?? "missing"}.`);
  gate(
    "Cloudflare Stack",
    "Static assets",
    Boolean(config.assets?.directory) && Array.isArray(config.assets?.run_worker_first),
    "Workers Static Assets are configured with run_worker_first routes."
  );
  gate(
    "Cloudflare Stack",
    "API/media worker-first routes",
    includesAll(config.assets?.run_worker_first, ["/api/*", "/media/*"]),
    "Static assets route /api/* and /media/* through the Worker first."
  );
  gate(
    "Cloudflare Stack",
    "Observability",
    config.observability?.enabled === true,
    "Worker observability is enabled."
  );
  gate(
    "Cloudflare Stack",
    "Recent compatibility date",
    isRecentCompatibilityDate(config.compatibility_date, 60),
    `compatibility_date is ${config.compatibility_date ?? "missing"}.`
  );
  gate(
    "Cloudflare Stack",
    "Production Worker name",
    Boolean(production.name),
    `Production Worker name is ${production.name ?? "missing"}.`
  );
  gate("Cloudflare Stack", "Production D1 binding", hasItems(production.d1_databases), "D1 binding is present.");
  gate("Cloudflare Stack", "Production R2 binding", hasItems(production.r2_buckets), "R2 binding is present.");
  gate("Cloudflare Stack", "Production KV binding", hasItems(production.kv_namespaces), "KV binding is present.");
  gate(
    "Cloudflare Stack",
    "Production Queue producer",
    hasItems(production.queues?.producers),
    "Queue producer binding is present."
  );
  gate(
    "Cloudflare Stack",
    "Production Queue consumer",
    hasItems(production.queues?.consumers),
    "Queue consumer binding is present."
  );
}

function addProductionConfigGates() {
  gate(
    "Production Config",
    "Production environment flag",
    productionVars.ENVIRONMENT === "production",
    "ENVIRONMENT is production."
  );
  gate(
    "Production Config",
    "Clerk auth enabled",
    productionVars.CLERK_AUTH_ENABLED === "true",
    "CLERK_AUTH_ENABLED is true."
  );
  gate(
    "Production Config",
    "Turnstile required",
    productionVars.TURNSTILE_REQUIRED === "true",
    "TURNSTILE_REQUIRED is true."
  );
  gate(
    "Production Config",
    "Required secret declarations",
    requiredSecretsDeclared(production.secrets?.required),
    "env.production.secrets.required declares CLERK_SECRET_KEY and TURNSTILE_SECRET_KEY."
  );
  const cors = validateProductionAllowedOrigins(productionVars.ALLOWED_ORIGINS);
  gate("Production Config", "Production CORS origins", cors.ok, cors.detail);
  gate(
    "Production Config",
    "Admin user allowlist",
    hasText(productionVars.ADMIN_USER_IDS),
    "ADMIN_USER_IDS must include one or more real Clerk user ids."
  );
  gate(
    "Production Config",
    "Turnstile site key",
    hasText(productionVars.TURNSTILE_SITE_KEY),
    "TURNSTILE_SITE_KEY must be set in production vars."
  );
  gate(
    "Production Config",
    "Clerk publishable key",
    hasText(env.VITE_CLERK_PUBLISHABLE_KEY),
    "VITE_CLERK_PUBLISHABLE_KEY must be available before production build."
  );
  gate(
    "Production Config",
    "No local dev vars",
    !existsSync(path.join(root, ".dev.vars")) &&
      !existsSync(path.join(root, "dist/.dev.vars")) &&
      !existsSync(path.join(root, "dist/client/.dev.vars")),
    ".dev.vars must not be present in source or delivery output."
  );
  gate(
    "Production Config",
    "Empty secret examples",
    exampleSecretsAreEmpty(),
    ".env.example keeps backend secrets empty."
  );
}

function addContentAndOpsGates() {
  const workerIndex = readIfExists(path.join(root, "worker/index.ts"));
  const workerAdmin = readIfExists(path.join(root, "worker/lib/admin.ts"));
  const workerAuth = readIfExists(path.join(root, "worker/lib/auth.ts"));
  const workerContent = readIfExists(path.join(root, "worker/lib/content.ts"));
  const workerHttp = readIfExists(path.join(root, "worker/lib/http.ts"));
  const workerHealth = readIfExists(path.join(root, "worker/lib/health.ts"));
  const workerReports = readIfExists(path.join(root, "worker/lib/reports.ts"));
  const workerTurnstile = readIfExists(path.join(root, "worker/lib/turnstile.ts"));
  gate(
    "Content And Ops",
    "Preseed content density",
    countCsvRows(path.join(root, "scripts/preseed-bottles.csv")) >= 100,
    "At least 100 preseed bottle rows are available."
  );
  gate(
    "Content And Ops",
    "Cloudflare binding health checks",
    workerHealth.includes('env.DB.prepare("SELECT 1 AS ok")') &&
      workerHealth.includes('env.GH_CONFIG.get("healthcheck:noop")') &&
      workerHealth.includes("env.BOTTLE_IMAGES.list({ limit: 1 })") &&
      workerHealth.includes("Boolean(env.MODERATION_QUEUE)") &&
      workerIndex.includes("checkBindings(c.env)") &&
      workerIndex.includes("status: bindings.ok ? 200 : 503"),
    "/api/health probes D1, KV, R2, and Queue bindings and returns 503 on failure."
  );
  const productionAuthSmoke = readIfExists(path.join(root, "scripts/smoke-production-auth.mjs"));
  gate(
    "Content And Ops",
    "Clerk production auth boundary",
    workerAuth.includes('import { verifyToken } from "@clerk/backend"') &&
      workerAuth.includes('const authEnabled = c.env.CLERK_AUTH_ENABLED === "true"') &&
      workerAuth.includes('if (!authEnabled && devUser)') &&
      workerAuth.includes('if (!authEnabled && c.env.ENVIRONMENT !== "production")') &&
      workerAuth.includes("extractToken(c)") &&
      workerAuth.includes("auth_required") &&
      workerAuth.includes("verifyToken(token") &&
      workerAuth.includes("secretKey: c.env.CLERK_SECRET_KEY") &&
      workerAuth.includes("jwtKey: c.env.CLERK_JWT_KEY") &&
      workerAuth.includes("invalid_session") &&
      workerAuth.includes("Authorization") &&
      workerAuth.includes("__session=") &&
      productionAuthSmoke.includes("GET /api/bootstrap dev header ignored") &&
      productionAuthSmoke.includes('"X-Dev-User": "production-smoke-dev-user"') &&
      productionAuthSmoke.includes("auth_required"),
    "Production auth ignores X-Dev-User, requires Clerk session tokens, verifies Clerk JWTs, and smoke-tests the boundary."
  );
  const productionTurnstileSmoke = readIfExists(path.join(root, "scripts/smoke-production-turnstile.mjs"));
  gate(
    "Content And Ops",
    "Turnstile server validation",
    workerIndex.includes("turnstileSiteKey: c.env.TURNSTILE_SITE_KEY || null") &&
      workerIndex.includes('turnstileRequired: c.env.TURNSTILE_REQUIRED === "true"') &&
      workerIndex.includes("await verifyTurnstile(") &&
      workerIndex.includes('String(form.get("turnstileToken") ?? "") || null') &&
      workerTurnstile.includes('const required = env.TURNSTILE_REQUIRED === "true"') &&
      workerTurnstile.includes("const secret = env.TURNSTILE_SECRET_KEY") &&
      workerTurnstile.includes("turnstile_not_configured") &&
      workerTurnstile.includes("turnstile_required") &&
      workerTurnstile.includes("https://challenges.cloudflare.com/turnstile/v0/siteverify") &&
      workerTurnstile.includes('method: "POST"') &&
      workerTurnstile.includes('body.set("remoteip", remoteIp)') &&
      workerTurnstile.includes("turnstile_unavailable") &&
      workerTurnstile.includes("!result.success") &&
      workerTurnstile.includes("turnstile_failed") &&
      productionTurnstileSmoke.includes("GET /api/bootstrap auth turnstile config") &&
      productionTurnstileSmoke.includes("POST /api/bottles missing turnstile") &&
      productionTurnstileSmoke.includes("turnstile_required"),
    "Production submissions require server-side Turnstile verification and smoke-test the missing-token path."
  );
  gate(
    "Content And Ops",
    "UGC report endpoint",
    workerIndex.includes('app.post("/api/bottles/:id/report"'),
    "User report endpoint exists."
  );
  gate(
    "Content And Ops",
    "UGC report safety",
    workerIndex.includes('app.post("/api/bottles/:id/report"') &&
      workerIndex.includes('parts: ["report", "user", user.id], limit: 20, windowSeconds: 86400') &&
      workerIndex.includes("invalid_bottle_id") &&
      workerIndex.includes("invalid_report_reason") &&
      workerIndex.includes("invalid_report_details") &&
      workerIndex.includes('"bottle_reported"') &&
      workerReports.includes("REPORT_AUTO_REVIEW_THRESHOLD = 3") &&
      workerReports.includes("cannot_report_own_bottle") &&
      workerReports.includes("INSERT OR IGNORE INTO bottle_reports") &&
      workerReports.includes("bottle_already_reported") &&
      workerReports.includes("status = CASE") &&
      workerReports.includes("THEN 'pending'"),
    "UGC reports validate input, limit abuse, dedupe reporters, reject self-reports, and auto-queue review."
  );
  gate(
    "Content And Ops",
    "Admin metrics endpoint",
    workerIndex.includes('app.get("/api/admin/metrics"'),
    "Admin metrics endpoint exists."
  );
  gate(
    "Content And Ops",
    "Admin bottle list endpoint",
    workerIndex.includes('app.get("/api/admin/bottles"'),
    "Admin bottle list endpoint exists."
  );
  gate(
    "Content And Ops",
    "Admin event endpoint",
    workerIndex.includes('app.get("/api/admin/events"'),
    "Admin event endpoint exists."
  );
  gate(
    "Content And Ops",
    "Admin CSV export",
    workerIndex.includes('app.get("/api/admin/export/bottles.csv"'),
    "Admin CSV export endpoint exists."
  );
  gate(
    "Content And Ops",
    "Admin CSV export safety",
    workerIndex.includes("invalid_export_status") &&
      workerIndex.includes("Math.min(Math.max(toInt(c.req.query(\"limit\"), 1000), 1), 5000)") &&
      workerIndex.includes('"Content-Type": "text/csv; charset=utf-8"') &&
      workerIndex.includes("bottlesToCsv(rows)") &&
      workerAdmin.includes("function csvCell") &&
      workerAdmin.includes("/^[=+\\-@]/.test(text)") &&
      workerAdmin.includes('text.replace(/"/g, \'""\')'),
    "CSV export validates status/limit and escapes spreadsheet formula and quote risks."
  );
  gate(
    "Content And Ops",
    "Admin read query safety",
    workerIndex.includes('app.get("/api/admin/bottles"') &&
      workerIndex.includes("invalid_bottle_status") &&
      workerIndex.includes('Math.min(Math.max(toInt(c.req.query("limit"), 50), 1), 200)') &&
      workerIndex.includes('app.get("/api/admin/events"') &&
      workerIndex.includes("invalid_event_type") &&
      workerIndex.includes("type.length > 64") &&
      workerIndex.includes("!/^[a-z0-9_:-]+$/i.test(type)") &&
      workerIndex.includes('Math.min(Math.max(toInt(c.req.query("limit"), 20), 1), 100)') &&
      workerIndex.includes('app.get("/api/admin/storage/audit"') &&
      workerIndex.includes('Math.min(Math.max(toInt(c.req.query("limit"), 1000), 1), 1000)') &&
      workerAdmin.includes("status === \"all\"") &&
      workerAdmin.includes('status === "reported"') &&
      workerAdmin.includes("env.DB.prepare(query).bind(limit)") &&
      workerAdmin.includes("env.DB.prepare(query).bind(status, limit)") &&
      workerAdmin.includes("env.DB.prepare(`${base} WHERE type = ?1 ORDER BY created_at DESC LIMIT ?2`).bind(type, limit)") &&
      workerAdmin.includes("env.DB.prepare(`${base} ORDER BY created_at DESC LIMIT ?1`).bind(limit)"),
    "Admin read endpoints validate filters, clamp limits, and use D1 parameter binding."
  );
  gate(
    "Content And Ops",
    "Admin storage audit",
    workerIndex.includes('app.get("/api/admin/storage/audit"'),
    "Admin storage audit endpoint exists."
  );
  gate(
    "Content And Ops",
    "Bulk moderation",
    workerIndex.includes('app.post("/api/admin/bottles/moderation/bulk"'),
    "Bulk moderation endpoint exists."
  );
  gate(
    "Content And Ops",
    "Bulk moderation safety",
    workerIndex.includes('app.post("/api/admin/bottles/moderation/bulk"') &&
      workerIndex.includes("!isAdminUser(c.env, user)") &&
      workerIndex.includes("!Array.isArray(payload.bottleIds) || !isBottleStatus(payload.status)") &&
      workerIndex.includes("bottleIds.length > 100") &&
      workerIndex.includes("bulk_moderation_limit") &&
      workerIndex.includes("Math.max(0, Math.min(999, Math.trunc(payload.featuredScore)))") &&
      workerIndex.includes('"admin_moderation_bulk_updated"') &&
      workerAdmin.includes("const uniqueIds = [...new Set(bottleIds)]"),
    "Bulk moderation validates admin, payload, dedupes ids, caps 100 items, and records events."
  );
  gate(
    "Content And Ops",
    "Queue consumer ack/retry",
    workerIndex.includes("async queue(batch: MessageBatch<ModerationMessage>") &&
      workerIndex.includes('recordEvent(env, "moderation_queued"') &&
      workerIndex.includes("message.ack()") &&
      workerIndex.includes("message.retry()") &&
      workerIndex.includes('"queue_message_failed"'),
    "Queue consumer records moderation events, acks success, and retries failures."
  );
  gate(
    "Content And Ops",
    "R2 create cleanup",
    workerIndex.includes("BOTTLE_IMAGES.put(imageKey") &&
      workerIndex.includes("BOTTLE_IMAGES.delete(imageKey)") &&
      workerIndex.includes('"r2_cleanup_failed"') &&
      workerIndex.includes("throw error;"),
    "Bottle creation cleans up the uploaded R2 image if D1 metadata insert fails."
  );
  gate(
    "Content And Ops",
    "Image upload validation",
    workerIndex.includes("validateImage(imageEntry instanceof File ? imageEntry : null)") &&
      workerIndex.includes("BOTTLE_IMAGES.put(imageKey, image.stream()") &&
      workerIndex.includes("contentType: image.type") &&
      workerContent.includes("export function validateImage(file: File | null)") &&
      workerContent.includes("image_required") &&
      workerContent.includes('new Set(["image/jpeg", "image/png", "image/webp", "image/gif"])') &&
      workerContent.includes("invalid_image_type") &&
      workerContent.includes("file.size <= 0") &&
      workerContent.includes("image_empty") &&
      workerContent.includes("8 * 1024 * 1024") &&
      workerContent.includes("image_too_large"),
    "Bottle creation requires a non-empty JPG/PNG/WEBP/GIF image, caps uploads at 8MB, and stores the R2 content type."
  );
  gate(
    "Content And Ops",
    "KV rate limit coverage",
    workerIndex.includes('from "./lib/rateLimit"') &&
      workerIndex.includes('parts: ["bottle", "user", user.id], limit: 12, windowSeconds: 86400') &&
      workerIndex.includes('parts: ["bottle", "ip", clientIp(c)], limit: 60, windowSeconds: 3600') &&
      workerIndex.includes('parts: ["dredge", "user", user.id], limit: 30, windowSeconds: 60') &&
      workerIndex.includes('parts: ["report", "user", user.id], limit: 20, windowSeconds: 86400') &&
      workerIndex.includes('parts: ["share", "user", user.id], limit: 10, windowSeconds: 3600'),
    "Bottle create, dredge, report, and share endpoints keep KV-backed rate limits."
  );
  gate(
    "Content And Ops",
    "Media proxy key guard",
    workerIndex.includes('app.get("/media/*"') &&
      workerIndex.includes("isSafeMediaKey") &&
      workerIndex.includes('key.startsWith("bottles/")') &&
      workerIndex.includes('!key.includes("..")') &&
      workerIndex.includes('!key.includes("//")'),
    "/media/* only proxies safe bottles/ image keys."
  );
  gate(
    "Content And Ops",
    "Media proxy cache headers",
    workerIndex.includes('"Cache-Control", "public, max-age=86400, stale-while-revalidate=604800"') &&
      workerIndex.includes('"ETag", object.httpEtag'),
    "/media/* responses carry bounded public cache headers and ETag."
  );
  gate(
    "Content And Ops",
    "API cache/CORS response headers",
    workerHttp.includes('"Cache-Control", "no-store"') &&
      workerHttp.includes('"Vary", "Origin"'),
    "/api/* responses are guarded with no-store and Vary: Origin."
  );
  const publicSmoke = readIfExists(path.join(root, "scripts/smoke-public.mjs"));
  gate(
    "Content And Ops",
    "API error response contract",
    workerIndex.includes("app.onError((error, c) =>") &&
      workerIndex.includes("error instanceof ApiError") &&
      workerIndex.includes("jsonError(error.status, error.code, error.message)") &&
      workerIndex.includes('type: "api_error"') &&
      workerIndex.includes('jsonError(500, "internal_error"') &&
      workerIndex.includes("app.notFound((c) =>") &&
      workerIndex.includes('jsonError(404, "not_found"') &&
      workerIndex.includes('app.use("*", requestId)') &&
      workerIndex.includes('app.use("*", securityHeaders)') &&
      workerIndex.includes('app.use("*", errorBoundary)') &&
      workerHttp.includes("export class ApiError extends Error") &&
      workerHttp.includes("export function jsonError(status: number, code: string, message: string)") &&
      workerHttp.includes("const body: ApiErrorBody = { error: { code, message } }") &&
      workerHttp.includes("crypto.randomUUID()") &&
      workerHttp.includes('c.header("X-Request-Id", requestId)') &&
      workerHttp.includes('c.header("Cache-Control", "no-store")') &&
      workerHttp.includes('c.header("Vary", "Origin")') &&
      publicSmoke.includes("GET /api/not-found smoke") &&
      publicSmoke.includes("not_found"),
    "API errors and missing API routes stay structured, request-traced, uncached, and smoke-tested."
  );
}

function addVerificationCommandGates() {
  const requiredScripts = [
    "audit:source",
    "verify:local",
    "verify:production",
    "launch:readiness",
    "launch:readiness:remote:strict",
    "launch:gates",
    "launch:gates:remote:strict",
    "deploy:production:retry",
    "smoke:public:headers",
    "smoke:production:auth",
    "smoke:production:admin",
    "smoke:production:turnstile"
  ];

  for (const name of requiredScripts) {
    gate("Verification Commands", name, hasText(scripts[name]), `npm script ${name} is defined.`);
  }

  const missingTargets = missingNodeScriptTargets();
  gate(
    "Verification Commands",
    "Node script targets",
    missingTargets.length === 0,
    missingTargets.length === 0
      ? "All package node scripts point to existing files."
      : `Missing script targets: ${missingTargets.join(", ")}.`
  );

  gate(
    "Verification Commands",
    "Preview dry-run build freshness",
    scripts["cf:check"]?.includes("npm run build"),
    "cf:check builds the current preview bundle before Wrangler dry-run."
  );
  gate(
    "Verification Commands",
    "Production dry-run build freshness",
    scripts["cf:check:production"]?.includes("npm run build:production"),
    "cf:check:production builds the current production bundle before Wrangler dry-run."
  );
  gate(
    "Verification Commands",
    "Preview deploy build freshness",
    scripts["deploy:retry"]?.includes("npm run build"),
    "deploy:retry builds the current preview bundle before guarded deploy."
  );
  gate(
    "Verification Commands",
    "Production deploy build freshness",
    scripts["deploy:production:retry"]?.includes("npm run build:production"),
    "deploy:production:retry builds the current production bundle before guarded deploy."
  );

  const deployWithRetry = readIfExists(path.join(root, "scripts/deploy-with-retry.mjs"));
  gate(
    "Verification Commands",
    "Production deploy guard",
    deployWithRetry.includes("--remote-secrets") && deployWithRetry.includes("--strict") && deployWithRetry.includes("production"),
    "Production deploy retry script runs remote strict readiness before deploy."
  );

  const smokeScripts = [
    "scripts/smoke-public.mjs",
    "scripts/smoke-production-auth.mjs",
    "scripts/smoke-production-admin.mjs",
    "scripts/smoke-production-turnstile.mjs"
  ];
  gate(
    "Verification Commands",
    "API header smoke coverage",
    smokeScripts.every((file) => readIfExists(path.join(root, file)).includes("api vary origin missing")),
    "Public and production smoke scripts assert /api/* Vary: Origin."
  );

  const auditSource = readIfExists(path.join(root, "scripts/audit-source.mjs"));
  gate(
    "Verification Commands",
    "Documentation secret hygiene audit",
    auditSource.includes("checkDocumentationSecretHygiene") &&
      auditSource.includes("Clerk secret key") &&
      auditSource.includes("SMOKE_ADMIN_BEARER_TOKEN") &&
      auditSource.includes("session cookie"),
    "audit:source scans docs and ledgers for real secret, JWT, cookie, and smoke token values."
  );
}

function addManualProductionEvidenceGates() {
  gate(
    "Manual Production Evidence",
    "Real Clerk browser login",
    env.LAUNCH_CONFIRMED_REAL_CLERK_LOGIN === "true",
    "Set LAUNCH_CONFIRMED_REAL_CLERK_LOGIN=true after real browser login verification."
  );
  gate(
    "Manual Production Evidence",
    "Real admin browser action",
    env.LAUNCH_CONFIRMED_REAL_ADMIN_ACTION === "true",
    "Set LAUNCH_CONFIRMED_REAL_ADMIN_ACTION=true after real admin moderation/export/storage verification."
  );
  gate(
    "Manual Production Evidence",
    "Real Turnstile submission",
    env.LAUNCH_CONFIRMED_REAL_TURNSTILE_SUBMISSION === "true",
    "Set LAUNCH_CONFIRMED_REAL_TURNSTILE_SUBMISSION=true after a real Turnstile-protected submission."
  );
}

function addRemoteGates() {
  if (!checkRemote) {
    gate(
      "Remote Production Evidence",
      "Production Worker and secrets",
      false,
      "Run `npm run launch:gates:remote` to verify production Worker and deployed secret names."
    );
    return;
  }

  const remoteSecrets = readRemoteSecretNames();
  gate(
    "Remote Production Evidence",
    "Production Worker exists",
    remoteSecrets.ok,
    remoteSecrets.ok ? "Production Worker can be inspected with Wrangler." : remoteWorkerDetail(remoteSecrets)
  );
  gate(
    "Remote Production Evidence",
    "Clerk secret key",
    remoteSecrets.names.has("CLERK_SECRET_KEY"),
    "CLERK_SECRET_KEY secret name exists in Cloudflare production Worker."
  );
  gate(
    "Remote Production Evidence",
    "Turnstile secret key",
    remoteSecrets.names.has("TURNSTILE_SECRET_KEY"),
    "TURNSTILE_SECRET_KEY secret name exists in Cloudflare production Worker."
  );
}

function gate(group, name, ok, detail, severity = "blocker") {
  checks.push({ group, name, ok: Boolean(ok), detail, severity });
}

function groupNames() {
  return [...new Set(checks.map((item) => item.group))];
}

function hasItems(value) {
  return Array.isArray(value) && value.length > 0;
}

function hasText(value) {
  return Boolean(String(value ?? "").trim());
}

function requiredSecretsDeclared(value) {
  return Array.isArray(value) && ["CLERK_SECRET_KEY", "TURNSTILE_SECRET_KEY"].every((name) => value.includes(name));
}

function includesAll(value, expected) {
  return Array.isArray(value) && expected.every((item) => value.includes(item));
}

function isRecentCompatibilityDate(value, maxAgeDays) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  const now = new Date();
  const ageMs = now.getTime() - date.getTime();
  return Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= maxAgeDays * 24 * 60 * 60 * 1000;
}

function validateProductionAllowedOrigins(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return {
      ok: false,
      detail: "Set production ALLOWED_ORIGINS to the production workers.dev origin or custom domain."
    };
  }

  const origins = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const invalid = [];

  for (const origin of origins) {
    if (origin === "*" || origin.includes("*")) {
      invalid.push(`${origin} uses a wildcard`);
      continue;
    }

    let parsed;
    try {
      parsed = new URL(origin);
    } catch {
      invalid.push(`${origin} is not a valid URL`);
      continue;
    }

    if (parsed.protocol !== "https:") {
      invalid.push(`${origin} must use https`);
      continue;
    }

    if (parsed.origin !== origin) {
      invalid.push(`${origin} must be an origin only, without path, query, hash or trailing slash`);
      continue;
    }

    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host === "::1" || /^127\./.test(host)) {
      invalid.push(`${origin} points to a local host`);
    }
  }

  if (invalid.length > 0) {
    return {
      ok: false,
      detail: `Fix production ALLOWED_ORIGINS: ${invalid.join("; ")}.`
    };
  }

  return {
    ok: true,
    detail: `Production ALLOWED_ORIGINS is pinned to ${origins.join(", ")}.`
  };
}

function exampleSecretsAreEmpty() {
  const envExample = path.join(root, ".env.example");
  if (!existsSync(envExample)) return true;
  const content = readFileSync(envExample, "utf8");
  const secretKeys = ["CLERK_SECRET_KEY", "CLERK_JWT_KEY", "TURNSTILE_SECRET_KEY"];
  return secretKeys.every((key) => {
    const match = content.match(new RegExp(`^${key}=(.*)$`, "m"));
    return !match || !match[1].trim();
  });
}

function missingNodeScriptTargets() {
  const missing = [];
  const nodeScriptPattern = /\bnode\s+(scripts\/[^\s&|;]+\.mjs)\b/g;

  for (const command of Object.values(scripts)) {
    for (const match of String(command).matchAll(nodeScriptPattern)) {
      const target = match[1];
      if (!existsSync(path.join(root, target))) {
        missing.push(target);
      }
    }
  }

  return [...new Set(missing)];
}

function readRemoteSecretNames() {
  const result = spawnSync(
    "npx",
    ["wrangler", "secret", "list", "--env", "production", "--format", "json"],
    {
      cwd: root,
      encoding: "utf8"
    }
  );
  if (result.status !== 0) {
    const error = sanitizeWranglerError(result.stderr || result.stdout || "Wrangler secret list failed.");
    return {
      ok: false,
      names: new Set(),
      error,
      workerMissing: /Worker .* not found/i.test(error)
    };
  }
  try {
    const parsed = JSON.parse(result.stdout || "[]");
    const names = new Set(
      Array.isArray(parsed)
        ? parsed.map((item) => String(item.name ?? item.key ?? "")).filter(Boolean)
        : []
    );
    return { ok: true, names, error: "", workerMissing: false };
  } catch {
    return {
      ok: false,
      names: new Set(),
      error: "Wrangler secret list returned invalid JSON.",
      workerMissing: false
    };
  }
}

function remoteWorkerDetail(remoteSecrets) {
  if (remoteSecrets.workerMissing) {
    return "Production Worker is not created yet. Set real Clerk, Turnstile and admin config, then follow docs/DEPLOYMENT.md.";
  }

  return remoteSecrets.error;
}

function sanitizeWranglerError(value) {
  return value
    .replace(/\x1b\[[0-9;]*m/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function countCsvRows(filePath) {
  if (!existsSync(filePath)) return 0;
  return readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim()).length - 1;
}

function readIfExists(filePath) {
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
}

function readEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const result = {};
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^"|"$/g, "");
    result[key] = value;
  }
  return result;
}

function stripJsonComments(value) {
  return value
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}
