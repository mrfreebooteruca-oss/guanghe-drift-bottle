const baseUrl = normalizeBaseUrl(
  process.argv[2] ??
    process.env.PRODUCTION_SMOKE_BASE_URL ??
    "https://guanghe-drift-bottle-production.adwardhuanguca.workers.dev"
);
const bearerToken = process.env.SMOKE_ADMIN_BEARER_TOKEN ?? process.env.SMOKE_ADMIN_TOKEN ?? "";
const sessionCookie = process.env.SMOKE_ADMIN_COOKIE ?? "";
const nonAdminBearerToken = process.env.SMOKE_NON_ADMIN_BEARER_TOKEN ?? "";
const nonAdminSessionCookie = process.env.SMOKE_NON_ADMIN_COOKIE ?? "";
const allowedCorsOrigin = process.env.SMOKE_ALLOWED_ORIGIN ?? baseUrl;
const deniedCorsOrigin = process.env.SMOKE_DENIED_ORIGIN ?? "https://example.invalid";
const checks = [];
const notes = [];

validateInputs();

const authHeaders = makeAuthHeaders(bearerToken, sessionCookie);
const nonAdminHeaders = makeAuthHeaders(nonAdminBearerToken, nonAdminSessionCookie);

await checkJson("GET /api/bootstrap admin auth", "/api/bootstrap", {
  expectedStatus: 200,
  init: { headers: authHeaders },
  validate: (payload) =>
    payload?.data?.user?.isDemo === false &&
    Array.isArray(payload?.data?.latest) &&
    payload.data.latest.length > 0 &&
    payload?.data?.metrics?.bottles >= 100
});
await checkJson("GET /api/admin/metrics", "/api/admin/metrics", {
  expectedStatus: 200,
  init: { headers: authHeaders },
  validate: (payload) =>
    payload?.data?.metrics?.bottles >= 100 &&
    Array.isArray(payload?.data?.categories) &&
    Array.isArray(payload?.data?.latest)
});
await checkJson("GET /api/admin/bottles all", "/api/admin/bottles?status=all&limit=5", {
  expectedStatus: 200,
  init: { headers: authHeaders },
  validate: (payload) =>
    Array.isArray(payload?.data?.bottles) &&
    payload.data.bottles.length > 0 &&
    payload.data.bottles.every((item) => typeof item?.id === "string" && typeof item?.status === "string")
});
await checkJson("GET /api/admin/bottles reported", "/api/admin/bottles?status=reported&limit=5", {
  expectedStatus: 200,
  init: { headers: authHeaders },
  validate: (payload) => Array.isArray(payload?.data?.bottles)
});
await checkJson("GET /api/admin/events", "/api/admin/events?limit=5", {
  expectedStatus: 200,
  init: { headers: authHeaders },
  validate: (payload) => Array.isArray(payload?.data?.events)
});
await checkJson("GET /api/admin/events bottle_reported", "/api/admin/events?type=bottle_reported&limit=5", {
  expectedStatus: 200,
  init: { headers: authHeaders },
  validate: (payload) => Array.isArray(payload?.data?.events)
});
await checkJson("GET /api/admin/storage/audit", "/api/admin/storage/audit?limit=50", {
  expectedStatus: 200,
  init: { headers: authHeaders },
  validate: (payload) =>
    typeof payload?.data?.storage?.scannedR2Objects === "number" &&
    typeof payload?.data?.storage?.trackedD1Images === "number" &&
    Array.isArray(payload?.data?.storage?.orphanKeysSample) &&
    Array.isArray(payload?.data?.storage?.missingKeysSample)
});
await checkText("GET /api/admin/export/bottles.csv", "/api/admin/export/bottles.csv?status=all&limit=5", {
  expectedStatus: 200,
  init: { headers: authHeaders },
  validate: (response, text) =>
    response.headers.get("content-type")?.includes("text/csv") === true &&
    response.headers.get("content-disposition")?.includes("guanghe-bottles-all.csv") === true &&
    text.startsWith("id,title,game_name,category,status,featured_score,report_count")
});
await checkJson("GET /api/admin/bottles invalid status", "/api/admin/bottles?status=invalid&limit=5", {
  expectedStatus: 400,
  init: { headers: authHeaders },
  validate: (payload) => payload?.error?.code === "invalid_bottle_status"
});
await checkJson(
  "GET /api/admin/export invalid status",
  "/api/admin/export/bottles.csv?status=invalid&limit=5",
  {
    expectedStatus: 400,
    init: { headers: authHeaders },
    validate: (payload) => payload?.error?.code === "invalid_export_status"
  }
);
if (nonAdminHeaders) {
  await checkJson("GET /api/bootstrap non-admin auth", "/api/bootstrap", {
    expectedStatus: 200,
    init: { headers: nonAdminHeaders },
    validate: (payload) => payload?.data?.user?.isDemo === false
  });
  await checkJson("GET /api/admin/metrics non-admin denied", "/api/admin/metrics", {
    expectedStatus: 403,
    init: { headers: nonAdminHeaders },
    validate: (payload) => payload?.error?.code === "admin_required"
  });
  await checkJson("GET /api/admin/bottles non-admin denied", "/api/admin/bottles?status=all&limit=5", {
    expectedStatus: 403,
    init: { headers: nonAdminHeaders },
    validate: (payload) => payload?.error?.code === "admin_required"
  });
} else {
  notes.push("Skipped optional non-admin allowlist boundary; set SMOKE_NON_ADMIN_BEARER_TOKEN or SMOKE_NON_ADMIN_COOKIE to enable it.");
}
await checkCors("OPTIONS /api/admin/metrics CORS allowed origin", "/api/admin/metrics", {
  origin: allowedCorsOrigin,
  expectedAllowOrigin: allowedCorsOrigin
});
await checkCors("OPTIONS /api/admin/metrics CORS denied origin", "/api/admin/metrics", {
  origin: deniedCorsOrigin,
  expectedAllowOrigin: null
});

const failed = checks.filter((item) => !item.ok);
if (failed.length > 0) {
  console.error(`Production admin smoke failed for ${baseUrl}`);
  for (const item of failed) {
    console.error(`- ${item.name}: ${item.status} ${item.detail}`);
  }
  process.exit(1);
}

console.log(`Production admin smoke passed for ${baseUrl}`);
for (const item of checks) {
  console.log(`- ${item.name}: ${item.status}`);
}
for (const note of notes) {
  console.log(`- ${note}`);
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

async function checkText(name, path, options) {
  const response = await fetch(`${baseUrl}${path}`, options.init);
  const text = await response.text();
  const statusOk = response.status === options.expectedStatus;
  const payloadOk = options.validate(response, text);
  const headerIssues = validateSecurityHeaders(response, path);
  checks.push({
    name,
    status: response.status,
    ok: statusOk && payloadOk && headerIssues.length === 0,
    detail: statusOk
      ? headerIssues.length > 0
        ? headerIssues.join(", ")
        : "text validation failed"
      : `expected ${options.expectedStatus}`
  });
}

async function checkCors(name, path, options) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "OPTIONS",
    headers: {
      Origin: options.origin,
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "authorization"
    }
  });
  const allowOrigin = response.headers.get("access-control-allow-origin");
  const allowHeaders = response.headers.get("access-control-allow-headers") ?? "";
  const statusOk = response.status === 204 || response.status === 200;
  const allowOriginOk = allowOrigin === options.expectedAllowOrigin;
  const allowHeadersOk = options.expectedAllowOrigin === null || allowHeaders.toLowerCase().includes("authorization");
  const headerIssues = validateSecurityHeaders(response, path);
  checks.push({
    name,
    status: response.status,
    ok: statusOk && allowOriginOk && allowHeadersOk && headerIssues.length === 0,
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
  validateBaseUrlOrigin("Production admin smoke");
  validateSmokeOrigin(allowedCorsOrigin, "SMOKE_ALLOWED_ORIGIN");
  validateSmokeOrigin(deniedCorsOrigin, "SMOKE_DENIED_ORIGIN");

  if (!baseUrl.startsWith("https://") && process.env.ALLOW_INSECURE_PRODUCTION_SMOKE !== "true") {
    console.error("Production admin smoke requires an https base URL.");
    console.error("Set ALLOW_INSECURE_PRODUCTION_SMOKE=true only for an intentional local diagnostic run.");
    process.exit(1);
  }

  if (!bearerToken && !sessionCookie) {
    console.error("Production admin smoke requires a real Clerk admin session.");
    console.error("Set SMOKE_ADMIN_BEARER_TOKEN to a Clerk session JWT from getToken(), or set SMOKE_ADMIN_COOKIE.");
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

function makeAuthHeaders(token, cookie) {
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  if (cookie) {
    return { Cookie: cookie };
  }
  return null;
}

function normalizeBaseUrl(value) {
  return String(value).replace(/\/+$/, "");
}
