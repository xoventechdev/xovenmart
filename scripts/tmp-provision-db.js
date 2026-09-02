// Use Prisma's bundled pg to provision the local DB.
// Connects to `postgres` as superuser, creates the `xovenmart` role + db.

const superuserPw = "13.kK133p";

function readEnv() {
  const fs = require("fs");
  const path = require("path");
  const envPath = path.join(__dirname, "..", ".env");
  const txt = fs.readFileSync(envPath, "utf8");
  const out = {};
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !out[m[1]]) out[m[1]] = m[2];
  }
  return out;
}

function parseDbUrl(u) {
  const m = u.match(
    /^postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^:/]+)(?::(\d+))?\/([^?]+)/,
  );
  if (!m) throw new Error("Bad DATABASE_URL: " + u);
  return { user: m[1], pass: m[2], host: m[3], port: Number(m[4] || 5432), db: m[5] };
}

(async () => {
  const env = readEnv();
  const target = parseDbUrl(env.DATABASE_URL);
  console.log("[provision] target:", target.user, "@", target.host + ":" + target.port, "db:", target.db);

  // Resolve pg from Prisma's bundled location
  let Client;
  try {
    ({ Client } = require("pg"));
  } catch (e) {
    // pg may be inside @prisma/engines or behind pnpm symlink; try a few paths
    const paths = [
      "pg",
      "../apps/api/node_modules/pg",
      "../packages/db/node_modules/pg",
      "../node_modules/pg",
      "./node_modules/pg",
    ];
    for (const p of paths) {
      try {
        ({ Client } = require(p));
        console.log("[provision] loaded pg from", p);
        break;
      } catch (_) {}
    }
    if (!Client) {
      // Last resort: install pg on the fly into the project's existing node_modules
      console.log("[provision] pg not found; trying to require from monorepo @prisma engines path");
      const fg = require("fs");
      const path = require("path");
      const dirs = ["apps/api/node_modules/@prisma", "packages/db/node_modules/@prisma"];
      for (const d of dirs) {
        const p = path.join(__dirname, "..", d);
        if (fg.existsSync(p)) {
          const eng = fg.readdirSync(p).find((n) => n.startsWith("@prisma+engines") || n === "@prisma");
          if (eng) {
            try {
              ({ Client } = require(path.join(p, eng)));
              console.log("[provision] loaded Client from", path.join(p, eng));
              break;
            } catch (_) {}
          }
        }
      }
    }
    if (!Client) {
      throw new Error("Unable to resolve `pg` package anywhere. Try `pnpm add -D pg` first.");
    }
  }

  const admin = new Client({
    host: target.host,
    port: target.port,
    user: "postgres",
    password: superuserPw,
    database: "postgres",
  });

  await admin.connect();
  console.log("[provision] connected as postgres");

  // DDL statements don't accept parameter binding in some forms; inline-escape password safely.
  const escapedPw = target.pass.replace(/'/g, "''");

  const roleExists = await admin.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [target.user]);
  if (roleExists.rowCount === 0) {
    await admin.query(`CREATE ROLE "${target.user}" LOGIN PASSWORD '${escapedPw}'`);
    console.log("[provision] created role:", target.user);
  } else {
    await admin.query(`ALTER ROLE "${target.user}" WITH PASSWORD '${escapedPw}'`);
    console.log("[provision] role exists; password synced");
  }

  const dbExists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [target.db]);
  if (dbExists.rowCount === 0) {
    await admin.query(`CREATE DATABASE "${target.db}" OWNER "${target.user}"`);
    console.log("[provision] created database:", target.db);
  } else {
    console.log("[provision] database exists:", target.db);
    await admin.query(`ALTER DATABASE "${target.db}" OWNER TO "${target.user}"`);
    console.log("[provision] owner set to", target.user);
  }

  // Give the role CREATEDB so Prisma migrate works.
  await admin.query(`ALTER ROLE "${target.user}" CREATEDB`);

  await admin.end();
  console.log("[provision] done.");
})().catch((e) => {
  console.error("[provision] FAILED:", e.message);
  console.error(e.stack);
  process.exit(1);
});
