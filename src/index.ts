import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { logger } from "./logger.ts";
import { getConfig } from "./config.ts";
import { McpHttpServer } from "./McpHttpServer.ts";
import { ApplicationServices } from "./services/ApplicationServices.ts";
import { createFitatuServer } from "./createServer.ts";

const applicationServices = new ApplicationServices();

const getServer = (): McpServer => createFitatuServer(applicationServices);

async function startStdio(): Promise<void> {
	const config = getConfig();
	const server = getServer();
	const transport = new StdioServerTransport();
	await server.connect(transport);
	logger.info(
		{
			environment: config.NODE_ENV,
			serverName: config.SERVER_NAME,
			version: config.SERVER_VERSION,
		},
		"Fitatu MCP Unofficial server running on stdio",
	);

	const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
		logger.info({ signal }, "Shutting down MCP server");
		await server.close();
	};
	const requestShutdown = (signal: NodeJS.Signals): void => {
		void shutdown(signal).catch(() => {
			process.exitCode = 1;
		});
	};
	process.on("SIGTERM", () => requestShutdown("SIGTERM"));
	process.on("SIGINT", () => requestShutdown("SIGINT"));
}

async function startHttp(): Promise<void> {
	const config = getConfig();
	const httpServer = new McpHttpServer({ createServer: getServer, logger });
	const listener = httpServer.app.listen(config.PORT, config.HOST, () => {
		logger.info(
			{
				environment: config.NODE_ENV,
				serverName: config.SERVER_NAME,
				version: config.SERVER_VERSION,
			},
			`Fitatu MCP Unofficial server running on port ${config.PORT}`,
		);
	});
	let shuttingDown = false;
	const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
		if (shuttingDown) {
			return;
		}
		shuttingDown = true;
		logger.info({ signal }, "Shutting down MCP server");
		await httpServer.closeSessions();
		await new Promise<void>((resolve, reject) => {
			listener.close((error) => {
				if (error) {
					reject(error);
					return;
				}
				resolve();
			});
		});
		logger.info({ signal }, "MCP server shutdown complete");
	};
	const requestShutdown = (signal: NodeJS.Signals): void => {
		void shutdown(signal).catch((error: unknown) => {
			logger.error(
				{ signal, errorName: error instanceof Error ? error.name : "UnknownError" },
				"MCP server shutdown failed",
			);
			process.exitCode = 1;
		});
	};

	process.on("SIGTERM", () => requestShutdown("SIGTERM"));
	process.on("SIGINT", () => requestShutdown("SIGINT"));
}

async function main(): Promise<void> {
	if (getConfig().MCP_TRANSPORT === "stdio") {
		await startStdio();
		return;
	}
	await startHttp();
}

main().catch((error) => {
	logger.error(
		{
			error: error instanceof Error ? error.message : error,
		},
		"Server startup error",
	);
	process.exit(1);
});
