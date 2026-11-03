export interface Macros {
	readonly kcal: number;
	readonly protein: number;
	readonly fat: number;
	readonly carbs: number;
}

export interface IngredientInput {
	readonly name: string;
	readonly brand?: string;
	readonly grams: number;
	readonly state?: "raw" | "frozen" | "cooked" | "as_served";
	readonly per100: Macros;
	readonly source: "label" | "fitatu" | "reference" | "estimate";
	readonly approximate?: boolean;
	readonly fitatuProductId?: string;
	readonly note?: string;
}

export interface ComputedIngredient extends IngredientInput {
	readonly totals: Macros;
}

export interface RecipeNutrition {
	readonly ingredients: ComputedIngredient[];
	readonly totals: Macros;
	readonly ingredientsWeightG: number;
	readonly cookedWeightG: number | null;
	readonly per100: Macros;
	readonly per100Basis: "cooked_weight" | "ingredients_weight";
	readonly serving: { readonly sizeG: number; readonly label: string } & Macros;
	readonly accuracy: "exact" | "estimate";
	readonly accuracyReasons: string[];
}

const round = (value: number, digits: number): number => {
	const factor = 10 ** digits;
	return Math.round((value + Number.EPSILON) * factor) / factor;
};

export function roundMacros(macros: Macros): Macros {
	return {
		kcal: round(macros.kcal, 1),
		protein: round(macros.protein, 2),
		fat: round(macros.fat, 2),
		carbs: round(macros.carbs, 2),
	};
}

function scale(macros: Macros, factor: number): Macros {
	return {
		kcal: macros.kcal * factor,
		protein: macros.protein * factor,
		fat: macros.fat * factor,
		carbs: macros.carbs * factor,
	};
}

function add(a: Macros, b: Macros): Macros {
	return { kcal: a.kcal + b.kcal, protein: a.protein + b.protein, fat: a.fat + b.fat, carbs: a.carbs + b.carbs };
}

const ZERO: Macros = { kcal: 0, protein: 0, fat: 0, carbs: 0 };

/** Deterministic recipe arithmetic, so totals never depend on the model doing sums in its head. */
export function computeRecipeNutrition(input: {
	readonly ingredients: readonly IngredientInput[];
	readonly cookedWeightG?: number | null;
	readonly servingSizeG?: number | null;
	readonly servingLabel?: string;
}): RecipeNutrition {
	if (input.ingredients.length === 0) {
		throw new Error("At least one ingredient is required");
	}
	let exactTotals = ZERO;
	let ingredientsWeightG = 0;
	const ingredients = input.ingredients.map((ingredient) => {
		if (!(ingredient.grams > 0)) {
			throw new Error(`Ingredient "${ingredient.name}" must have a positive weight`);
		}
		const totals = scale(ingredient.per100, ingredient.grams / 100);
		exactTotals = add(exactTotals, totals);
		ingredientsWeightG += ingredient.grams;
		return { ...ingredient, totals: roundMacros(totals) };
	});

	const cookedWeightG = input.cookedWeightG && input.cookedWeightG > 0 ? input.cookedWeightG : null;
	const basisWeight = cookedWeightG ?? ingredientsWeightG;
	const per100 = scale(exactTotals, 100 / basisWeight);
	const servingSizeG = input.servingSizeG && input.servingSizeG > 0 ? input.servingSizeG : basisWeight;
	const serving = scale(exactTotals, servingSizeG / basisWeight);

	const accuracyReasons: string[] = [];
	for (const ingredient of input.ingredients) {
		if (ingredient.approximate) {
			accuracyReasons.push(`approximate quantity: ${ingredient.name}`);
		}
		if (ingredient.source === "estimate") {
			accuracyReasons.push(`estimated nutrition values: ${ingredient.name}`);
		}
	}
	if (!cookedWeightG) {
		accuracyReasons.push("cooked weight not measured; per-100 g values use the ingredients weight");
	}

	return {
		ingredients,
		totals: roundMacros(exactTotals),
		ingredientsWeightG: round(ingredientsWeightG, 1),
		cookedWeightG,
		per100: roundMacros(per100),
		per100Basis: cookedWeightG ? "cooked_weight" : "ingredients_weight",
		serving: {
			sizeG: round(servingSizeG, 1),
			label: input.servingLabel ?? (servingSizeG === basisWeight ? "whole dish" : `${round(servingSizeG, 1)} g`),
			...roundMacros(serving),
		},
		accuracy: accuracyReasons.length === 0 ? "exact" : "estimate",
		accuracyReasons,
	};
}

export function normalizeName(value: string): string {
	return value
		.toLocaleLowerCase("ru")
		.normalize("NFKD")
		.replace(/\p{M}/gu, "")
		.replace(/ё/g, "е")
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim();
}
