import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const sqlPath = process.argv[2] ?? "scripts/preseed.generated.sql";
const batchSize = clampBatchSize(Number(process.env.PRESEED_REMOTE_BATCH_SIZE ?? "20"));
const retryLimit = clampRetryLimit(Number(process.env.PRESEED_REMOTE_RETRIES ?? "3"));
const sql = await readFile(sqlPath, "utf8");
const rawStatements = sql
  .split(/;\s*/)
  .map((statement) => statement.trim())
  .filter(Boolean)
  .filter((statement) => !/^(PRAGMA|BEGIN|COMMIT)\b/i.test(statement));
const statements = rawStatements.flatMap((statement) => splitInsertStatement(statement, batchSize));

if (statements.length === 0) {
  console.error("No executable SQL statements found.");
  process.exit(1);
}

for (const [index, statement] of statements.entries()) {
  console.log(`Executing preseed statement ${index + 1}/${statements.length}`);
  await runWithRetries(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      "guanghe-drift-bottle-db",
      "--remote",
      "--command",
      `${statement};`
    ],
    retryLimit
  );
}

function clampBatchSize(value) {
  if (!Number.isInteger(value) || value < 1) return 20;
  return Math.min(value, 100);
}

function clampRetryLimit(value) {
  if (!Number.isInteger(value) || value < 0) return 3;
  return Math.min(value, 8);
}

function splitInsertStatement(statement, rowsPerBatch) {
  const conflictMarker = "\nON CONFLICT";
  const valuesMatch = /\bVALUES\s*\n/i.exec(statement);
  const conflictIndex = statement.lastIndexOf(conflictMarker);
  if (!/^INSERT INTO\b/i.test(statement) || !valuesMatch || conflictIndex === -1) {
    return [statement];
  }

  const valuesEndIndex = valuesMatch.index + valuesMatch[0].length;
  const prefix = statement.slice(0, valuesEndIndex);
  const valuesBlock = statement.slice(valuesEndIndex, conflictIndex).trim();
  const suffix = statement.slice(conflictIndex).trim();
  const rows = splitValueRows(valuesBlock);
  if (rows.length <= rowsPerBatch) return [statement];

  return chunk(rows, rowsPerBatch).map((rowBatch) => `${prefix}${rowBatch.join(",\n")}\n${suffix}`);
}

function splitValueRows(valuesBlock) {
  const rows = [];
  let quoted = false;
  let depth = 0;
  let start = -1;

  for (let index = 0; index < valuesBlock.length; index += 1) {
    const char = valuesBlock[index];
    const next = valuesBlock[index + 1];

    if (quoted) {
      if (char === "'" && next === "'") {
        index += 1;
      } else if (char === "'") {
        quoted = false;
      }
      continue;
    }

    if (char === "'") {
      quoted = true;
    } else if (char === "(") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
      if (depth < 0) break;
      if (depth === 0 && start >= 0) {
        rows.push(valuesBlock.slice(start, index + 1).trim());
        start = -1;
      }
    }
  }

  if (quoted || depth !== 0 || rows.length === 0) {
    console.error("Unable to split generated INSERT values safely.");
    process.exit(1);
  }

  return rows;
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function runWithRetries(command, args, retries) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      await run(command, args);
      return;
    } catch (error) {
      if (attempt >= retries) throw error;
      const delayMs = Math.min(1000 * 2 ** attempt, 8000);
      console.warn(`Preseed remote command failed, retrying in ${delayMs}ms (${attempt + 1}/${retries}).`);
      await wait(delayMs);
    }
  }
}

function wait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}
