import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const notes = [];
const sourceRoots = ["src", "worker", "migrations", "scripts"];
const sourceExtensions = new Set([".css", ".js", ".mjs", ".sql", ".ts", ".tsx"]);
const forbiddenPatterns = [
  { name: "Math.random", pattern: /Math\.random\s*\(/ },
  { name: "ORDER BY RANDOM", pattern: /ORDER\s+BY\s+RANDOM\s*\(/i },
  { name: "passThroughOnException", pattern: /passThroughOnException/ },
  { name: "unsafe double cast", pattern: /as\s+unknown\s+as/ },
  { name: "TODO/FIXME marker", pattern: /\b(?:TODO|FIXME)\b/ }
];

for (const filePath of listSourceFiles()) {
  const relative = path.relative(root, filePath);
  const content = readFileSync(filePath, "utf8");
  for (const item of forbiddenPatterns) {
    if (item.pattern.test(content)) {
      failures.push(`${relative}: forbidden pattern ${item.name}`);
    }
  }
}

for (const filePath of [".dev.vars", "dist/.dev.vars", "dist/client/.dev.vars"]) {
  if (existsSync(path.join(root, filePath))) {
    failures.push(`${filePath}: local dev vars must not be present in delivery output`);
  }
}

checkExampleEnv();
checkDocumentationSecretHygiene();
checkPackageScriptTargets();
checkProductionSmokeContracts();
checkSecurityHeaderSmokeContracts();
checkClerkAuthBoundaryContract();
checkTurnstileContract();
checkMediaProxyContract();
checkQueueConsumerContract();
checkR2CreateCleanupContract();
checkImageUploadContract();
checkRateLimitContract();
checkBindingHealthContract();
checkAdminReadQueryContract();
checkApiErrorResponseContract();
checkAdminCsvExportContract();
checkBulkModerationContract();
checkUgcReportContract();
checkClientBuildHygiene();
checkAssetBudgets();

if (failures.length > 0) {
  console.error("Source audit failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Source audit passed.");
for (const note of notes) console.log(`- ${note}`);

function listSourceFiles() {
  const files = [];
  for (const sourceRoot of sourceRoots) {
    const absolute = path.join(root, sourceRoot);
    if (!existsSync(absolute)) continue;
    walk(absolute, files);
  }
  return files;
}

function walk(directory, files) {
  for (const name of readdirSync(directory)) {
    const absolute = path.join(directory, name);
    const relative = path.relative(root, absolute);
    if (relative === "scripts/audit-source.mjs" || relative === "scripts/preseed.generated.sql") {
      continue;
    }
    const stat = statSync(absolute);
    if (stat.isDirectory()) {
      walk(absolute, files);
      continue;
    }
    if (sourceExtensions.has(path.extname(name))) {
      files.push(absolute);
    }
  }
}

function checkExampleEnv() {
  const envExample = path.join(root, ".env.example");
  if (!existsSync(envExample)) return;
  const content = readFileSync(envExample, "utf8");
  const secretKeys = ["CLERK_SECRET_KEY", "CLERK_JWT_KEY", "TURNSTILE_SECRET_KEY"];
  for (const key of secretKeys) {
    const match = content.match(new RegExp(`^${key}=(.*)$`, "m"));
    if (match && match[1].trim()) {
      failures.push(`.env.example: ${key} must stay empty`);
    }
  }
}

function checkDocumentationSecretHygiene() {
  const projectRoot = path.resolve(root, "..");
  const docs = [
    path.join(projectRoot, "README.md"),
    path.join(projectRoot, "PROJECT.md"),
    ...markdownFiles(path.join(projectRoot, "docs")),
    path.join(root, "README.md"),
    path.join(root, "src/README.md"),
    path.join(root, "worker/README.md"),
    path.join(root, "scripts/README.md")
  ].filter((filePath) => existsSync(filePath));
  const rawSecretPatterns = [
    { name: "Clerk secret key", pattern: /\bsk_(?:live|test)_[A-Za-z0-9_-]{16,}\b/ },
    { name: "JWT", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
    { name: "session cookie", pattern: /__session=[^;\s`"']+/ }
  ];
  const sensitiveAssignments = [
    "CLERK_SECRET_KEY",
    "TURNSTILE_SECRET_KEY",
    "CLOUDFLARE_API_TOKEN",
    "CF_API_TOKEN",
    "SMOKE_ADMIN_BEARER_TOKEN",
    "SMOKE_NON_ADMIN_BEARER_TOKEN",
    "SMOKE_USER_BEARER_TOKEN",
    "SMOKE_ADMIN_COOKIE",
    "SMOKE_NON_ADMIN_COOKIE",
    "SMOKE_USER_COOKIE"
  ];

  for (const filePath of docs) {
    const relative = path.relative(projectRoot, filePath);
    const content = readFileSync(filePath, "utf8");
    for (const item of rawSecretPatterns) {
      if (item.pattern.test(content)) {
        failures.push(`${relative}: documentation must not contain ${item.name} values`);
      }
    }

    const lines = content.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      for (const key of sensitiveAssignments) {
        const value = assignedValue(line, key);
        if (value !== null && !isSafePlaceholder(value)) {
          failures.push(`${relative}:${index + 1}: ${key} must use an empty value or <placeholder> in documentation`);
        }
      }
    }
  }
}

function markdownFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => name.endsWith(".md"))
    .map((name) => path.join(directory, name));
}

function assignedValue(line, key) {
  const match = line.match(new RegExp(`\\b(?:export\\s+)?${key}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s\`]+))`));
  if (!match) return null;
  return (match[2] ?? match[3] ?? match[4] ?? "").trim();
}

function isSafePlaceholder(value) {
  return !value || /^<[^>]+>$/.test(value) || /^\$\{[^}]+}$/.test(value);
}

function checkPackageScriptTargets() {
  const packageJson = path.join(root, "package.json");
  if (!existsSync(packageJson)) return;
  const parsed = JSON.parse(readFileSync(packageJson, "utf8"));
  const scripts = parsed.scripts ?? {};
  const nodeScriptPattern = /\bnode\s+(scripts\/[^\s&|;]+\.mjs)\b/g;

  for (const [scriptName, command] of Object.entries(scripts)) {
    for (const match of String(command).matchAll(nodeScriptPattern)) {
      const target = match[1];
      if (!existsSync(path.join(root, target))) {
        failures.push(`package.json:${scriptName}: missing script target ${target}`);
      }
    }
  }

  requireScriptIncludes(scripts, "cf:check", ["npm run build", "wrangler deploy --dry-run"]);
  requireScriptIncludes(scripts, "cf:check:production", ["npm run build:production", "wrangler deploy --dry-run", "--env production"]);
  requireScriptIncludes(scripts, "deploy:retry", ["npm run build", "node scripts/deploy-with-retry.mjs"]);
  requireScriptIncludes(scripts, "deploy:production:retry", [
    "npm run build:production",
    "node scripts/deploy-with-retry.mjs",
    "--env production"
  ]);
  requireScriptIncludes(scripts, "verify:local", ["npm run cf:check", "npm run audit:source", "npm run smoke:local:all"]);
  requireScriptIncludes(scripts, "verify:launch", ["npm run cf:check", "npm run audit:source"]);
  requireScriptIncludes(scripts, "verify:production", ["npm run cf:check:production", "npm run audit:source"]);
}

function requireScriptIncludes(scripts, name, parts) {
  const command = String(scripts[name] ?? "");
  if (!command) {
    failures.push(`package.json:${name}: required script is missing`);
    return;
  }
  for (const part of parts) {
    if (!command.includes(part)) {
      failures.push(`package.json:${name}: expected to include ${part}`);
    }
  }
}

function checkProductionSmokeContracts() {
  const smokeContracts = [
    {
      file: "scripts/smoke-production-auth.mjs",
      parts: [
        "validateInputs();",
        "validateBaseUrlOrigin",
        "validateSmokeOrigin",
        "bare origin base URL",
        "SMOKE_ALLOWED_ORIGIN",
        "SMOKE_DENIED_ORIGIN",
        "ALLOW_INSECURE_PRODUCTION_SMOKE",
        "https://"
      ]
    },
    {
      file: "scripts/smoke-production-admin.mjs",
      parts: [
        "validateInputs();",
        "validateBaseUrlOrigin",
        "validateSmokeOrigin",
        "bare origin base URL",
        "SMOKE_ALLOWED_ORIGIN",
        "SMOKE_DENIED_ORIGIN",
        "ALLOW_INSECURE_PRODUCTION_SMOKE",
        "https://"
      ]
    },
    {
      file: "scripts/smoke-production-turnstile.mjs",
      parts: [
        "validateInputs();",
        "validateBaseUrlOrigin",
        "validateSmokeOrigin",
        "bare origin base URL",
        "SMOKE_ALLOWED_ORIGIN",
        "SMOKE_DENIED_ORIGIN",
        "ALLOW_INSECURE_PRODUCTION_SMOKE",
        "https://",
        "OPTIONS /api/bottles CORS allowed origin",
        "OPTIONS /api/bottles CORS denied origin",
        "Access-Control-Request-Method\": \"POST\""
      ]
    }
  ];

  for (const contract of smokeContracts) {
    const absolute = path.join(root, contract.file);
    if (!existsSync(absolute)) {
      failures.push(`${contract.file}: production smoke script is missing`);
      continue;
    }
    const content = readFileSync(absolute, "utf8");
    for (const part of contract.parts) {
      if (!content.includes(part)) {
        failures.push(`${contract.file}: expected to include ${part}`);
      }
    }
  }
}

function checkSecurityHeaderSmokeContracts() {
  const smokeScripts = [
    "scripts/smoke-public.mjs",
    "scripts/smoke-production-auth.mjs",
    "scripts/smoke-production-admin.mjs",
    "scripts/smoke-production-turnstile.mjs"
  ];
  const requiredParts = [
    "x-request-id missing",
    "api cache-control missing",
    "api vary origin missing",
    "permissions-policy missing"
  ];

  for (const file of smokeScripts) {
    const absolute = path.join(root, file);
    if (!existsSync(absolute)) {
      failures.push(`${file}: security header smoke script is missing`);
      continue;
    }
    const content = readFileSync(absolute, "utf8");
    for (const part of requiredParts) {
      if (!content.includes(part)) {
        failures.push(`${file}: expected security header smoke to include ${part}`);
      }
    }
  }
}

function checkClerkAuthBoundaryContract() {
  const workerAuth = path.join(root, "worker/lib/auth.ts");
  const productionAuthSmoke = path.join(root, "scripts/smoke-production-auth.mjs");
  if (!existsSync(workerAuth) || !existsSync(productionAuthSmoke)) {
    failures.push("Clerk auth boundary contract: auth module or production auth smoke is missing");
    return;
  }

  const authContent = readFileSync(workerAuth, "utf8");
  const smokeContent = readFileSync(productionAuthSmoke, "utf8");
  const requiredParts = [
    [authContent, 'import { verifyToken } from "@clerk/backend"'],
    [authContent, 'const authEnabled = c.env.CLERK_AUTH_ENABLED === "true"'],
    [authContent, 'if (!authEnabled && devUser)'],
    [authContent, 'if (!authEnabled && c.env.ENVIRONMENT !== "production")'],
    [authContent, "extractToken(c)"],
    [authContent, "auth_required"],
    [authContent, "verifyToken(token"],
    [authContent, "secretKey: c.env.CLERK_SECRET_KEY"],
    [authContent, "jwtKey: c.env.CLERK_JWT_KEY"],
    [authContent, "invalid_session"],
    [authContent, "Authorization"],
    [authContent, "__session="],
    [smokeContent, "GET /api/bootstrap dev header ignored"],
    [smokeContent, '"X-Dev-User": "production-smoke-dev-user"'],
    [smokeContent, "auth_required"]
  ];

  for (const [content, part] of requiredParts) {
    if (!content.includes(part)) {
      failures.push(`Clerk auth boundary contract missing ${part}`);
    }
  }
}

function checkTurnstileContract() {
  const workerIndex = path.join(root, "worker/index.ts");
  const workerTurnstile = path.join(root, "worker/lib/turnstile.ts");
  const productionTurnstileSmoke = path.join(root, "scripts/smoke-production-turnstile.mjs");
  if (!existsSync(workerIndex) || !existsSync(workerTurnstile) || !existsSync(productionTurnstileSmoke)) {
    failures.push("Turnstile contract: Worker entry, turnstile module, or production smoke is missing");
    return;
  }

  const indexContent = readFileSync(workerIndex, "utf8");
  const turnstileContent = readFileSync(workerTurnstile, "utf8");
  const smokeContent = readFileSync(productionTurnstileSmoke, "utf8");
  const requiredParts = [
    [indexContent, "turnstileSiteKey: c.env.TURNSTILE_SITE_KEY || null"],
    [indexContent, 'turnstileRequired: c.env.TURNSTILE_REQUIRED === "true"'],
    [indexContent, "await verifyTurnstile("],
    [indexContent, 'String(form.get("turnstileToken") ?? "") || null'],
    [turnstileContent, 'const required = env.TURNSTILE_REQUIRED === "true"'],
    [turnstileContent, "const secret = env.TURNSTILE_SECRET_KEY"],
    [turnstileContent, "turnstile_not_configured"],
    [turnstileContent, "turnstile_required"],
    [turnstileContent, "https://challenges.cloudflare.com/turnstile/v0/siteverify"],
    [turnstileContent, 'method: "POST"'],
    [turnstileContent, 'body.set("remoteip", remoteIp)'],
    [turnstileContent, "turnstile_unavailable"],
    [turnstileContent, "!result.success"],
    [turnstileContent, "turnstile_failed"],
    [smokeContent, "GET /api/bootstrap auth turnstile config"],
    [smokeContent, "POST /api/bottles missing turnstile"],
    [smokeContent, "turnstile_required"]
  ];

  for (const [content, part] of requiredParts) {
    if (!content.includes(part)) {
      failures.push(`Turnstile contract missing ${part}`);
    }
  }
}

function checkMediaProxyContract() {
  const workerIndex = path.join(root, "worker/index.ts");
  if (!existsSync(workerIndex)) {
    failures.push("worker/index.ts: Worker entry is missing");
    return;
  }

  const content = readFileSync(workerIndex, "utf8");
  const requiredParts = [
    'app.get("/media/*"',
    "isSafeMediaKey",
    'key.startsWith("bottles/")',
    '!key.includes("..")',
    '!key.includes("//")',
    '"Cache-Control", "public, max-age=86400, stale-while-revalidate=604800"',
    '"ETag", object.httpEtag'
  ];

  for (const part of requiredParts) {
    if (!content.includes(part)) {
      failures.push(`worker/index.ts: media proxy contract missing ${part}`);
    }
  }
}

function checkQueueConsumerContract() {
  const workerIndex = path.join(root, "worker/index.ts");
  if (!existsSync(workerIndex)) {
    failures.push("worker/index.ts: Worker entry is missing");
    return;
  }

  const content = readFileSync(workerIndex, "utf8");
  const requiredParts = [
    "async queue(batch: MessageBatch<ModerationMessage>",
    'recordEvent(env, "moderation_queued"',
    "message.ack()",
    "message.retry()",
    '"queue_message_failed"'
  ];

  for (const part of requiredParts) {
    if (!content.includes(part)) {
      failures.push(`worker/index.ts: queue consumer contract missing ${part}`);
    }
  }
}

function checkR2CreateCleanupContract() {
  const workerIndex = path.join(root, "worker/index.ts");
  if (!existsSync(workerIndex)) {
    failures.push("worker/index.ts: Worker entry is missing");
    return;
  }

  const content = readFileSync(workerIndex, "utf8");
  const requiredParts = [
    "BOTTLE_IMAGES.put(imageKey",
    "BOTTLE_IMAGES.delete(imageKey)",
    '"r2_cleanup_failed"',
    "throw error;"
  ];

  for (const part of requiredParts) {
    if (!content.includes(part)) {
      failures.push(`worker/index.ts: R2 create cleanup contract missing ${part}`);
    }
  }
}

function checkImageUploadContract() {
  const workerIndex = path.join(root, "worker/index.ts");
  const workerContent = path.join(root, "worker/lib/content.ts");
  if (!existsSync(workerIndex) || !existsSync(workerContent)) {
    failures.push("image upload contract: Worker entry or content module is missing");
    return;
  }

  const indexContent = readFileSync(workerIndex, "utf8");
  const contentModule = readFileSync(workerContent, "utf8");
  const requiredParts = [
    [indexContent, "validateImage(imageEntry instanceof File ? imageEntry : null)"],
    [indexContent, "BOTTLE_IMAGES.put(imageKey, image.stream()"],
    [indexContent, "contentType: image.type"],
    [contentModule, "export function validateImage(file: File | null)"],
    [contentModule, "image_required"],
    [contentModule, 'new Set(["image/jpeg", "image/png", "image/webp", "image/gif"])'],
    [contentModule, "invalid_image_type"],
    [contentModule, "file.size <= 0"],
    [contentModule, "image_empty"],
    [contentModule, "8 * 1024 * 1024"],
    [contentModule, "image_too_large"]
  ];

  for (const [content, part] of requiredParts) {
    if (!content.includes(part)) {
      failures.push(`image upload contract missing ${part}`);
    }
  }
}

function checkRateLimitContract() {
  const workerIndex = path.join(root, "worker/index.ts");
  if (!existsSync(workerIndex)) {
    failures.push("worker/index.ts: Worker entry is missing");
    return;
  }

  const content = readFileSync(workerIndex, "utf8");
  const requiredParts = [
    'from "./lib/rateLimit"',
    'parts: ["bottle", "user", user.id], limit: 12, windowSeconds: 86400',
    'parts: ["bottle", "ip", clientIp(c)], limit: 60, windowSeconds: 3600',
    'parts: ["dredge", "user", user.id], limit: 30, windowSeconds: 60',
    'parts: ["report", "user", user.id], limit: 20, windowSeconds: 86400',
    'parts: ["share", "user", user.id], limit: 10, windowSeconds: 3600'
  ];

  for (const part of requiredParts) {
    if (!content.includes(part)) {
      failures.push(`worker/index.ts: KV rate limit contract missing ${part}`);
    }
  }
}

function checkBindingHealthContract() {
  const workerIndex = path.join(root, "worker/index.ts");
  const workerHealth = path.join(root, "worker/lib/health.ts");
  if (!existsSync(workerIndex) || !existsSync(workerHealth)) {
    failures.push("worker health contract: Worker entry or health module is missing");
    return;
  }

  const indexContent = readFileSync(workerIndex, "utf8");
  const healthContent = readFileSync(workerHealth, "utf8");
  const requiredParts = [
    [indexContent, "checkBindings(c.env)"],
    [indexContent, "status: bindings.ok ? 200 : 503"],
    [healthContent, 'env.DB.prepare("SELECT 1 AS ok")'],
    [healthContent, 'env.GH_CONFIG.get("healthcheck:noop")'],
    [healthContent, "env.BOTTLE_IMAGES.list({ limit: 1 })"],
    [healthContent, "Boolean(env.MODERATION_QUEUE)"]
  ];

  for (const [content, part] of requiredParts) {
    if (!content.includes(part)) {
      failures.push(`worker health contract missing ${part}`);
    }
  }
}

function checkAdminReadQueryContract() {
  const workerIndex = path.join(root, "worker/index.ts");
  const workerAdmin = path.join(root, "worker/lib/admin.ts");
  if (!existsSync(workerIndex) || !existsSync(workerAdmin)) {
    failures.push("admin read query contract: Worker entry or admin module is missing");
    return;
  }

  const indexContent = readFileSync(workerIndex, "utf8");
  const adminContent = readFileSync(workerAdmin, "utf8");
  const requiredParts = [
    [indexContent, 'app.get("/api/admin/bottles"'],
    [indexContent, "invalid_bottle_status"],
    [indexContent, 'Math.min(Math.max(toInt(c.req.query("limit"), 50), 1), 200)'],
    [indexContent, 'app.get("/api/admin/events"'],
    [indexContent, "invalid_event_type"],
    [indexContent, "type.length > 64"],
    [indexContent, "!/^[a-z0-9_:-]+$/i.test(type)"],
    [indexContent, 'Math.min(Math.max(toInt(c.req.query("limit"), 20), 1), 100)'],
    [indexContent, 'app.get("/api/admin/storage/audit"'],
    [indexContent, 'Math.min(Math.max(toInt(c.req.query("limit"), 1000), 1), 1000)'],
    [adminContent, 'status === "all"'],
    [adminContent, 'status === "reported"'],
    [adminContent, "env.DB.prepare(query).bind(limit)"],
    [adminContent, "env.DB.prepare(query).bind(status, limit)"],
    [adminContent, "env.DB.prepare(`${base} WHERE type = ?1 ORDER BY created_at DESC LIMIT ?2`).bind(type, limit)"],
    [adminContent, "env.DB.prepare(`${base} ORDER BY created_at DESC LIMIT ?1`).bind(limit)"]
  ];

  for (const [content, part] of requiredParts) {
    if (!content.includes(part)) {
      failures.push(`admin read query contract missing ${part}`);
    }
  }
}

function checkApiErrorResponseContract() {
  const workerIndex = path.join(root, "worker/index.ts");
  const workerHttp = path.join(root, "worker/lib/http.ts");
  const publicSmoke = path.join(root, "scripts/smoke-public.mjs");
  if (!existsSync(workerIndex) || !existsSync(workerHttp) || !existsSync(publicSmoke)) {
    failures.push("API error response contract: Worker entry, http module, or public smoke is missing");
    return;
  }

  const indexContent = readFileSync(workerIndex, "utf8");
  const httpContent = readFileSync(workerHttp, "utf8");
  const smokeContent = readFileSync(publicSmoke, "utf8");
  const requiredParts = [
    [indexContent, "app.onError((error, c) =>"],
    [indexContent, "error instanceof ApiError"],
    [indexContent, "jsonError(error.status, error.code, error.message)"],
    [indexContent, 'type: "api_error"'],
    [indexContent, 'jsonError(500, "internal_error"'],
    [indexContent, "app.notFound((c) =>"],
    [indexContent, 'jsonError(404, "not_found"'],
    [indexContent, 'app.use("*", requestId)'],
    [indexContent, 'app.use("*", securityHeaders)'],
    [indexContent, 'app.use("*", errorBoundary)'],
    [httpContent, "export class ApiError extends Error"],
    [httpContent, "export function jsonError(status: number, code: string, message: string)"],
    [httpContent, "const body: ApiErrorBody = { error: { code, message } }"],
    [httpContent, "crypto.randomUUID()"],
    [httpContent, 'c.header("X-Request-Id", requestId)'],
    [httpContent, 'c.header("Cache-Control", "no-store")'],
    [httpContent, 'c.header("Vary", "Origin")'],
    [smokeContent, "GET /api/not-found smoke"],
    [smokeContent, "not_found"]
  ];

  for (const [content, part] of requiredParts) {
    if (!content.includes(part)) {
      failures.push(`API error response contract missing ${part}`);
    }
  }
}

function checkAdminCsvExportContract() {
  const workerIndex = path.join(root, "worker/index.ts");
  const workerAdmin = path.join(root, "worker/lib/admin.ts");
  if (!existsSync(workerIndex) || !existsSync(workerAdmin)) {
    failures.push("admin CSV export contract: Worker entry or admin module is missing");
    return;
  }

  const indexContent = readFileSync(workerIndex, "utf8");
  const adminContent = readFileSync(workerAdmin, "utf8");
  const requiredParts = [
    [indexContent, 'app.get("/api/admin/export/bottles.csv"'],
    [indexContent, "invalid_export_status"],
    [indexContent, 'Math.min(Math.max(toInt(c.req.query("limit"), 1000), 1), 5000)'],
    [indexContent, '"Content-Type": "text/csv; charset=utf-8"'],
    [indexContent, "bottlesToCsv(rows)"],
    [adminContent, "function csvCell"],
    [adminContent, "/^[=+\\-@]/.test(text)"],
    [adminContent, 'text.replace(/"/g, \'""\')']
  ];

  for (const [content, part] of requiredParts) {
    if (!content.includes(part)) {
      failures.push(`admin CSV export contract missing ${part}`);
    }
  }
}

function checkBulkModerationContract() {
  const workerIndex = path.join(root, "worker/index.ts");
  const workerAdmin = path.join(root, "worker/lib/admin.ts");
  if (!existsSync(workerIndex) || !existsSync(workerAdmin)) {
    failures.push("bulk moderation contract: Worker entry or admin module is missing");
    return;
  }

  const indexContent = readFileSync(workerIndex, "utf8");
  const adminContent = readFileSync(workerAdmin, "utf8");
  const requiredParts = [
    [indexContent, 'app.post("/api/admin/bottles/moderation/bulk"'],
    [indexContent, "!isAdminUser(c.env, user)"],
    [indexContent, "!Array.isArray(payload.bottleIds) || !isBottleStatus(payload.status)"],
    [indexContent, "bottleIds.length > 100"],
    [indexContent, "bulk_moderation_limit"],
    [indexContent, "Math.max(0, Math.min(999, Math.trunc(payload.featuredScore)))"],
    [indexContent, '"admin_moderation_bulk_updated"'],
    [adminContent, "const uniqueIds = [...new Set(bottleIds)]"]
  ];

  for (const [content, part] of requiredParts) {
    if (!content.includes(part)) {
      failures.push(`bulk moderation contract missing ${part}`);
    }
  }
}

function checkUgcReportContract() {
  const workerIndex = path.join(root, "worker/index.ts");
  const workerReports = path.join(root, "worker/lib/reports.ts");
  if (!existsSync(workerIndex) || !existsSync(workerReports)) {
    failures.push("UGC report contract: Worker entry or reports module is missing");
    return;
  }

  const indexContent = readFileSync(workerIndex, "utf8");
  const reportsContent = readFileSync(workerReports, "utf8");
  const requiredParts = [
    [indexContent, 'app.post("/api/bottles/:id/report"'],
    [indexContent, 'parts: ["report", "user", user.id], limit: 20, windowSeconds: 86400'],
    [indexContent, "invalid_bottle_id"],
    [indexContent, "invalid_report_reason"],
    [indexContent, "invalid_report_details"],
    [indexContent, '"bottle_reported"'],
    [reportsContent, "REPORT_AUTO_REVIEW_THRESHOLD = 3"],
    [reportsContent, "cannot_report_own_bottle"],
    [reportsContent, "INSERT OR IGNORE INTO bottle_reports"],
    [reportsContent, "bottle_already_reported"],
    [reportsContent, "status = CASE"],
    [reportsContent, "THEN 'pending'"]
  ];

  for (const [content, part] of requiredParts) {
    if (!content.includes(part)) {
      failures.push(`UGC report contract missing ${part}`);
    }
  }
}

function checkClientBuildHygiene() {
  const clientDir = path.join(root, "dist/client");
  if (!existsSync(clientDir)) return;
  const forbiddenClientSecrets = ["CLERK_SECRET_KEY", "CLERK_JWT_KEY", "TURNSTILE_SECRET_KEY"];

  for (const filePath of listFiles(clientDir)) {
    const relative = path.relative(root, filePath);
    const extension = path.extname(filePath);
    if (extension === ".map") {
      failures.push(`${relative}: sourcemap must not be shipped in client assets`);
      continue;
    }

    if (![".html", ".js", ".css"].includes(extension)) continue;
    const content = readFileSync(filePath, "utf8");
    if (/sourceMappingURL=/.test(content)) {
      failures.push(`${relative}: sourceMappingURL must not be shipped in client assets`);
    }
    for (const key of forbiddenClientSecrets) {
      if (content.includes(key)) {
        failures.push(`${relative}: client build must not contain ${key}`);
      }
    }
  }
}

function checkAssetBudgets() {
  const assetsDir = path.join(root, "dist/client/assets");
  if (!existsSync(assetsDir)) {
    notes.push("dist/client/assets missing; run build before asset budget audit");
    return;
  }

  const budgets = [
    { extension: ".js", limit: 320 * 1024 },
    { extension: ".css", limit: 80 * 1024 }
  ];
  for (const asset of readdirSync(assetsDir)) {
    const extension = path.extname(asset);
    const budget = budgets.find((item) => item.extension === extension);
    if (!budget) continue;
    const absolute = path.join(assetsDir, asset);
    const size = statSync(absolute).size;
    if (size > budget.limit) {
      failures.push(`${path.relative(root, absolute)}: ${size} bytes exceeds ${budget.limit} byte budget`);
    } else {
      notes.push(`${path.relative(root, absolute)}: ${size} bytes`);
    }
  }
}

function listFiles(directory) {
  const files = [];
  for (const name of readdirSync(directory)) {
    const absolute = path.join(directory, name);
    const stat = statSync(absolute);
    if (stat.isDirectory()) {
      files.push(...listFiles(absolute));
    } else {
      files.push(absolute);
    }
  }
  return files;
}
