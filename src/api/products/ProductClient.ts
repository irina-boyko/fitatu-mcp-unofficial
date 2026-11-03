import { ObjectUtils } from "../../shared/ObjectUtils.ts";
import { FitatuAuthClient } from "../auth/FitatuAuthClient.ts";
import { FitatuApiClientBase } from "../fitatuApiClientBase/FitatuApiClientBase.ts";
import type { FitatuApiClientBaseOptions } from "../fitatuApiClientBase/FitatuApiClientBaseOptions.ts";
import { FITATU_CLIENT_OPERATIONS } from "../fitatuApiClientBase/FitatuClientOperations.ts";
import { FitatuResponseDecodeError } from "../fitatuApiClientBase/FitatuResponseDecodeError.ts";

/** Values per 100 g (or 100 ml when unit is "ml"), as printed on the label. */
export interface ProductCreateInput {
	readonly name: string;
	readonly brand?: string;
	readonly energyKcal: number;
	readonly proteinG: number;
	readonly fatG: number;
	readonly carbohydrateG: number;
	readonly sugarsG?: number;
	readonly fiberG?: number;
	readonly saturatedFatG?: number;
	readonly saltG?: number;
	readonly barcode?: string;
	readonly unit?: "g" | "ml";
}

/**
 * Creates private user products (POST /products), the same request the Fitatu app sends.
 * The first measure sets the base the values are per; 100 g (or 100 ml) keeps them per 100.
 */
export class ProductClient extends FitatuApiClientBase {
	private static instance: ProductClient | undefined;

	protected constructor(options: FitatuApiClientBaseOptions = {}) {
		super({ ...options, authClient: options.authClient ?? FitatuAuthClient.getInstance() });
	}

	public static getInstance(options: FitatuApiClientBaseOptions = {}): ProductClient {
		ProductClient.instance ??= new ProductClient(options);
		return ProductClient.instance;
	}

	public async createProduct(input: ProductCreateInput): Promise<{ readonly id: string; readonly name: string }> {
		const unit = input.unit ?? "g";
		const optional: Record<string, unknown> = {
			brand: input.brand,
			sugars: input.sugarsG,
			fiber: input.fiberG,
			saturatedFat: input.saturatedFatG,
			salt: input.saltG,
			barcode: input.barcode,
		};
		const body: Record<string, unknown> = {
			name: input.name,
			energy: input.energyKcal,
			protein: input.proteinG,
			fat: input.fatG,
			carbohydrate: input.carbohydrateG,
			measures: [{ measureKey: unit === "ml" ? "MILLILITER" : "GRAM", measureUnit: unit, weight: 100 }],
			...Object.fromEntries(Object.entries(optional).filter(([, value]) => value !== undefined)),
		};

		return this.performCallout({
			operation: FITATU_CLIENT_OPERATIONS.productsCreate,
			method: "POST",
			path: "/products",
			endpointTemplate: "/products",
			failureMessage: "Fitatu product creation failed",
			invalidResponseMessage: "Fitatu product creation response was invalid",
			headers: { accept: "application/json", "content-type": "application/json;charset=UTF-8" },
			body: JSON.stringify(body),
			decoder: (data) => {
				if (!ObjectUtils.isRecord(data) || (typeof data.id !== "string" && typeof data.id !== "number")) {
					throw new FitatuResponseDecodeError("Product creation response did not contain an id");
				}
				return { id: String(data.id), name: typeof data.name === "string" ? data.name : input.name };
			},
		});
	}

	/** Reads the raw product (GET /products/:id) so callers can check name and ownership before deleting. */
	public async getProduct(
		productId: string,
	): Promise<{ readonly id: string; readonly name: string; readonly userId: string | null }> {
		return this.performCallout({
			operation: FITATU_CLIENT_OPERATIONS.productsGet,
			method: "GET",
			path: `/products/${encodeURIComponent(productId)}`,
			endpointTemplate: "/products/:productId",
			failureMessage: "Fitatu product request failed",
			invalidResponseMessage: "Fitatu product response was invalid",
			headers: { accept: "application/json" },
			decoder: (data) => {
				if (!ObjectUtils.isRecord(data) || typeof data.name !== "string") {
					throw new FitatuResponseDecodeError("Product response did not contain a name");
				}
				const owner = data.userId ?? data.ownerId ?? null;
				return {
					id: String(data.id ?? productId),
					name: data.name,
					userId: owner === null || owner === undefined ? null : String(owner),
				};
			},
		});
	}

	/** Deletes a private user product (DELETE /products/:id), as the Fitatu app does from "My products". */
	public async deleteProduct(productId: string): Promise<void> {
		await this.performCallout({
			operation: FITATU_CLIENT_OPERATIONS.productsDelete,
			method: "DELETE",
			path: `/products/${encodeURIComponent(productId)}`,
			endpointTemplate: "/products/:productId",
			failureMessage: "Fitatu product deletion failed",
			invalidResponseMessage: "Fitatu product deletion response was invalid",
			headers: { accept: "application/json" },
			decoder: () => null,
		});
	}
}
