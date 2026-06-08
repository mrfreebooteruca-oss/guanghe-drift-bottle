const baseUrl = normalizeBaseUrl(
  process.argv[2] ??
    process.env.PRODUCTION_SMOKE_BASE_URL ??
    "https://guanghe-drift-bottle-production.adwardhuanguca.workers.dev"
);
const bearerToken =
  process.env.SMOKE_USER_BEARER_TOKEN ??
  process.env.SMOKE_NON_ADMIN_BEARER_TOKEN ??
  process.env.SMOKE_ADMIN_BEARER_TOKEN ??
  "";
const sessionCookie =
  process.env.SMOKE_USER_COOKIE ?? process.env.SMOKE_NON_ADMIN_COOKIE ?? process.env.SMOKE_ADMIN_COOKIE ?? "";
const allowedCorsOrigin = process.env.SMOKE_ALLOWED_ORIGIN ?? baseUrl;
const deniedCorsOrigin = process.env.SMOKE_DENIED_ORIGIN ?? "https://example.invalid";
const checks = [];

validateInputs();

const authHeaders = makeAuthHeaders(bearerToken, sessionCookie);

await checkJson("GET /api/health", "/api/health", {
  expectedStatus: 200,
  validate: (payload) => payload?.data?.ok === true && payload?.data?.environment === "production"
});
await checkJson("GET /api/bootstrap auth turnstile config", "/api/bootstrap", {
  expectedStatus: 200,
  init: { headers: authHeaders },
  validate: (payload) =>
    payload?.data?.user?.isDemo === false &&
    payload?.data?.security?.turnstileRequired === true &&
    typeof payload?.data?.security?.turnstileSiteKey === "string" &&
    payload.data.security.turnstileSiteKey.length > 0
});
await checkJson("POST /api/bottles missing turnstile", "/api/bottles", {
  expectedStatus: 400,
  init: {
    method: "POST",
    headers: authHeaders,
    body: makeBottleFormData(null)
  },
  validate: (payload) => payload?.error?.code === "turnstile_required"
});
await checkCors("OPTIONS /api/bottles CORS allowed origin", "/api/bottles", {
  origin: allowedCorsOrigin,
  expectedAllowOrigin: allowedCorsOrigin
});
await checkCors("OPTIONS /api/bottles CORS denied origin", "/api/bottles", {
  origin: deniedCorsOrigin,
  expectedAllowOrigin: null
});

const failed = checks.filter((item) => !item.ok);
if (failed.length > 0) {
  console.error(`Production Turnstile smoke failed for ${baseUrl}`);
  for (const item of failed) {
    console.error(`- ${item.name}: ${item.status} ${item.detail}`);
  }
  process.exit(1);
}

console.log(`Production Turnstile smoke passed for ${baseUrl}`);
for (const item of checks) {
  console.log(`- ${item.name}: ${item.status}`);
}
console.log("- No bottle or R2 object is created by the missing-token check.");

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
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization,content-type"
    }
  });
  const allowOrigin = response.headers.get("access-control-allow-origin");
  const allowHeaders = response.headers.get("access-control-allow-headers") ?? "";
  const statusOk = response.status === 204 || response.status === 200;
  const allowOriginOk = allowOrigin === options.expectedAllowOrigin;
  const normalizedAllowHeaders = allowHeaders.toLowerCase();
  const allowHeadersOk =
    options.expectedAllowOrigin === null ||
    (normalizedAllowHeaders.includes("authorization") && normalizedAllowHeaders.includes("content-type"));
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

function makeBottleFormData(turnstileToken) {
  const form = new FormData();
  form.set("title", "生产 Turnstile 负向验收");
  form.set("gameName", "光核测试");
  form.set("category", "震撼的场景");
  form.set("description", "这是一条不会真正创建漂流瓶的生产人机校验负向验收内容。");
  form.set("template", "standard");
  if (turnstileToken) {
    form.set("turnstileToken", turnstileToken);
  }
  form.set("image", new Blob([pngBytes()], { type: "image/png" }), "turnstile-smoke.png");
  return form;
}

function pngBytes() {
  return Uint8Array.from(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
      "base64"
    )
  );
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
  validateBaseUrlOrigin("Production Turnstile smoke");
  validateSmokeOrigin(allowedCorsOrigin, "SMOKE_ALLOWED_ORIGIN");
  validateSmokeOrigin(deniedCorsOrigin, "SMOKE_DENIED_ORIGIN");

  if (!baseUrl.startsWith("https://") && process.env.ALLOW_INSECURE_PRODUCTION_SMOKE !== "true") {
    console.error("Production Turnstile smoke requires an https base URL.");
    console.error("Set ALLOW_INSECURE_PRODUCTION_SMOKE=true only for an intentional local diagnostic run.");
    process.exit(1);
  }

  if (!bearerToken && !sessionCookie) {
    console.error("Production Turnstile smoke requires a real Clerk user session.");
    console.error("Set SMOKE_USER_BEARER_TOKEN to a Clerk session JWT from getToken(), or set SMOKE_USER_COOKIE.");
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
  return {};
}

function normalizeBaseUrl(value) {
  return String(value).replace(/\/+$/, "");
}
