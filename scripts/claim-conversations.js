import pg from "pg";

// Conversations saved before Google sign-in have no owner, so no signed-in
// user can open them. This assigns them to one account, after that account
// has signed in once. Without --apply it only reports what would change.
const email = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const apply = process.argv.includes("--apply");
if (!email)
  throw Error("Usage: npm run db:claim -- you@example.com [--apply]");
if (!process.env.DATABASE_URL_UNPOOLED)
  throw Error("Set DATABASE_URL_UNPOOLED to claim conversations.");
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL_UNPOOLED,
});
await client.connect();
try {
  const users = await client.query(
    'SELECT id FROM neon_auth."user" WHERE lower(email) = lower($1)',
    [email],
  );
  if (users.rows.length !== 1)
    throw Error(
      `${email} has no Neon Auth account yet. Sign in to Converse with Google once, then run this again.`,
    );
  const owner = String(users.rows[0].id);
  const unowned = await client.query(
    "SELECT count(*)::int AS count FROM app.conversations WHERE owner_id IS NULL",
  );
  if (!apply) {
    console.log(
      `${unowned.rows[0].count} unowned conversations would be assigned to ${email}. Add --apply to assign them.`,
    );
  } else {
    const claimed = await client.query(
      "UPDATE app.conversations SET owner_id = $1 WHERE owner_id IS NULL",
      [owner],
    );
    console.log(`Assigned ${claimed.rowCount} conversations to ${email}.`);
  }
} finally {
  await client.end();
}
