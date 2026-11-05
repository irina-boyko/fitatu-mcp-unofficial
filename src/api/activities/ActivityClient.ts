import { ObjectUtils } from "../../shared/ObjectUtils.ts";
import { FitatuAuthClient } from "../auth/FitatuAuthClient.ts";
import { createPlanDayDietItemId } from "../dayPlan/DayPlanItemIdFactory.ts";
import { FitatuApiClientBase } from "../fitatuApiClientBase/FitatuApiClientBase.ts";
import type { FitatuApiClientBaseOptions } from "../fitatuApiClientBase/FitatuApiClientBaseOptions.ts";
import { FitatuClientError } from "../fitatuApiClientBase/FitatuClientError.ts";
import { FITATU_CLIENT_OPERATIONS } from "../fitatuApiClientBase/FitatuClientOperations.ts";
import { FitatuResponseDecodeError } from "../fitatuApiClientBase/FitatuResponseDecodeError.ts";

/** One hit of the Fitatu training catalog (GET /search/activity/{phrase}). */
export interface ActivitySearchHit {
	readonly activityId: number;
	readonly name: string;
	readonly type: number | null;
	readonly intensity: number | null;
	readonly energy: number | null;
	readonly measuresDescription: string | null;
	readonly measures: readonly {
		readonly measureId: number;
		readonly name: string | null;
		readonly type: string | null;
	}[];
}

/** An activity logged on a day, as listed under "activityPlan" by the day GET. */
export interface DayActivity {
	readonly uuid: string;
	readonly activityId: number | null;
	readonly name: string | null;
	readonly energy: number | null;
	readonly planDayActivityType: number | null;
	readonly minutes: number | null;
	readonly simpleMeasure: { readonly measureId: number; readonly value: number } | null;
}

/** Write shape of a catalog activity in the day sync (PlannerUpdateApiActivityRequest). */
interface ActivityWriteRow {
	readonly uuid: string;
	readonly planDayActivityType: number;
	readonly activityId: number;
	readonly energy: number;
	readonly simpleMeasure: { readonly measureId: number; readonly value: number } | null;
	readonly advancedMeasures: readonly unknown[];
	readonly deletedAt: string | null;
}

const MINUTES_MEASURE_ID = 1;

/**
 * Trainings (activities) in the Fitatu planner. They travel in the same day sync as meals
 * (POST /diet-plan/{userId}/days, key "activities"); the server upserts by uuid and keeps
 * everything not sent, so a payload with only activities leaves the food rows alone.
 */
export class ActivityClient extends FitatuApiClientBase {
	private static instance: ActivityClient | undefined;
	private readonly auth: FitatuAuthClient;

	protected constructor(options: FitatuApiClientBaseOptions = {}) {
		const auth = FitatuAuthClient.getInstance();
		super({ ...options, authClient: options.authClient ?? auth });
		this.auth = auth;
	}

	public static getInstance(options: FitatuApiClientBaseOptions = {}): ActivityClient {
		ActivityClient.instance ??= new ActivityClient(options);
		return ActivityClient.instance;
	}

	public async search(phrase: string, limit = 10, locale = "pl_PL"): Promise<ActivitySearchHit[]> {
		return this.performCallout({
			operation: FITATU_CLIENT_OPERATIONS.activitiesSearch,
			method: "GET",
			path: `/search/activity/${encodeURIComponent(phrase)}`,
			endpointTemplate: "/search/activity/:phrase",
			failureMessage: "Fitatu activity search failed",
			invalidResponseMessage: "Fitatu activity search response was invalid",
			headers: { accept: "application/json" },
			query: { page: 1, limit, locale },
			decoder: (data) => {
				if (!Array.isArray(data)) {
					throw new FitatuResponseDecodeError("Activity search response was not an array");
				}
				return data.filter(ObjectUtils.isRecord).map((hit) => ({
					activityId: Number(hit.activityId),
					name: String(hit.name ?? ""),
					type: numberOrNull(hit.type),
					intensity: numberOrNull(hit.intensity),
					energy: numberOrNull(hit.energy),
					measuresDescription: typeof hit.measuresDescription === "string" ? hit.measuresDescription : null,
					measures: (Array.isArray(hit.measures) ? hit.measures : [])
						.filter(ObjectUtils.isRecord)
						.map((m) => ({
							measureId: Number(m.measureId),
							name: stringOrNull(m.name ?? m.measureName),
							type: stringOrNull(m.type ?? m.measureType),
						})),
				}));
			},
		});
	}

	public async listDay(date: string): Promise<DayActivity[]> {
		const userId = await this.userId();
		return this.performCallout({
			operation: FITATU_CLIENT_OPERATIONS.dayPlanGet,
			method: "GET",
			path: `/diet-and-activity-plan/${encodeURIComponent(userId)}/day/${date}`,
			endpointTemplate: "/diet-and-activity-plan/:userId/day/:date",
			failureMessage: "Fitatu day plan request failed",
			invalidResponseMessage: "Fitatu day plan response was invalid",
			headers: { accept: "application/json" },
			decoder: (data) => {
				if (!ObjectUtils.isRecord(data)) {
					throw new FitatuResponseDecodeError("Day plan response was not an object");
				}
				const rows = Array.isArray(data.activityPlan) ? data.activityPlan : [];
				return rows
					.filter(ObjectUtils.isRecord)
					.filter((row) => row.deletedAt === null || row.deletedAt === undefined)
					.map((row) => {
						const measures = (Array.isArray(row.simpleMeasures) ? row.simpleMeasures : []).filter(
							ObjectUtils.isRecord,
						);
						const first = measures[0];
						const simpleMeasure =
							first && first.measureId !== undefined && first.value !== undefined
								? { measureId: Number(first.measureId), value: Number(first.value) }
								: null;
						return {
							uuid: String(row.uuid),
							activityId: numberOrNull(row.activityId),
							name: stringOrNull(row.activityName),
							energy: numberOrNull(row.energy),
							planDayActivityType: numberOrNull(row.planDayActivityType),
							minutes:
								simpleMeasure && simpleMeasure.measureId === MINUTES_MEASURE_ID
									? simpleMeasure.value
									: null,
							simpleMeasure,
						};
					});
			},
		});
	}

	/** Logs a catalog activity; Fitatu stores the given energy as is and does not recompute it. */
	public async add(
		date: string,
		activityId: number,
		minutes: number,
		energyKcal: number,
		timeMeasureId = MINUTES_MEASURE_ID,
	): Promise<string> {
		const row: ActivityWriteRow = {
			uuid: createPlanDayDietItemId(),
			planDayActivityType: 1,
			activityId,
			energy: Math.round(energyKcal),
			simpleMeasure: { measureId: timeMeasureId, value: minutes },
			advancedMeasures: [],
			deletedAt: null,
		};
		await this.sync(date, row);
		return row.uuid;
	}

	/** Removes a logged activity the way the app does: re-send it with deletedAt. */
	public async remove(date: string, activity: DayActivity): Promise<void> {
		const row: ActivityWriteRow = {
			uuid: activity.uuid,
			planDayActivityType: activity.planDayActivityType ?? 1,
			activityId: activity.activityId ?? 0,
			energy: activity.energy ?? 0,
			simpleMeasure: activity.simpleMeasure,
			advancedMeasures: [],
			deletedAt: nowTimestamp(),
		};
		await this.sync(date, row);
	}

	private async sync(date: string, row: ActivityWriteRow): Promise<void> {
		const userId = encodeURIComponent(await this.userId());
		const variants: readonly [string, string][] = [
			[`/diet-plan/${userId}/days`, "/diet-plan/:userId/days"],
			[`/v2/diet-plan/${userId}/days`, "/v2/diet-plan/:userId/days"],
			[`/v3/diet-plan/${userId}/days`, "/v3/diet-plan/:userId/days"],
		];
		let lastError: unknown;
		for (const [path, endpointTemplate] of variants) {
			try {
				await this.post(path, endpointTemplate, date, row);
				return;
			} catch (error) {
				lastError = error;
				if (
					!(error instanceof FitatuClientError) ||
					error.failure.kind !== "http" ||
					error.failure.statusCode !== 404
				) {
					throw error;
				}
			}
		}
		throw lastError;
	}

	private async post(path: string, endpointTemplate: string, date: string, row: ActivityWriteRow): Promise<void> {
		await this.performCallout({
			operation: FITATU_CLIENT_OPERATIONS.activitiesSync,
			method: "POST",
			path,
			endpointTemplate,
			failureMessage: "Fitatu activity synchronization failed",
			invalidResponseMessage: "Fitatu activity synchronization response was invalid",
			headers: { "content-type": "application/json;charset=UTF-8" },
			query: { synchronous: true },
			body: JSON.stringify({ [date]: { activities: [row] } }),
			decoder: (data) => {
				if (Array.isArray(data)) {
					const failed = data.find(
						(r) => ObjectUtils.isRecord(r) && typeof r.errorMessage === "string" && r.errorMessage,
					);
					if (failed && ObjectUtils.isRecord(failed)) {
						throw new FitatuResponseDecodeError(String(failed.errorMessage));
					}
				}
				return null;
			},
		});
	}

	private async userId(): Promise<string> {
		return (await this.auth.getSession()).fitatuUserId;
	}
}

function numberOrNull(value: unknown): number | null {
	const n = typeof value === "string" ? Number(value) : value;
	return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function stringOrNull(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

function nowTimestamp(): string {
	const d = new Date();
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}
