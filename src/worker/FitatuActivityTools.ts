import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ActivityClient } from "../api/activities/ActivityClient.ts";
import { FitatuClientError } from "../api/fitatuApiClientBase/FitatuClientError.ts";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function ok(value: unknown) {
	return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function describe(error: unknown, fallback: string): string {
	if (!(error instanceof Error)) {
		return fallback;
	}
	const parts = [error.message];
	if (error instanceof FitatuClientError && error.failure.kind === "http") {
		const f = error.failure;
		parts.push(`HTTP ${f.statusCode} ${f.method} ${f.endpointTemplate}`);
		if (f.upstreamMessage) parts.push(f.upstreamMessage);
		if (f.responseSnippet) parts.push(f.responseSnippet);
	}
	if (error.cause instanceof Error) {
		parts.push(error.cause.message);
	}
	return parts.join(" | ");
}

function fail(error: unknown, fallback: string) {
	return {
		isError: true,
		content: [{ type: "text" as const, text: describe(error, fallback) }],
	};
}

export function registerFitatuActivityTools(server: McpServer, client = ActivityClient.getInstance()): void {
	server.registerTool(
		"search_activities",
		{
			title: "Search Fitatu activities",
			description:
				"Searches the Fitatu training catalog (e.g. 'tenis', 'bieganie', 'siłownia'; Polish names work best). Returns activityId, name and measures; use an activity measured in minutes (measure type TIME) with add_activity.",
			inputSchema: {
				phrase: z.string().trim().min(2),
				limit: z.number().int().min(1).max(30).optional(),
			},
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async ({ phrase, limit }) => {
			try {
				return ok({ phrase, results: await client.search(phrase, limit ?? 10) });
			} catch (error) {
				return fail(error, "Fitatu activity search failed");
			}
		},
	);

	server.registerTool(
		"get_day_activities",
		{
			title: "Get Fitatu activities for a day",
			description:
				"Lists trainings logged on a day (uuid, activityId, name, energy kcal, minutes). Read it before add_activity to avoid duplicates; pass a uuid to remove_activity.",
			inputSchema: { date: isoDate },
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async ({ date }) => {
			try {
				return ok({ date, activities: await client.listDay(date) });
			} catch (error) {
				return fail(error, "Fitatu day activities request failed");
			}
		},
	);

	server.registerTool(
		"add_activity",
		{
			title: "Add Fitatu activity",
			description:
				"Logs a training on a day: a catalog activityId from search_activities with the measureId of its TIME measure (timeMeasureId), its duration in minutes and the burned energy in kcal (Fitatu stores the kcal exactly as sent). Read get_day_activities first; repeating the call adds a second entry. The day is re-read and the result says whether the activity is there.",
			inputSchema: {
				date: isoDate,
				activityId: z.number().int().positive(),
				minutes: z
					.number()
					.positive()
					.max(24 * 60),
				energyKcal: z.number().positive().max(5000),
				timeMeasureId: z
					.number()
					.int()
					.positive()
					.optional()
					.describe(
						"measureId of the activity's TIME measure from search_activities (e.g. 3 for Tenis). Defaults to 1.",
					),
			},
			annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
		},
		async ({ date, activityId, minutes, energyKcal, timeMeasureId }) => {
			try {
				const uuid = await client.add(date, activityId, minutes, energyKcal, timeMeasureId);
				const after = await client.listDay(date);
				const added = after.find((a) => a.uuid === uuid) ?? null;
				return ok({ status: added ? "confirmed" : "not_found_after_sync", date, uuid, activity: added });
			} catch (error) {
				return fail(error, "Fitatu activity add failed");
			}
		},
	);

	server.registerTool(
		"remove_activity",
		{
			title: "Remove Fitatu activity",
			description:
				"Removes a logged training by its uuid from get_day_activities (sent with deletedAt, as the app does). Ask the user first. The day is re-read to confirm.",
			inputSchema: { date: isoDate, uuid: z.string().trim().min(1) },
			annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
		},
		async ({ date, uuid }) => {
			try {
				const before = await client.listDay(date);
				const target = before.find((a) => a.uuid === uuid);
				if (!target) {
					return fail(
						new Error(
							`No activity ${uuid} on ${date}; found: ${before.map((a) => a.uuid).join(", ") || "none"}`,
						),
						"",
					);
				}
				await client.remove(date, target);
				const after = await client.listDay(date);
				return ok({ status: after.some((a) => a.uuid === uuid) ? "still_present" : "removed", date, uuid });
			} catch (error) {
				return fail(error, "Fitatu activity removal failed");
			}
		},
	);
}
