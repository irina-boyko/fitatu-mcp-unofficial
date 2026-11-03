import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getConfig } from "./config.ts";
import { AddMealItemsTool } from "./tools/addMealItems/AddMealItemsTool.ts";
import { GetCurrentUserTool } from "./tools/currentUser/GetCurrentUserTool.ts";
import { GetDayPlanItemsTool } from "./tools/dayPlanItems/GetDayPlanItemsTool.ts";
import { GetDietSummaryTool } from "./tools/dietSummary/GetDietSummaryTool.ts";
import { MoveMealItemTool } from "./tools/mealItems/MoveMealItemTool.ts";
import { RemoveMealItemsTool } from "./tools/mealItems/RemoveMealItemsTool.ts";
import { ReplaceMealItemTool } from "./tools/mealItems/ReplaceMealItemTool.ts";
import { UpdateMealItemTool } from "./tools/mealItems/UpdateMealItemTool.ts";
import { SearchFoodTool } from "./tools/searchFood/SearchFoodTool.ts";
import { SearchFoodByBarcodesTool } from "./tools/searchFood/SearchFoodByBarcodesTool.ts";
import { CreateRecipeTool } from "./tools/recipes/CreateRecipeTool.ts";
import { DeleteRecipeTool } from "./tools/recipes/DeleteRecipeTool.ts";
import { GetRecipeTool } from "./tools/recipes/GetRecipeTool.ts";
import { SearchRecipesTool } from "./tools/recipes/SearchRecipesTool.ts";
import { UpdateRecipeTool } from "./tools/recipes/UpdateRecipeTool.ts";
import { ApplicationServices } from "./services/ApplicationServices.ts";
import { GetUserSettingsTool } from "./tools/userSettings/GetUserSettingsTool.ts";
import { UpdateUserSettingsTool } from "./tools/userSettings/UpdateUserSettingsTool.ts";
import { GetBodyMeasurementTool } from "./tools/bodyMeasurements/GetBodyMeasurementTool.ts";
import { SaveBodyMeasurementTool } from "./tools/bodyMeasurements/SaveBodyMeasurementTool.ts";

/** Registers every Fitatu tool on the given MCP server. Shared by the Node entry point and the Cloudflare Worker. */
export function registerFitatuTools(server: McpServer, applicationServices: ApplicationServices): void {
	new GetCurrentUserTool(applicationServices.currentUserService).register(server);
	new GetBodyMeasurementTool(applicationServices.bodyMeasurementService).register(server);
	new SaveBodyMeasurementTool(applicationServices.bodyMeasurementService).register(server);
	new GetUserSettingsTool(applicationServices.userSettingsService).register(server);
	new UpdateUserSettingsTool(applicationServices.userSettingsService).register(server);
	new GetDayPlanItemsTool(applicationServices.dayPlanQueryService).register(server);
	new GetDietSummaryTool(applicationServices.dietSummaryService).register(server);
	new SearchFoodTool(applicationServices.foodSearchService).register(server);
	new SearchFoodByBarcodesTool(applicationServices.foodSearchService).register(server);
	new AddMealItemsTool(applicationServices.mealItemMutationService).register(server);
	new UpdateMealItemTool(applicationServices.mealItemMutationService).register(server);
	new ReplaceMealItemTool(applicationServices.mealItemMutationService).register(server);
	new RemoveMealItemsTool(applicationServices.mealItemMutationService).register(server);
	new MoveMealItemTool(applicationServices.mealItemMutationService).register(server);
	new CreateRecipeTool(applicationServices.recipeService).register(server);
	new GetRecipeTool(applicationServices.recipeService).register(server);
	new SearchRecipesTool(applicationServices.recipeService).register(server);
	new UpdateRecipeTool(applicationServices.recipeService).register(server);
	new DeleteRecipeTool(applicationServices.recipeService).register(server);
}

export function createFitatuServer(applicationServices: ApplicationServices): McpServer {
	const config = getConfig();
	const server = new McpServer({ name: config.SERVER_NAME, version: config.SERVER_VERSION });
	registerFitatuTools(server, applicationServices);
	return server;
}
