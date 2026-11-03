import type { D1Database } from "./d1.ts";
import { normalizeName } from "./nutrition.ts";

export interface StoredRecord<T> {
	readonly id: string;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly data: T;
}

interface Row {
	id: string;
	created_at: string;
	updated_at: string;
	data: string;
}

const toRecord = <T>(row: Row): StoredRecord<T> => ({
	id: row.id,
	createdAt: row.created_at,
	updatedAt: row.updated_at,
	data: JSON.parse(row.data) as T,
});

/** Recipe and product storage in D1, independent of Fitatu. */
export class NutritionStore {
	private readonly db: D1Database;
	private readonly now: () => string;

	public constructor(db: D1Database, now: () => string = () => new Date().toISOString()) {
		this.db = db;
		this.now = now;
	}

	public async nextId(table: "recipes" | "products"): Promise<string> {
		const prefix = table === "recipes" ? "R" : "P";
		const row = await this.db
			.prepare(`SELECT MAX(CAST(SUBSTR(id, 2) AS INTEGER)) AS max FROM ${table}`)
			.first<{ max: number | null }>();
		return `${prefix}${String((row?.max ?? 0) + 1).padStart(4, "0")}`;
	}

	public async findRecipeByName<T>(name: string): Promise<StoredRecord<T> | null> {
		const row = await this.db
			.prepare("SELECT id, created_at, updated_at, data FROM recipes WHERE name_norm = ?")
			.bind(normalizeName(name))
			.first<Row>();
		return row ? toRecord<T>(row) : null;
	}

	public async getRecipe<T>(id: string): Promise<StoredRecord<T> | null> {
		const row = await this.db
			.prepare("SELECT id, created_at, updated_at, data FROM recipes WHERE id = ?")
			.bind(id)
			.first<Row>();
		return row ? toRecord<T>(row) : null;
	}

	public async insertRecipe<T extends { name: string }>(
		id: string,
		data: T,
		createdAt?: string,
	): Promise<StoredRecord<T>> {
		const now = this.now();
		const created = createdAt ?? now;
		await this.db
			.prepare(
				"INSERT INTO recipes (id, name, name_norm, created_at, updated_at, data) VALUES (?, ?, ?, ?, ?, ?)",
			)
			.bind(id, data.name, normalizeName(data.name), created, now, JSON.stringify(data))
			.run();
		return { id, createdAt: created, updatedAt: now, data };
	}

	public async updateRecipe<T extends { name: string }>(id: string, data: T): Promise<StoredRecord<T> | null> {
		const existing = await this.getRecipe<T>(id);
		if (!existing) {
			return null;
		}
		const now = this.now();
		await this.db
			.prepare("UPDATE recipes SET name = ?, name_norm = ?, updated_at = ?, data = ? WHERE id = ?")
			.bind(data.name, normalizeName(data.name), now, JSON.stringify(data), id)
			.run();
		return { id, createdAt: existing.createdAt, updatedAt: now, data };
	}

	public async deleteRecipe(id: string): Promise<void> {
		await this.db.prepare("DELETE FROM recipes WHERE id = ?").bind(id).run();
	}

	public async listRecipes<T>(query?: string, limit = 50): Promise<StoredRecord<T>[]> {
		const normalized = query ? normalizeName(query) : "";
		const statement = normalized
			? this.db
					.prepare(
						"SELECT id, created_at, updated_at, data FROM recipes WHERE name_norm LIKE ? ORDER BY id LIMIT ?",
					)
					.bind(`%${normalized}%`, limit)
			: this.db.prepare("SELECT id, created_at, updated_at, data FROM recipes ORDER BY id LIMIT ?").bind(limit);
		const { results } = await statement.all<Row>();
		return results.map((row) => toRecord<T>(row));
	}

	public async findProduct<T>(match: {
		barcode?: string;
		name: string;
		brand?: string;
	}): Promise<StoredRecord<T> | null> {
		if (match.barcode) {
			const byBarcode = await this.db
				.prepare("SELECT id, created_at, updated_at, data FROM products WHERE barcode = ?")
				.bind(match.barcode)
				.first<Row>();
			if (byBarcode) {
				return toRecord<T>(byBarcode);
			}
		}
		const row = await this.db
			.prepare("SELECT id, created_at, updated_at, data FROM products WHERE name_norm = ?")
			.bind(productKey(match.name, match.brand))
			.first<Row>();
		return row ? toRecord<T>(row) : null;
	}

	public async getProduct<T>(id: string): Promise<StoredRecord<T> | null> {
		const row = await this.db
			.prepare("SELECT id, created_at, updated_at, data FROM products WHERE id = ?")
			.bind(id)
			.first<Row>();
		return row ? toRecord<T>(row) : null;
	}

	public async upsertProduct<T extends { name: string; brand?: string; barcode?: string }>(
		id: string,
		data: T,
		isNew: boolean,
	): Promise<StoredRecord<T>> {
		const now = this.now();
		const values = [data.name, data.brand ?? null, data.barcode ?? null, productKey(data.name, data.brand)];
		if (isNew) {
			await this.db
				.prepare(
					"INSERT INTO products (id, name, brand, barcode, name_norm, created_at, updated_at, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
				)
				.bind(id, ...values, now, now, JSON.stringify(data))
				.run();
			return { id, createdAt: now, updatedAt: now, data };
		}
		await this.db
			.prepare(
				"UPDATE products SET name = ?, brand = ?, barcode = ?, name_norm = ?, updated_at = ?, data = ? WHERE id = ?",
			)
			.bind(...values, now, JSON.stringify(data), id)
			.run();
		const stored = await this.getProduct<T>(id);
		return stored ?? { id, createdAt: now, updatedAt: now, data };
	}

	public async listProducts<T>(query?: string, limit = 50): Promise<StoredRecord<T>[]> {
		const normalized = query ? normalizeName(query) : "";
		const statement = normalized
			? this.db
					.prepare(
						"SELECT id, created_at, updated_at, data FROM products WHERE name_norm LIKE ? OR barcode = ? ORDER BY id LIMIT ?",
					)
					.bind(`%${normalized}%`, query, limit)
			: this.db.prepare("SELECT id, created_at, updated_at, data FROM products ORDER BY id LIMIT ?").bind(limit);
		const { results } = await statement.all<Row>();
		return results.map((row) => toRecord<T>(row));
	}
}

export function productKey(name: string, brand?: string): string {
	return normalizeName(brand ? `${brand} ${name}` : name);
}
