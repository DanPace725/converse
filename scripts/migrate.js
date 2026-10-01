import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";

if (!process.env.DATABASE_URL_UNPOOLED)
  throw Error("Set DATABASE_URL_UNPOOLED for migrations.");
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL_UNPOOLED,
  max: 1,
});
try {
  await migrate(drizzle(pool), {
    migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
  });
  console.log("Context database migrations applied.");
} finally {
  await pool.end();
}
