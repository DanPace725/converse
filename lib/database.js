import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { attachDatabasePool } from "@vercel/functions";
import * as schema from "./db-schema.js";

let database;
export function getDatabase() {
  if (!process.env.DATABASE_URL)
    throw Object.assign(
      Error("Configure DATABASE_URL for saved context chats."),
      { status: 503 },
    );
  if (!database) {
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 5000,
      connectionTimeoutMillis: 10000,
      statement_timeout: 15000,
    });
    pool.on("error", () => console.error("Database connection interrupted."));
    if (process.env.VERCEL) attachDatabasePool(pool);
    database = { pool, db: drizzle(pool, { schema }) };
  }
  return database;
}
