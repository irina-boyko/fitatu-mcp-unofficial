# Cloudflare Worker deployment (personal fork)

This fork adds a Cloudflare Workers entry point (`src/worker/worker.ts`) so Claude on iPhone can reach the
server as a custom connector. The Fitatu code is unchanged; the worker adds:

- **Bearer-token protection** on `/mcp` (`MCP_AUTH_TOKEN`, at least 32 characters). Without it every request is refused.
- **Stateless Streamable HTTP** via the MCP SDK's `WebStandardStreamableHTTPServerTransport`.
- **A personal recipe and product database** in Cloudflare D1, independent of Fitatu:
  `recipes_save`, `recipes_search`, `recipes_get`, `recipes_delete`, `recipes_export` (JSON/CSV),
  `products_save`, `products_search`. Recipe totals, per-100 g and per-serving values are computed server-side.

## Deploy from the Cloudflare dashboard (no local tools)

1. Workers & Pages → Create → Import a repository → this fork. Then Settings → Build → Branch control: production branch `cloudflare-worker` (the default `main` has no Worker code). A build stuck on "Initializing" can be cancelled and restarted.
2. Build command: empty. Deploy command: `npx wrangler deploy` (default). The D1 database is created automatically on first deploy.
3. After the first deploy: Worker → Settings → Variables and Secrets → add secrets `FITATU_EMAIL`, `FITATU_PASSWORD`,
   `MCP_AUTH_TOKEN` (32+ random characters). Tables are created on the first request.

## Deploy from a terminal (free Workers plan)

```bash
npm install
npx wrangler login
npx wrangler d1 migrations apply fitatu-nutrition --remote
npx wrangler secret put FITATU_EMAIL
npx wrangler secret put FITATU_PASSWORD         # typed into the terminal prompt only
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))" | npx wrangler secret put MCP_AUTH_TOKEN
npx wrangler deploy
```

Secrets are stored encrypted by Cloudflare and never committed. Keep a copy of the token in a password manager:
Claude needs it once, when the connector is added.

## Connect Claude (once, on claude.ai in a browser)

Customize → Connectors → Add custom connector → URL `https://fitatu-mcp-unofficial.<your-subdomain>.workers.dev/mcp`,
authentication: request header `Authorization: Bearer <MCP_AUTH_TOKEN>`. The connector then appears in the iPhone app.

## Local development

`.dev.vars` (git-ignored) holds `FITATU_EMAIL`, `FITATU_PASSWORD`, `MCP_AUTH_TOKEN`; then
`npx wrangler d1 migrations apply fitatu-nutrition --local && npx wrangler dev`.
