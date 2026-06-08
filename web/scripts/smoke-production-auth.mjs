const baseUrl = normalizeBaseUrl(
  process.argv[2] ??
    process.env.PRODUCTION_SMOKE_BASE_URL ??
    "https://guanghe-drift-bottle-production.adwardhuanguca.workers.dev"
);
const allowedCorsOrigin = process.env.SMOKE_ALLOWED_ORIGIN ?? baseUrl;
const deniedCorsOrigin = process.env.SMOKE_DENIED_ORIGIN ?? "https://example.invalid";
const checks = [];

validateInputs();

await checkJson("GET /api/health", "/api/health", {
  expectedStatus: 200,
  validate: (payload) => payload?.data?.ok === true && payload?.data?.environment === "production"
});
await checkJson("GET /api/bootstrap no auth", "/api/bootstrap", {
  expectedStatus: 401,
  validate: (payload) => payload?.error?.code === "auth_required"
});
await checkJson("GET /api/bootstrap dev header ignored", "/api/bootstrap", {
  expectedStatus: 401,
  init: {
    headers: {
      "X-Dev-User": "production-smoke-dev-user"
    }
  },
  validate: (payload) => payload?.error?.code === "auth_required"
});
await checkJson("GET /api/admin/metrics no auth", "/api/admin/metrics", {
  expectedStatus: 401,
  validate: (payload) => payload?.error?.code === "auth_required"
});
await checkJson("GET /api/not-found smoke", "/api/__missing_smoke", {
  expectedStatus: 404,
  validate: (payload) => payload?.error?.code === "not_found"
});
await checkCors("OPTIONS /api/health CORS allowed origin", "/api/health", {
  origin: allowedCorsOrigin,
  expectedAllowOrigin: allowedCorsOrigin
});
await checkCors("OPTIONS /api/health CORS denied origin", "/api/health", {
  origin: deniedCorsOrigin,
  expectedAllowOrigin: null
});

const failed = checks.filter((item) => !item.ok);
if (failed.length > 0) {
  console.error(`Production auth smoke failed for ${baseUrl}`);
  for (const item of failed) {
    console.error(`- ${item.name}: ${item.status} ${item.detail}`);
  }
  process.exit(1);
}

console.log(`Production auth smoke passed for ${baseUrl}`);
for (const item of checks) {
  console.log(`- ${item.name}: ${item.status}`);
}

async function checkJson(name, path, options) {
  const response = await fetch(`${baseUrl}${path}`, options.init);
  const payload = await response.json().catch(() => null);
  const statusOk = response.status === options.expectedStatus;
  const payloadOk = options.validate(payload);
  const headerIssues = validateSecurityHeaders(response, path);
  checks.push({
    name,
    status: response.status,
    ok: statusOk && payloadOk && headerIssues.length === 0,
    detail: statusOk
      ? headerIssues.length > 0
        ? headerIssues.join(", ")
        : "payload validation failed"
      : `expected ${options.expectedStatus}`
  });
}

async function checkCors(name, path, options) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "OPTIONS",
    headers: {
      Origin: options.origin,
      "Access-Control-Request-Method": "GET"
    }
  });
  const allowOrigin = response.headers.get("access-control-allow-origin");
  const statusOk = response.status === 204 || response.status === 200;
  const allowOriginOk = allowOrigin === options.expectedAllowOrigin;
  const headerIssues = validateSecurityHeaders(response, path);
  checks.push({
    name,
    status: response.status,
    ok: statusOk && allowOriginOk && headerIssues.length === 0,
    detail: statusOk
      ? headerIssues.length > 0
        ? headerIssues.join(", ")
        : `expected access-control-allow-origin ${options.expectedAllowOrigin ?? "null"}, got ${allowOrigin ?? "null"}`
      : "expected 204 or 200"
  });
}

function validateSecurityHeaders(response, path) {
  const issues = [];
  const required = {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin"
  };

  for (const [header, expected] of Object.entries(required)) {
    if (response.headers.get(header) !== expected) {
      issues.push(`${header} missing`);
    }
  }

  if (!response.headers.get("permissions-policy")?.includes("camera=()")) {
    issues.push("permissions-policy missing");
  }

  if (!response.headers.get("x-request-id")) {
    issues.push("x-request-id missing");
  }

  if (path.startsWith("/api/") && !response.headers.get("cache-control")?.includes("no-store")) {
    issues.push("api cache-control missing");
  }

  if (path.startsWith("/api/") && !response.headers.get("vary")?.includes("Origin")) {
    issues.push("api vary origin missing");
  }

  if (baseUrl.startsWith("https://") && !response.headers.get("strict-transport-security")) {
    issues.push("hsts missing");
  }

  return issues;
}

function validateInputs() {
  validateBaseUrlOrigin("Production auth smoke");
  validateSmokeOrigin(allowedCorsOrigin, "SMOKE_ALLOWED_ORIGIN");
  validateSmokeOrigin(deniedCorsOrigin, "SMOKE_DENIED_ORIGIN");

  if (!baseUrl.startsWith("https://") && process.env.ALLOW_INSECURE_PRODUCTION_SMOKE !== "true") {
    console.error("Production auth smoke requires an https base URL.");
    console.error("Set ALLOW_INSECURE_PRODUCTION_SMOKE=true only for an intentional local diagnostic run.");
    process.exit(1);
  }
}

function validateSmokeOrigin(value, label) {
  if (String(value).includes("*")) {
    console.error(`${label} must not contain a wildcard.`);
    process.exit(1);
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    console.error(`${label} must be a valid bare origin.`);
    process.exit(1);
  }

  if (parsed.origin !== value) {
    console.error(`${label} must be a bare origin without path, query, hash, or trailing slash.`);
    process.exit(1);
  }

  if (parsed.protocol !== "https:" && process.env.ALLOW_INSECURE_PRODUCTION_SMOKE !== "true") {
    console.error(`${label} must use https for production smoke.`);
    process.exit(1);
  }
}

function validateBaseUrlOrigin(label) {
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    console.error(`${label} requires a valid bare origin base URL.`);
    process.exit(1);
  }

  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    console.error(`${label} requires a bare origin base URL without path, query, or hash.`);
    process.exit(1);
  }
}

function normalizeBaseUrl(value) {
  return String(value).replace(/\/+$/, "");
}
