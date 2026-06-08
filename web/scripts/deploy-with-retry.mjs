import { spawn } from "node:child_process";

const retries = toPositiveInt(process.env.DEPLOY_RETRIES, 5);
const baseDelayMs = toPositiveInt(process.env.DEPLOY_RETRY_DELAY_MS, 4000);
const deployArgs = process.argv.slice(2);
const args = ["wrangler", "deploy", ...deployArgs];

await runProductionPreflightIfNeeded(deployArgs);

for (let attempt = 1; attempt <= retries; attempt += 1) {
  console.log(`Deploy attempt ${attempt}/${retries}: npx ${args.join(" ")}`);
  const result = await run("npx", args);
  if (result.code === 0) {
    process.exit(0);
  }

  if (attempt === retries || !isRetryable(result.output)) {
    console.error(result.output.trim());
    process.exit(result.code || 1);
  }

  const delay = baseDelayMs * attempt;
  console.log(`Retrying after ${delay}ms because Wrangler deploy hit a retryable error.`);
  await sleep(delay);
}

function run(command, commandArgs) {
  return new Promise((resolve) => {
    let output = "";
    const child = spawn(command, commandArgs, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stderr.write(text);
    });
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
  });
}

function isRetryable(output) {
  return /timed out|Asset upload failed|network connectivity|retry/i.test(output);
}

async function runProductionPreflightIfNeeded(commandArgs) {
  if (!targetsProduction(commandArgs)) return;

  console.log("Production deploy preflight: node scripts/check-launch-readiness.mjs --remote-secrets --strict");
  const result = await run("node", ["scripts/check-launch-readiness.mjs", "--remote-secrets", "--strict"]);
  if (result.code !== 0) {
    console.error("Production deploy blocked because remote launch readiness is not strict-ready.");
    process.exit(result.code || 1);
  }
}

function targetsProduction(commandArgs) {
  return commandArgs.some((arg, index) => {
    if (arg === "--env" || arg === "-e") {
      return commandArgs[index + 1] === "production";
    }
    return arg === "--env=production" || arg === "-e=production";
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toPositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
