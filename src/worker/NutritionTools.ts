import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { computeRecipeNutrition, type IngredientInput, type RecipeNutrition } from "./nutrition.ts";
import type { NutritionStore, StoredRecord } from "./NutritionStore.ts";

const macrosSchema = z.object({
	kcal: z.number().min(0).describe("Energy, kcal"),
	protein: z.number().min(0).describe("Protein, g"),
	fat: z.number().min(0).describe("Fat, g"),
	carbs: z.number().min(0).describe("Carbohydrates, g"),
});

const ingredientSchema = z.object({
	name: z.string().min(1),
	brand: z.string().optional(),
	grams: z.number().positive().describe("Weight used in the dish, in grams, in the state given by `state`."),
	state: z
		.enum(["raw", "frozen", "cooked", "as_served"])
		.optional()
		.describe("State of the ingredient when weighed: raw, frozen (before cooking), cooked or as_served."),
	per100: macrosSchema.describe("Nutrition per 100 g in that same state."),
	source: z
		.enum(["label", "fitatu", "reference", "estimate"])
		.describe("Where per100 came from. The package label has priority over every other source."),
	approximate: z.boolean().optional().describe("True when the weight was not measured exactly (e.g. oil in a pan)."),
	fitatuProductId: z.string().optional(),
	note: z.string().optional(),
});

const recipeInputShape = {
	id: z.string().optional().describe("Existing recipe id (e.g. R0001) to update. Omit to create a new recipe."),
	name: z.string().min(1),
	createdDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional()
		.describe("Date the dish was made, YYYY-MM-DD."),
	ingredients: z.array(ingredientSchema).min(1),
	cookedWeightG: z
		.number()
		.positive()
		.optional()
		.describe("Measured weight of the finished dish. Without it per-100 g values use the ingredients weight."),
	servingSizeG: z.number().positive().optional().describe("Standard serving in grams. Defaults to the whole dish."),
	servingLabel: z.string().optional(),
	method: z.array(z.string()).optional().describe("Preparation steps, one per item."),
	comments: z.string().optional(),
	sources: z.array(z.string()).optional(),
	fitatuRecipeId: z.string().optional().describe("Fitatu recipe id once the recipe also exists in Fitatu."),
	allowDuplicateName: z
		.boolean()
		.optional()
		.describe("Only set true after the user confirmed a second recipe with the same name is intended."),
};

type RecipeInput = z.infer<z.ZodObject<typeof recipeInputShape>>;

export interface StoredRecipe extends RecipeNutrition {
	readonly name: string;
	readonly createdDate: string;
	readonly method: string[];
	readonly comments?: string;
	readonly sources: string[];
	readonly fitatuRecipeId?: string;
}

const productShape = {
	id: z.string().optional().describe("Existing product id (e.g. P0001) to update."),
	name: z.string().min(1),
	brand: z.string().optional().describe("Manufacturer or brand from the package."),
	barcode: z
		.string()
		.regex(/^\d{6,14}$/)
		.optional(),
	per100: macrosSchema,
	source: z.enum(["label", "fitatu", "reference", "estimate"]),
	packageWeightG: z.number().positive().optional(),
	ingredientsText: z.string().optional().describe("Ingredient list from the label."),
	fitatuProductId: z.string().optional(),
	notes: z.string().optional(),
};
type ProductInput = z.infer<z.ZodObject<typeof productShape>>;
type StoredProduct = Omit<ProductInput, "id">;

const json = (data: unknown): CallToolResult => ({
	content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
});
const failure = (message: string): CallToolResult => ({ isError: true, content: [{ type: "text", text: message }] });

function buildRecipe(input: RecipeInput, today: string): StoredRecipe {
	const nutrition = computeRecipeNutrition({
		ingredients: input.ingredients as IngredientInput[],
		cookedWeightG: input.cookedWeightG,
		servingSizeG: input.servingSizeG,
		servingLabel: input.servingLabel,
	});
	return {
		name: input.name.trim(),
		createdDate: input.createdDate ?? today,
		...nutrition,
		method: input.method ?? [],
		comments: input.comments,
		sources: input.sources ?? [...new Set(input.ingredients.map((ingredient) => ingredient.source))],
		fitatuRecipeId: input.fitatuRecipeId,
	};
}

export function summarizeRecipe(record: StoredRecord<StoredRecipe>) {
	const recipe = record.data;
	return {
		id: record.id,
		name: recipe.name,
		createdDate: recipe.createdDate,
		totals: recipe.totals,
		per100: recipe.per100,
		serving: recipe.serving,
		accuracy: recipe.accuracy,
		fitatuRecipeId: recipe.fitatuRecipeId ?? null,
	};
}

const CSV_COLUMNS = [
	"recipe_id",
	"recipe_name",
	"created_date",
	"row_type",
	"ingredient",
	"brand",
	"grams",
	"state",
	"kcal_100",
	"protein_100",
	"fat_100",
	"carbs_100",
	"kcal",
	"protein",
	"fat",
	"carbs",
	"source",
	"approximate",
	"cooked_weight_g",
	"accuracy",
	"fitatu_recipe_id",
];

const csvCell = (value: unknown): string => {
	const text = value === undefined || value === null ? "" : String(value);
	return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function recipesToCsv(records: StoredRecord<StoredRecipe>[]): string {
	const lines = [CSV_COLUMNS.join(",")];
	for (const { id, data } of records) {
		for (const ingredient of data.ingredients) {
			lines.push(
				[
					id,
					data.name,
					data.createdDate,
					"ingredient",
					ingredient.name,
					ingredient.brand,
					ingredient.grams,
					ingredient.state,
					ingredient.per100.kcal,
					ingredient.per100.protein,
					ingredient.per100.fat,
					ingredient.per100.carbs,
					ingredient.totals.kcal,
					ingredient.totals.protein,
					ingredient.totals.fat,
					ingredient.totals.carbs,
					ingredient.source,
					ingredient.approximate ?? false,
					"",
					"",
					"",
				]
					.map(csvCell)
					.join(","),
			);
		}
		lines.push(
			[
				id,
				data.name,
				data.createdDate,
				"total",
				"",
				"",
				data.ingredientsWeightG,
				"",
				data.per100.kcal,
				data.per100.protein,
				data.per100.fat,
				data.per100.carbs,
				data.totals.kcal,
				data.totals.protein,
				data.totals.fat,
				data.totals.carbs,
				"",
				"",
				data.cookedWeightG,
				data.accuracy,
				data.fitatuRecipeId,
			]
				.map(csvCell)
				.join(","),
		);
	}
	return lines.join("\n");
}

/** Registers the local recipe and product database tools (stored in D1, independent of Fitatu). */
export function registerNutritionTools(
	server: McpServer,
	store: NutritionStore,
	today: () => string = () => new Date().toISOString().slice(0, 10),
): void {
	server.registerTool(
		"recipes_save",
		{
			title: "Save recipe to personal database",
			description:
				"Saves a recipe to the user's own recipe database (not Fitatu). Totals, per-100 g and per-serving values are computed server-side from grams and per-100 g values; never pass totals. Without `id` a new recipe is created; if a recipe with the same name exists the call returns status 'duplicate' with the existing recipe instead of saving. With `id` the recipe is replaced. Show the user the computed result.",
			inputSchema: recipeInputShape,
			annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
		},
		async (input) => {
			try {
				const recipe = buildRecipe(input, today());
				if (input.id) {
					const updated = await store.updateRecipe(input.id, recipe);
					return updated
						? json({ status: "updated", recipe: { id: updated.id, ...updated.data } })
						: failure(`Recipe ${input.id} not found`);
				}
				const existing = await store.findRecipeByName<StoredRecipe>(recipe.name);
				if (existing && !input.allowDuplicateName) {
					return json({
						status: "duplicate",
						message: "A recipe with this name already exists; nothing was saved.",
						existing: summarizeRecipe(existing),
					});
				}
				const id = await store.nextId("recipes");
				const saved = await store.insertRecipe(id, recipe);
				return json({ status: "created", recipe: { id: saved.id, ...saved.data } });
			} catch (error) {
				return failure(error instanceof Error ? error.message : "Could not save recipe");
			}
		},
	);

	server.registerTool(
		"recipes_search",
		{
			title: "Search personal recipes",
			description:
				"Lists recipes from the user's own database with totals, per-100 g and per-serving values. Use these stored values for menus instead of recalculating. Omit `query` to list everything.",
			inputSchema: { query: z.string().optional(), limit: z.number().int().min(1).max(200).optional() },
			annotations: { readOnlyHint: true, openWorldHint: false },
		},
		async ({ query, limit }) => {
			const records = await store.listRecipes<StoredRecipe>(query, limit ?? 50);
			return json({ count: records.length, recipes: records.map(summarizeRecipe) });
		},
	);

	server.registerTool(
		"recipes_get",
		{
			title: "Get personal recipe",
			description: "Returns one recipe from the user's own database with every ingredient and computed value.",
			inputSchema: { id: z.string() },
			annotations: { readOnlyHint: true, openWorldHint: false },
		},
		async ({ id }) => {
			const record = await store.getRecipe<StoredRecipe>(id);
			return record
				? json({ id: record.id, createdAt: record.createdAt, updatedAt: record.updatedAt, ...record.data })
				: failure(`Recipe ${id} not found`);
		},
	);

	server.registerTool(
		"recipes_delete",
		{
			title: "Delete personal recipe",
			description:
				"Deletes a recipe from the user's own database. Requires the exact recipe name as confirmation. Ask the user first.",
			inputSchema: { id: z.string(), confirmName: z.string() },
			annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
		},
		async ({ id, confirmName }) => {
			const record = await store.getRecipe<StoredRecipe>(id);
			if (!record) {
				return failure(`Recipe ${id} not found`);
			}
			if (record.data.name !== confirmName) {
				return failure("confirmName does not match the recipe name; nothing was deleted");
			}
			await store.deleteRecipe(id);
			return json({ status: "deleted", id });
		},
	);

	server.registerTool(
		"recipes_export",
		{
			title: "Export personal recipes",
			description:
				"Exports all recipes from the user's own database as JSON or CSV text (one row per ingredient plus a total row per recipe).",
			inputSchema: { format: z.enum(["json", "csv"]) },
			annotations: { readOnlyHint: true, openWorldHint: false },
		},
		async ({ format }) => {
			const records = await store.listRecipes<StoredRecipe>(undefined, 10000);
			const text =
				format === "csv"
					? recipesToCsv(records)
					: JSON.stringify(
							{
								schemaVersion: 1,
								exportedAt: new Date().toISOString(),
								recipes: records.map((r) => ({
									id: r.id,
									createdAt: r.createdAt,
									updatedAt: r.updatedAt,
									...r.data,
								})),
							},
							null,
							2,
						);
			return { content: [{ type: "text", text }] };
		},
	);

	server.registerTool(
		"products_save",
		{
			title: "Save product to personal database",
			description:
				"Saves a packaged product (typically read from a label photo) to the user's own product database. Deduplicates by barcode, then by brand + name: if a match exists it is returned with status 'exists' and nothing is written, unless `id` is passed to update it.",
			inputSchema: productShape,
			annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
		},
		async (input) => {
			const { id, ...data } = input;
			if (id) {
				const existing = await store.getProduct<StoredProduct>(id);
				if (!existing) {
					return failure(`Product ${id} not found`);
				}
				const saved = await store.upsertProduct(id, data, false);
				return json({ status: "updated", product: { id: saved.id, ...saved.data } });
			}
			const duplicate = await store.findProduct<StoredProduct>(data);
			if (duplicate) {
				return json({ status: "exists", product: { id: duplicate.id, ...duplicate.data } });
			}
			const newId = await store.nextId("products");
			const saved = await store.upsertProduct(newId, data, true);
			return json({ status: "created", product: { id: saved.id, ...saved.data } });
		},
	);

	server.registerTool(
		"products_search",
		{
			title: "Search personal products",
			description:
				"Searches the user's own product database by name, brand or exact barcode. Check here before saving a product.",
			inputSchema: { query: z.string().optional(), limit: z.number().int().min(1).max(200).optional() },
			annotations: { readOnlyHint: true, openWorldHint: false },
		},
		async ({ query, limit }) => {
			const records = await store.listProducts<StoredProduct>(query, limit ?? 50);
			return json({ count: records.length, products: records.map((r) => ({ id: r.id, ...r.data })) });
		},
	);
}
