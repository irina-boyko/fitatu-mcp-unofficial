import { describe, expect, it } from "vitest";
import { isAuthorized } from "./auth.ts";
import { computeRecipeNutrition, normalizeName } from "./nutrition.ts";

const TOKEN = "a".repeat(40);

describe("isAuthorized", () => {
	it("accepts only the exact bearer token", () => {
		expect(isAuthorized(`Bearer ${TOKEN}`, TOKEN)).toBe(true);
		expect(isAuthorized(`Bearer ${TOKEN}b`, TOKEN)).toBe(false);
		expect(isAuthorized(TOKEN, TOKEN)).toBe(false);
		expect(isAuthorized(null, TOKEN)).toBe(false);
	});

	it("refuses every request when the configured token is missing or weak", () => {
		expect(isAuthorized("Bearer short", "short")).toBe(false);
		expect(isAuthorized("Bearer ", undefined)).toBe(false);
	});
});

describe("computeRecipeNutrition", () => {
	const ingredients = [
		{
			name: "Syrniki",
			grams: 150,
			per100: { kcal: 209, protein: 16, fat: 8.6, carbs: 17 },
			source: "label" as const,
		},
		{
			name: "Oil",
			grams: 2,
			per100: { kcal: 819, protein: 0, fat: 91, carbs: 0 },
			source: "label" as const,
			approximate: true,
		},
	];

	it("sums ingredients and marks approximate quantities as an estimate", () => {
		const result = computeRecipeNutrition({ ingredients });
		expect(result.totals).toEqual({ kcal: 329.9, protein: 24, fat: 14.72, carbs: 25.5 });
		expect(result.per100Basis).toBe("ingredients_weight");
		expect(result.accuracy).toBe("estimate");
		expect(result.accuracyReasons).toHaveLength(2);
	});

	it("uses the cooked weight for per-100 g and serving values", () => {
		const result = computeRecipeNutrition({ ingredients, cookedWeightG: 100, servingSizeG: 50 });
		expect(result.per100.kcal).toBe(329.9);
		expect(result.serving.kcal).toBe(164.9);
		expect(result.per100Basis).toBe("cooked_weight");
	});

	it("rejects non-positive weights", () => {
		expect(() => computeRecipeNutrition({ ingredients: [{ ...ingredients[0], grams: 0 }] })).toThrow();
	});
});

describe("normalizeName", () => {
	it("ignores case, punctuation and ё", () => {
		expect(normalizeName("Сырники, с ЙОГУРТОМ!")).toBe(normalizeName("сырники с йогуртом"));
		expect(normalizeName("Ёжик")).toBe(normalizeName("ежик"));
	});
});
