import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const strict = args.has("--strict");
const checkRemoteSecrets = args.has("--remote-secrets");
const root = process.cwd();
const wranglerPath = path.join(root, "wrangler.jsonc");
const env = {
  ...readEnvFile(path.join(root, ".env.production")),
  ...readEnvFile(path.join(root, ".env.local")),
  ...process.env
};
const config = JSON.parse(stripJsonComments(readFileSync(wranglerPath, "utf8")));
const production = config.env?.production ?? {};
const productionVars = production.vars ?? {};
const checks = [];
const remoteSecrets = checkRemoteSecrets ? readRemoteSecretNames() : null;

check("Production D1 binding", hasItems(production.d1_databases), "D1 binding is present in env.production.");
check("Production R2 binding", hasItems(production.r2_buckets), "R2 binding is present in env.production.");
check("Production KV binding", hasItems(production.kv_namespaces), "KV binding is present in env.production.");
check(
  "Production Queue producer",
  hasItems(production.queues?.producers),
  "Queue producer binding is present in env.production."
);
check(
  "Production Queue consumer",
  hasItems(production.queues?.consumers),
  "Queue consumer binding is present in env.production."
);
check(
  "Production Clerk auth flag",
  productionVars.CLERK_AUTH_ENABLED === "true",
  "CLERK_AUTH_ENABLED should be true for production."
);
check(
  "Production Turnstile required",
  productionVars.TURNSTILE_REQUIRED === "true",
  "TURNSTILE_REQUIRED should be true for production."
);
check(
  "Production required secrets declaration",
  requiredSecretsDeclared(production.secrets?.required),
  "Declare CLERK_SECRET_KEY and TURNSTILE_SECRET_KEY in env.production.secrets.required.",
  "blocker"
);
const productionOrigins = validateProductionAllowedOrigins(productionVars.ALLOWED_ORIGINS);
check(
  "Production CORS origins",
  productionOrigins.ok,
  productionOrigins.detail,
  "blocker"
);
check(
  "Admin user allowlist",
  Boolean(String(productionVars.ADMIN_USER_IDS ?? "").trim()),
  "Set ADMIN_USER_IDS to one or more real Clerk user ids.",
  "blocker"
);
check(
  "Turnstile site key",
  Boolean(String(productionVars.TURNSTILE_SITE_KEY ?? "").trim()),
  "Set TURNSTILE_SITE_KEY in production vars.",
  "blocker"
);
check(
  "Clerk publishable key",
  Boolean(String(env.VITE_CLERK_PUBLISHABLE_KEY ?? "").trim()),
  "Set VITE_CLERK_PUBLISHABLE_KEY before building the production client.",
  "blocker"
);
if (checkRemoteSecrets) {
  check(
    "Production Worker exists",
    remoteSecrets.ok,
    remoteSecrets.ok ? "Production Worker can be inspected with Wrangler." : remoteWorkerDetail(remoteSecrets),
    "blocker"
  );
  check(
    "Clerk secret key",
    remoteSecrets.names.has("CLERK_SECRET_KEY"),
    "Set deployed secret with `wrangler secret put CLERK_SECRET_KEY --env production`.",
    "blocker"
  );
  check(
    "Turnstile secret key",
    remoteSecrets.names.has("TURNSTILE_SECRET_KEY"),
    "Set deployed secret with `wrangler secret put TURNSTILE_SECRET_KEY --env production`.",
    "blocker"
  );
} else {
  check(
    "Clerk secret key",
    Boolean(String(env.CLERK_SECRET_KEY ?? "").trim()),
    "Set deployed secret with `wrangler secret put CLERK_SECRET_KEY --env production`; pass --remote-secrets to verify deployed names.",
    "manual"
  );
  check(
    "Turnstile secret key",
    Boolean(String(env.TURNSTILE_SECRET_KEY ?? "").trim()),
    "Set deployed secret with `wrangler secret put TURNSTILE_SECRET_KEY --env production`; pass --remote-secrets to verify deployed names.",
    "manual"
  );
}
check(
  "Preseed content volume",
  countCsvRows(path.join(root, "scripts/preseed-bottles.csv")) >= 100,
  "Keep at least 100 preseed bottle rows for launch density."
);

const blockers = checks.filter((item) => item.severity === "blocker" && !item.ok);
const manual = checks.filter((item) => item.severity === "manual" && !item.ok);
const warnings = checks.filter((item) => item.severity === "warn" && !item.ok);
const status = blockers.length === 0 && manual.length === 0 && warnings.length === 0 ? "READY" : "BLOCKED";

console.log(`Launch readiness: ${status}`);
for (const item of checks) {
  const marker = item.ok ? "OK" : item.severity.toUpperCase();
  console.log(`[${marker}] ${item.name} - ${item.detail}`);
}

if (strict && checks.some((item) => !item.ok)) {
  process.exit(1);
}

function check(name, ok, detail, severity = "warn") {
  checks.push({ name, ok, detail, severity });
}

function hasItems(value) {
  return Array.isArray(value) && value.length > 0;
}

function requiredSecretsDeclared(value) {
  return Array.isArray(value) && ["CLERK_SECRET_KEY", "TURNSTILE_SECRET_KEY"].every((name) => value.includes(name));
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
    return "Production Worker is not created yet. First set real Clerk, Turnstile and admin config, then follow docs/DEPLOYMENT.md production switch steps.";
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

function stripJsonComments(value) {
  return value
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}
