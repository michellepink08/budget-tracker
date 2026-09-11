// Applies prisma/schema.sql to the SQLite database at DATABASE_URL.
//
// Stands in for `prisma db push`, which shells out to a native binary that
// this machine's Application Control policy blocks. See the comment at the
// top of prisma/schema.sql for the full explanation and the rule for
// keeping schema.prisma and schema.sql in sync.

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set (check your .env file).");
  process.exit(1);
}

const filePrefix = "file:";
if (!databaseUrl.startsWith(filePrefix)) {
  console.error(`Expected a "file:" DATABASE_URL, got: ${databaseUrl}`);
  process.exit(1);
}

const dbPath = path.resolve(process.cwd(), databaseUrl.slice(filePrefix.length));
const schemaSqlPath = path.resolve(process.cwd(), "prisma/schema.sql");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
try {
  db.exec(fs.readFileSync(schemaSqlPath, "utf8"));
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => row.name);
  console.log(`Applied prisma/schema.sql to ${dbPath}`);
  console.log("Tables:", tables.join(", "));
} finally {
  db.close();
}
