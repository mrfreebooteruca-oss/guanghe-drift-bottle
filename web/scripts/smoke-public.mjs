const baseUrl = normalizeBaseUrl(
  process.argv[2] ?? "https://guanghe-drift-bottle.adwardhuanguca.workers.dev"
);
const expectSecurityHeaders = process.env.EXPECT_SECURITY_HEADERS === "true";
const allowedCorsOrigin = process.env.SMOKE_ALLOWED_ORIGIN ?? "http://localhost:5173";
const deniedCorsOrigin = process.env.SMOKE_DENIED_ORIGIN ?? "https://example.invalid";
const checks = [];

await checkJson("GET /api/health", "/api/health", {
  expectedStatus: 200,
  validate: (payload) => payload?.data?.ok === true
});
await checkJson("GET /api/bootstrap", "/api/bootstrap", {
  expectedStatus: 200,
  validate: (payload) =>
    Array.isArray(payload?.data?.latest) &&
    payload.data.latest.length > 0 &&
    payload?.data?.metrics?.bottles >= 100
});
await checkJson("GET /api/admin/metrics", "/api/admin/metrics", {
  expectedStatus: 403,
  validate: (payload) => payload?.error?.code === "admin_required"
});
await checkJson("GET /api/admin/bottles reported", "/api/admin/bottles?status=reported&limit=5", {
  expectedStatus: 403,
  validate: (payload) => payload?.error?.code === "admin_required"
});
await checkJson(
  "GET /api/admin/export/bottles.csv reported",
  "/api/admin/export/bottles.csv?status=reported&limit=5",
  {
    expectedStatus: 403,
    validate: (payload) => payload?.error?.code === "admin_required"
  }
);
await checkJson("GET /api/admin/events bottle_reported", "/api/admin/events?type=bottle_reported&limit=5", {
  expectedStatus: 403,
  validate: (payload) => payload?.error?.code === "admin_required"
});
await checkJson("GET /media invalid key", "/media/not-public.webp", {
  expectedStatus: 400,
  validate: (payload) => payload?.error?.code === "invalid_media_key"
});
await checkJson("POST /api/bottles/:id/report invalid reason", "/api/bottles/preseed-bottle-010/report", {
  expectedStatus: 400,
  init: {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Dev-User": "public-smoke-invalid-report"
    },
    body: JSON.stringify({ reason: "invalid" })
  },
  validate: (payload) => payload?.error?.code === "invalid_report_reason"
});
await checkCors("OPTIONS /api/health CORS allowed origin", "/api/health", {
  origin: allowedCorsOrigin,
  expectedAllowOrigin: allowedCorsOrigin
});
await checkCors("OPTIONS /api/health CORS denied origin", "/api/health", {
  origin: deniedCorsOrigin,
  expectedAllowOrigin: null
});

if (expectSecurityHeaders) {
  await checkJson("GET /api/not-found smoke", "/api/__missing_smoke", {
    expectedStatus: 404,
    validate: (payload) => payload?.error?.code === "not_found"
  });
}

const failed = checks.filter((item) => !item.ok);
if (failed.length > 0) {
  console.error(`Public smoke failed for ${baseUrl}`);
  for (const item of failed) {
    console.error(`- ${item.name}: ${item.status} ${item.detail}`);
  }
  process.exit(1);
}

console.log(`Public smoke passed for ${baseUrl}`);
for (const item of checks) {
  console.log(`- ${item.name}: ${item.status}`);
}

async function checkJson(name, path, options) {
  const response = await fetch(`${baseUrl}${path}`, options.init);
  const payload = await response.json().catch(() => null);
  const statusOk = response.status === options.expectedStatus;
  const payloadOk = options.validate(payload);
  const headerIssues = expectSecurityHeaders ? validateSecurityHeaders(response, path) : [];
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
  checks.push({
    name,
    status: response.status,
    ok: statusOk && allowOriginOk,
    detail: statusOk
      ? `expected access-control-allow-origin ${options.expectedAllowOrigin ?? "null"}, got ${allowOrigin ?? "null"}`
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

function normalizeBaseUrl(value) {
  return String(value).replace(/\/+$/, "");
}
