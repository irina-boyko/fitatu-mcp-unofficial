import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ProductClient } from "../api/products/ProductClient.ts";

const nonNegative = z.number().min(0);

/** Rough check that label energy matches 4/9/4 kcal per gram of protein/fat/carbs (polyols and fibre aside). */
export function energyMismatchWarning(kcal: number, protein: number, fat: number, carbs: number): string | undefined {
	const computed = protein * 4 + fat * 9 + carbs * 4;
	if (kcal === 0 && computed === 0) {
		return undefined;
	}
	const diff = Math.abs(kcal - computed) / Math.max(kcal, computed);
	return diff > 0.15
		? `Label energy ${kcal} kcal differs from ${computed.toFixed(0)} kcal computed from macros; re-read the label before trusting it.`
		: undefined;
}

export function registerFitatuProductTools(server: McpServer, client = ProductClient.getInstance()): void {
	server.registerTool(
		"create_fitatu_product",
		{
			title: "Create Fitatu product",
			description:
				"Creates a private product in the user's Fitatu account from package label values per 100 g (or 100 ml with unit='ml'). Use only after search_food and search_food_by_barcodes found no matching product; this is never deduplicated by Fitatu, so repeating the call creates another product. Show the values to the user and get confirmation first. Returns the new productId; then call search_food with includeDetails to confirm it and get measureId values for create_recipe or add_meal_items.",
			inputSchema: {
				name: z.string().trim().min(1),
				brand: z.string().trim().min(1).optional(),
				energyKcal: nonNegative,
				proteinG: nonNegative,
				fatG: nonNegative,
				carbohydrateG: nonNegative,
				sugarsG: nonNegative.optional(),
				fiberG: nonNegative.optional(),
				saturatedFatG: nonNegative.optional(),
				saltG: nonNegative.optional(),
				barcode: z
					.string()
					.regex(/^\d{8,14}$/)
					.optional(),
				unit: z.enum(["g", "ml"]).optional(),
			},
			annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
		},
		async (input) => {
			try {
				const created = await client.createProduct(input);
				const warning = energyMismatchWarning(
					input.energyKcal,
					input.proteinG,
					input.fatG,
					input.carbohydrateG,
				);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									status: "created",
									productId: created.id,
									name: created.name,
									...(warning ? { warning } : {}),
									next: "Verify with search_food (includeUserFood) and use its productId and measureId.",
								},
								null,
								2,
							),
						},
					],
				};
			} catch (error) {
				return {
					isError: true,
					content: [
						{
							type: "text",
							text: error instanceof Error ? error.message : "Fitatu product creation failed",
						},
					],
				};
			}
		},
	);

	server.registerTool(
		"delete_fitatu_product",
		{
			title: "Delete Fitatu product",
			description:
				"Deletes a private product the user created in Fitatu (\"My products\"). Requires the productId and the exact current product name as confirmation; the name is checked against Fitatu before deleting. Only for the user's own products, never public catalog items. Ask the user first and make sure no recipe still uses the product. Returns { status: 'deleted', productId, name }.",
			inputSchema: {
				productId: z.string().trim().regex(/^\d+$/),
				expectedName: z.string().min(1),
			},
			annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
		},
		async ({ productId, expectedName }) => {
			try {
				const product = await client.getProduct(productId);
				if (product.name !== expectedName) {
					return {
						isError: true,
						content: [
							{
								type: "text",
								text: `Product ${productId} is named "${product.name}", not "${expectedName}"; nothing was deleted.`,
							},
						],
					};
				}
				await client.deleteProduct(productId);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify({ status: "deleted", productId, name: product.name }, null, 2),
						},
					],
				};
			} catch (error) {
				return {
					isError: true,
					content: [
						{
							type: "text",
							text: error instanceof Error ? error.message : "Fitatu product deletion failed",
						},
					],
				};
			}
		},
	);
}
