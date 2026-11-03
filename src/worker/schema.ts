import type { D1Database } from "./d1.ts";

// Mirrors migrations/0001_init.sql so a dashboard-only deploy works without running migrations by hand.
const STATEMENTS = [
	"CREATE TABLE IF NOT EXISTS recipes (id TEXT PRIMARY KEY, name TEXT NOT NULL, name_norm TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL)",
	"CREATE INDEX IF NOT EXISTS recipes_name_norm ON recipes(name_norm)",
	"CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, name TEXT NOT NULL, brand TEXT, barcode TEXT, name_norm TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL)",
	"CREATE INDEX IF NOT EXISTS products_name_norm ON products(name_norm)",
	"CREATE UNIQUE INDEX IF NOT EXISTS products_barcode ON products(barcode) WHERE barcode IS NOT NULL",
];

let ready: Promise<void> | undefined;

/** Creates the tables once per isolate; every statement is idempotent. */
export function ensureSchema(db: D1Database): Promise<void> {
	ready ??= (async () => {
		for (const statement of STATEMENTS) {
			await db.prepare(statement).run();
		}
	})().catch((error: unknown) => {
		ready = undefined;
		throw error;
	});
	return ready;
}
