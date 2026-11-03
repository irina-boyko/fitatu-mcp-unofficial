# Cloudflare Worker deployment (personal fork)

This fork adds a Cloudflare Workers entry point (`src/worker/worker.ts`) so Claude on iPhone can reach the
server as a custom connector. The Fitatu code is unchanged; the worker adds:

- **Bearer-token protection** on `/mcp` (`MCP_AUTH_TOKEN`, at least 32 characters). Without it every request is refused.
- **Stateless Streamable HTTP** via the MCP SDK's `WebStandardStreamableHTTPServerTransport`.
- **A personal recipe and product database** in Cloudflare D1, independent of Fitatu:
  `recipes_save`, `recipes_search`, `recipes_get`, `recipes_delete`, `recipes_export` (JSON/CSV),
  `products_save`, `products_search`. Recipe totals, per-100 g and per-serving values are computed server-side.

## Deploy (free Workers plan)

```bash
npm install
npx wrangler login
npx wrangler d1 create fitatu-nutrition        # copy database_id into wrangler.jsonc
npx wrangler d1 migrations apply fitatu-nutrition --remote
npx wrangler secret put FITATU_EMAIL
npx wrangler secret put FITATU_PASSWORD         # typed into the terminal prompt only
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))" | npx wrangler secret put MCP_AUTH_TOKEN
npx wrangler deploy
```

Secrets are stored encrypted by Cloudflare and never committed. Keep a copy of the token in a password manager:
Claude needs it once, when the connector is added.

## Connect Claude (once, on claude.ai in a browser)

Customize → Connectors → Add custom connector → URL `https://fitatu-mcp.<your-subdomain>.workers.dev/mcp`,
authentication: request header `Authorization: Bearer <MCP_AUTH_TOKEN>`. The connector then appears in the iPhone app.

## Local development

`.dev.vars` (git-ignored) holds `FITATU_EMAIL`, `FITATU_PASSWORD`, `MCP_AUTH_TOKEN`; then
`npx wrangler d1 migrations apply fitatu-nutrition --local && npx wrangler dev`.
