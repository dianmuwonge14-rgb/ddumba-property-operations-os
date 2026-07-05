import { readFile } from "node:fs/promises";
import pg from "pg";

const { Client } = pg;

const projectRef = process.env.SUPABASE_PROJECT_REF;
const dbPassword = process.env.SUPABASE_DB_PASSWORD;
const migrationFile = process.argv[2];

if (!projectRef) throw new Error("SUPABASE_PROJECT_REF is required.");
if (!dbPassword) throw new Error("SUPABASE_DB_PASSWORD is required.");
if (!migrationFile) throw new Error("Migration SQL file path is required.");

const sql = await readFile(migrationFile, "utf8");
const connectionString = process.env.SUPABASE_DB_URL
    ?? `postgresql://postgres:${encodeURIComponent(dbPassword)}@db.${projectRef}.supabase.co:5432/postgres`;

const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
    statement_timeout: 120000,
});

await client.connect();
try {
    await client.query("begin");
    await client.query(sql);
    await client.query("commit");
    console.log(JSON.stringify({ ok: true, migrationFile }));
} catch (error) {
    await client.query("rollback").catch(() => null);
    throw error;
} finally {
    await client.end();
}
