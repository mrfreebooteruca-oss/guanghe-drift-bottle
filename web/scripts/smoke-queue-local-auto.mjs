import { spawn, spawnSync } from "node:child_process";

const host = process.env.QUEUE_SMOKE_HOST ?? "127.0.0.1";
const port = process.env.QUEUE_SMOKE_PORT ?? "8787";
const baseUrl = `http://${host}:${port}`;
const server = spawn(
  "npm",
  ["run", "dev", "--", "--host", host, "--port", port, "--strictPort"],
  {
    cwd: process.cwd(),
    detached: true,
    stdio: ["ignore", "pipe", "pipe"]
  }
);

let serverOutput = "";
server.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

try {
  await waitForHealth();
  const result = spawnSync("npm", ["run", "smoke:queue:local"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      QUEUE_SMOKE_BASE_URL: baseUrl
    },
    encoding: "utf8"
  });

  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);

  if (result.status !== 0) {
    throw new Error(`Queue smoke failed with status ${result.status ?? "unknown"}.`);
  }
} finally {
  stopServer();
}

async function waitForHealth() {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`Local dev server exited early.\n${serverOutput.trim()}`);
    }

    try {
      const response = await fetch(`${baseUrl}/api/health`);
      const payload = await response.json().catch(() => null);
      if (response.status === 200 && payload?.data?.ok === true) {
        return;
      }
    } catch {
      // Keep polling until Vite and the Worker runtime are ready.
    }

    await delay(1000);
  }

  throw new Error(`Timed out waiting for ${baseUrl}/api/health.\n${serverOutput.trim()}`);
}

function stopServer() {
  if (server.pid && server.exitCode === null) {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      server.kill("SIGTERM");
    }
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
