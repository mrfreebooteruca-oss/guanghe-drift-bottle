import { spawnSync } from "node:child_process";

const baseUrl = normalizeBaseUrl(process.env.QUEUE_SMOKE_BASE_URL ?? "http://127.0.0.1:8787");
const userId = `queue-smoke-${crypto.randomUUID()}`;
let bottleId = "";
let imageKey = "";

try {
  const created = await createBottle();
  bottleId = created.bottleId;
  imageKey = created.imageKey;
  await waitForModerationEvent();
  console.log(`Queue smoke passed: moderation_queued recorded for ${bottleId}`);
} finally {
  await cleanup();
}

async function createBottle() {
  const form = new FormData();
  form.set("title", "队列消费测试");
  form.set("gameName", "光核测试");
  form.set("category", "震撼的场景");
  form.set("description", "这是一段用于验证本地队列消费者能够记录审核事件的测试说明。");
  form.set("template", "standard");
  form.set(
    "image",
    new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "queue-smoke.png", {
      type: "image/png"
    })
  );

  const response = await fetch(`${baseUrl}/api/bottles`, {
    method: "POST",
    headers: { "X-Dev-User": userId },
    body: form
  });
  const payload = await response.json().catch(() => null);
  const id = payload?.data?.bottle?.id;
  if (response.status !== 201 || !id) {
    throw new Error(`Queue smoke create failed: status=${response.status}`);
  }

  return {
    bottleId: id,
    imageKey: `bottles/${userId}/${id}.png`
  };
}

async function waitForModerationEvent() {
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const rows = executeD1(
      `SELECT COUNT(*) AS count FROM activity_events WHERE type='moderation_queued' AND metadata LIKE ${sqlString(`%${bottleId}%`)};`
    );
    const count = Number(rows[0]?.count ?? 0);
    if (count > 0) return;
    await delay(1000);
  }

  throw new Error("Queue smoke timed out waiting for moderation_queued event.");
}

async function cleanup() {
  if (bottleId) {
    executeD1(
      [
        `DELETE FROM bottle_reports WHERE bottle_id=${sqlString(bottleId)} OR reporter_id=${sqlString(userId)}`,
        `DELETE FROM wall_slots WHERE user_id=${sqlString(userId)} OR bottle_id=${sqlString(bottleId)}`,
        `DELETE FROM dredges WHERE user_id=${sqlString(userId)} OR bottle_id=${sqlString(bottleId)}`,
        `DELETE FROM task_events WHERE user_id=${sqlString(userId)}`,
        `DELETE FROM invites WHERE inviter_id=${sqlString(userId)} OR invitee_id=${sqlString(userId)}`,
        `DELETE FROM daily_quotas WHERE user_id=${sqlString(userId)}`,
        `DELETE FROM activity_events WHERE user_id=${sqlString(userId)} OR metadata LIKE ${sqlString(`%${bottleId}%`)}`,
        `DELETE FROM bottles WHERE id=${sqlString(bottleId)}`,
        `DELETE FROM users WHERE id=${sqlString(userId)}`
      ].join("; ") + ";"
    );
  }

  if (imageKey) {
    spawnSync(
      "npx",
      ["wrangler", "r2", "object", "delete", `guanghe-drift-bottle-images/${imageKey}`, "--local", "--force"],
      { cwd: process.cwd(), encoding: "utf8" }
    );
  }
}

function executeD1(command) {
  const result = spawnSync(
    "npx",
    ["wrangler", "d1", "execute", "guanghe-drift-bottle-db", "--local", "--command", command, "--json"],
    { cwd: process.cwd(), encoding: "utf8" }
  );
  if (result.status !== 0) {
    throw new Error(`D1 command failed: ${(result.stderr || result.stdout).trim()}`);
  }

  const parsed = JSON.parse(result.stdout || "[]");
  return parsed[0]?.results ?? [];
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeBaseUrl(value) {
  return String(value).replace(/\/+$/, "");
}
