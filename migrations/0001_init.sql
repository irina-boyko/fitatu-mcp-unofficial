CREATE TABLE IF NOT EXISTS recipes (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	name_norm TEXT NOT NULL,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS recipes_name_norm ON recipes(name_norm);

CREATE TABLE IF NOT EXISTS products (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	brand TEXT,
	barcode TEXT,
	name_norm TEXT NOT NULL,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS products_name_norm ON products(name_norm);
CREATE UNIQUE INDEX IF NOT EXISTS products_barcode ON products(barcode) WHERE barcode IS NOT NULL;
