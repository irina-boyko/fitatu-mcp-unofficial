/** The subset of the Cloudflare D1 API this project uses (kept local to avoid clashing global types). */
export interface D1Result<T> {
	readonly results: T[];
}
export interface D1PreparedStatement {
	bind(...values: unknown[]): D1PreparedStatement;
	first<T = Record<string, unknown>>(): Promise<T | null>;
	all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
	run(): Promise<unknown>;
}
export interface D1Database {
	prepare(query: string): D1PreparedStatement;
}
