/*!
 * sync-env.js
 *
 * Prisma reads `.env` from the schema's directory (packages/db/),
 * while NestJS reads it from the repo root via envFilePath. To keep
 * a single source of truth, this script mirrors the root `.env` into
 * `packages/db/.env` before every Prisma invocation.
 *
 * Invoked automatically by the `prisma:*` and `seed` npm scripts
 * declared in this package.json, so users can edit one file and have
 * every tool — Nest, Prisma CLI, prisma migrate, prisma studio —
 * see the same values.
 */
const fs = require("fs");
const path = require("path");

const ROOT_ENV = path.resolve(__dirname, "..", "..", "..", ".env");
const LOCAL_ENV = path.resolve(__dirname, "..", ".env");

if (!fs.existsSync(ROOT_ENV)) {
  console.error(`[sync-env] root .env not found at ${ROOT_ENV}`);
  console.error(`[sync-env] create one (or copy from .env.example) before running prisma commands.`);
  process.exit(1);
}

const lines = fs.readFileSync(ROOT_ENV, "utf8").split(/\r?\n/);
const keysToMirror = ["DATABASE_URL", "SMTP_ENCRYPTION_KEY"];
const out = [];
for (const key of keysToMirror) {
  const line = lines.find((l) => l.startsWith(`${key}=`));
  if (line) out.push(line);
}

if (out.length === 0) {
  console.error(`[sync-env] no DATABASE_URL found in ${ROOT_ENV}`);
  process.exit(1);
}

fs.writeFileSync(LOCAL_ENV, out.join("\n") + "\n", "utf8");
console.log(`[sync-env] wrote ${out.length} key(s) to ${path.relative(process.cwd(), LOCAL_ENV)}`);
