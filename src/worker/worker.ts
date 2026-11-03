import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { registerFitatuTools } from "../createServer.ts";
import { ApplicationServices } from "../services/ApplicationServices.ts";
import { isAuthorized } from "./auth.ts";
import type { D1Database } from "./d1.ts";
import { NutritionStore } from "./NutritionStore.ts";
import { ensureSchema } from "./schema.ts";
import { registerNutritionTools } from "./NutritionTools.ts";

export interface Env {
	readonly DB: D1Database;
	readonly MCP_AUTH_TOKEN?: string;
	readonly FITATU_EMAIL?: string;
	readonly FITATU_PASSWORD?: string;
}

// One instance per isolate, so the Fitatu session token is reused across requests.
let applicationServices: ApplicationServices | undefined;

const SERVER_INSTRUCTIONS =
	"Personal nutrition assistant backed by Fitatu (unofficial API) and a private recipe/product database. " +
	"Before any Fitatu write (add/update/remove meal items, create/update/delete recipes) show the user the calories and macros and wait for explicit confirmation. " +
	"Before add_meal_items always read get_day_plan_items for that date to avoid duplicate entries. " +
	"Package labels are the primary nutrition source; check products_search before products_save. " +
	"Use recipes_save so totals are computed server-side, and mark approximate quantities as approximate.";

function jsonError(status: number, message: string): Response {
	return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }), {
		status,
		headers: { "content-type": "application/json" },
	});
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname === "/health") {
			return new Response("ok");
		}
		if (url.pathname !== "/mcp") {
			return new Response("Not found", { status: 404 });
		}
		if (!isAuthorized(request.headers.get("authorization"), env.MCP_AUTH_TOKEN)) {
			return jsonError(401, "Unauthorized");
		}

		await ensureSchema(env.DB);
		applicationServices ??= new ApplicationServices();
		const server = new McpServer(
			{ name: "fitatu-mcp", version: "3.0.1-worker" },
			{ instructions: SERVER_INSTRUCTIONS },
		);
		registerFitatuTools(server, applicationServices);
		registerNutritionTools(server, new NutritionStore(env.DB));

		// Stateless mode: Workers isolates do not share memory, so each request gets a fresh transport.
		const transport = new WebStandardStreamableHTTPServerTransport({
			sessionIdGenerator: undefined,
			enableJsonResponse: true,
		});
		await server.connect(transport);
		return transport.handleRequest(request);
	},
};
