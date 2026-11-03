/**
 * Minimal pino replacement for Cloudflare Workers. Writes structured lines to console,
 * which Workers forwards to its log stream. Only the API used by src/logger.ts is provided.
 */
type Bindings = Record<string, unknown>;
const LEVELS = ["debug", "info", "warn", "error"] as const;
type Level = (typeof LEVELS)[number];

interface ShimLogger {
	level: string;
	debug(bindings: Bindings | string, message?: string): void;
	info(bindings: Bindings | string, message?: string): void;
	warn(bindings: Bindings | string, message?: string): void;
	error(bindings: Bindings | string, message?: string): void;
}

function pino(options: { level?: string; base?: Bindings } = {}): ShimLogger {
	const threshold =
		options.level === "silent" ? Infinity : Math.max(0, LEVELS.indexOf((options.level ?? "info") as Level));
	const write = (level: Level) => (bindings: Bindings | string, message?: string) => {
		if (LEVELS.indexOf(level) < threshold) {
			return;
		}
		const entry = typeof bindings === "string" ? { msg: bindings } : { ...bindings, msg: message };
		console[level === "debug" ? "log" : level](JSON.stringify({ level, ...options.base, ...entry }));
	};
	return {
		level: options.level ?? "info",
		debug: write("debug"),
		info: write("info"),
		warn: write("warn"),
		error: write("error"),
	};
}

pino.destination = (_fd: number): undefined => undefined;

export default pino;
