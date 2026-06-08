import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const categories = new Set(["炸裂的截图", "震撼的场景", "人物", "外观", "故事情节", "战绩"]);
const statuses = new Set(["approved", "pending", "rejected"]);
const requiredColumns = [
  "id",
  "author_id",
  "author_name",
  "invite_code",
  "title",
  "game_name",
  "category",
  "description",
  "image_url",
  "template",
  "status",
  "featured_score"
];

const sourcePath = path.resolve(process.cwd(), process.argv[2] ?? "scripts/preseed-bottles.csv");
const outputPath = path.resolve(process.cwd(), process.argv[3] ?? "scripts/preseed.generated.sql");

const rows = parseCsv(await readFile(sourcePath, "utf8"));
if (rows.length < 2) {
  fail("CSV 至少需要表头和 1 行内容。");
}

const [headers, ...records] = rows;
const missingColumns = requiredColumns.filter((column) => !headers.includes(column));
if (missingColumns.length > 0) {
  fail(`CSV 缺少列：${missingColumns.join(", ")}`);
}

const headerIndex = new Map(headers.map((header, index) => [header, index]));
const bottles = records
  .filter((record) => record.some((cell) => cell.trim()))
  .map((record, index) => rowToBottle(record, headerIndex, index + 2));

if (bottles.length === 0) {
  fail("CSV 没有可导入内容。");
}

const ids = new Set();
for (const bottle of bottles) {
  if (ids.has(bottle.id)) fail(`重复 bottle id：${bottle.id}`);
  ids.add(bottle.id);
}

const authors = new Map();
for (const bottle of bottles) {
  const existing = authors.get(bottle.authorId);
  if (existing && existing.inviteCode !== bottle.inviteCode) {
    fail(`同一 author_id 使用了不同 invite_code：${bottle.authorId}`);
  }
  authors.set(bottle.authorId, {
    id: bottle.authorId,
    displayName: bottle.authorName,
    inviteCode: bottle.inviteCode
  });
}

const sql = [
  "PRAGMA foreign_keys = ON;",
  "BEGIN TRANSACTION;",
  "",
  "INSERT INTO users (id, display_name, avatar_url, invite_code)",
  "VALUES",
  [...authors.values()]
    .map(
      (author) =>
        `  (${sqlString(author.id)}, ${sqlString(author.displayName)}, NULL, ${sqlString(author.inviteCode)})`
    )
    .join(",\n") + "\nON CONFLICT(id) DO UPDATE SET\n  display_name = excluded.display_name;",
  "",
  "INSERT INTO bottles (",
  "  id, author_id, title, game_name, category, description, image_url, template, status, featured_score",
  ") VALUES",
  bottles
    .map(
      (bottle) =>
        `  (${sqlString(bottle.id)}, ${sqlString(bottle.authorId)}, ${sqlString(bottle.title)}, ${sqlString(
          bottle.gameName
        )}, ${sqlString(bottle.category)}, ${sqlString(bottle.description)}, ${sqlString(
          bottle.imageUrl
        )}, ${sqlString(bottle.template)}, ${sqlString(bottle.status)}, ${bottle.featuredScore})`
    )
    .join(",\n") +
    "\nON CONFLICT(id) DO UPDATE SET\n  title = excluded.title,\n  game_name = excluded.game_name,\n  category = excluded.category,\n  description = excluded.description,\n  image_url = excluded.image_url,\n  template = excluded.template,\n  status = excluded.status,\n  featured_score = excluded.featured_score,\n  updated_at = datetime('now');",
  "",
  "COMMIT;",
  ""
].join("\n");

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, sql, "utf8");
console.log(`Generated ${bottles.length} bottles from ${path.relative(process.cwd(), sourcePath)}.`);
console.log(`Wrote ${path.relative(process.cwd(), outputPath)}.`);

function rowToBottle(record, headerIndex, line) {
  const get = (column) => String(record[headerIndex.get(column)] ?? "").trim();
  const bottle = {
    id: get("id"),
    authorId: get("author_id"),
    authorName: get("author_name"),
    inviteCode: get("invite_code"),
    title: get("title"),
    gameName: get("game_name"),
    category: get("category"),
    description: get("description"),
    imageUrl: get("image_url"),
    template: get("template") || "preseed",
    status: get("status") || "approved",
    featuredScore: Number(get("featured_score"))
  };

  for (const [field, value] of Object.entries(bottle)) {
    if (field === "featuredScore") continue;
    if (!value) fail(`第 ${line} 行缺少 ${field}。`);
  }

  if (!/^preseed-bottle-[a-z0-9-]+$/i.test(bottle.id)) {
    fail(`第 ${line} 行 id 必须使用 preseed-bottle-* 前缀。`);
  }
  if (!/^preseed-user-[a-z0-9-]+$/i.test(bottle.authorId)) {
    fail(`第 ${line} 行 author_id 必须使用 preseed-user-* 前缀。`);
  }
  if (!/^PRESEED[A-Z0-9-]+$/i.test(bottle.inviteCode)) {
    fail(`第 ${line} 行 invite_code 必须使用 PRESEED* 前缀。`);
  }
  if (!categories.has(bottle.category)) {
    fail(`第 ${line} 行 category 无效：${bottle.category}`);
  }
  if (!statuses.has(bottle.status)) {
    fail(`第 ${line} 行 status 无效：${bottle.status}`);
  }
  if (!Number.isInteger(bottle.featuredScore) || bottle.featuredScore < 0 || bottle.featuredScore > 999) {
    fail(`第 ${line} 行 featured_score 必须是 0-999 的整数。`);
  }
  if (bottle.title.length < 6 || bottle.title.length > 40) {
    fail(`第 ${line} 行 title 长度应为 6-40。`);
  }
  if (bottle.description.length < 30 || bottle.description.length > 240) {
    fail(`第 ${line} 行 description 长度应为 30-240。`);
  }
  if (!bottle.imageUrl.startsWith("/samples/") && !bottle.imageUrl.startsWith("https://")) {
    fail(`第 ${line} 行 image_url 必须是 /samples/* 或 https:// URL。`);
  }

  return bottle;
}

function parseCsv(input) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  if (quoted) fail("CSV 引号未闭合。");
  return rows;
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
