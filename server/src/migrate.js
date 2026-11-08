import { readFile } from "node:fs/promises";
import { pool, transaction } from "./db.js";
export async function migrate() {
  await transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(514023)");
    await db.query(
      await readFile(new URL("./schema.sql", import.meta.url), "utf8"),
    );
  });
}
if (process.argv[1]?.endsWith("migrate.js")) {
  await migrate();
  console.log("Database migrated");
  await pool.end();
}
