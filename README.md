# CentricIQ MCP App — v2 (raw protocol, zero dependencies)

This is a rebuild of the CentricIQ MCP Apps demo on a **verified-working base**
(github.com/saswatPr/MCP-app-demo), after the original `@modelcontextprotocol/ext-apps`
SDK version failed to render in claude.ai for a custom connector — the tool
call succeeded and returned correct data, but claude.ai never called
`resources/read` to fetch the widget, despite correct capability negotiation.

## What's different from v1

- **No npm dependencies at all.** Raw `node:http`, no Express, no MCP SDK, no
  `@modelcontextprotocol/ext-apps`. Two files: `server.mjs` and `widget.html`.
- **No `esm.sh` import in the widget.** v1's View imported the ext-apps SDK
  from a CDN at runtime — a plausible extra point of failure inside a
  sandboxed iframe with no declared `resourceDomains`. v2's widget is fully
  self-contained.
- **Every claude.ai-specific quirk implemented explicitly**, based on a
  working reference implementation and confirmed against the official spec
  docs where possible:

  1. **Echo the client's `protocolVersion`** in the `initialize` response —
     claude.ai speaks `2025-11-25`; hardcoding a different value fails the
     connection outright.
  2. **`_meta.ui.domain`** on the `resources/read` response:
     `sha256("<endpoint URL incl. /mcp>")[:32] + ".claudemcpcontent.com"`,
     computed dynamically from the request's `Host` header. Spec-optional,
     but claude.ai silently withholds the iframe without it.
  3. **Declare the tool's resource link twice** — both the spec-correct
     `_meta.ui.resourceUri` and a flat `"ui/resourceUri"` key, since
     claude.ai's current client reads the flat one.
  4. **`mimeType: "text/html;profile=mcp-app"`** exactly, on both
     `resources/list` and `resources/read`.
  5. **Send `ui/notifications/initialized` unconditionally** from the widget
     — on any result-bearing reply to `ui/initialize`, plus a timeout
     fallback — since claude.ai keeps the iframe reserved-but-hidden until
     it receives this notification.
  6. **`ui/notifications/size-changed` params are always numbers**, never
     `null`/missing.
  7. **A dedicated `/healthz` endpoint** that returns and closes immediately
     — don't point a hosting platform's health check at a streaming/SSE path,
     it'll hang forever waiting for a response that never completes.

## Files

```
centriciq-mcp-app-v2/
├── server.mjs      # the whole server: routing, dummy data, MCP protocol handling
├── widget.html     # the whole widget: handshake, branded chart/insights UI
├── package.json    # zero dependencies
└── README.md
```

## Run it locally

```bash
npm start                          # http://localhost:8787/mcp
# optional bearer auth:
AUTH_TOKEN=secret npm start
```

Quick check:
```bash
curl http://localhost:8787/healthz          # -> ok
curl -X POST http://localhost:8787/mcp -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"query_tool","arguments":{"question":"brand growth"}}}'
```

## Deploy on Render (free tier)

| Field | Value |
|---|---|
| Language | `Node` |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Instance Type | `Free` |
| **Health Check Path** | **`/healthz`** — do not leave this as `/` or `/mcp` |

No env vars required. `AUTH_TOKEN` is optional — leave unset for an open demo
(claude.ai's "URL only" custom connector flow has no field for a bearer token
anyway, so setting one would break real tool calls even if the health check
passes).

## Connect it in claude.ai

Settings → Connectors → Add custom connector → paste your deployed URL with
the `/mcp` path, e.g.:
```
https://your-app.onrender.com/mcp
```
On Enterprise, an Owner must add it first via Organization Settings →
Connectors → Add → Custom → Web; members then connect individually.

Ask something like *"Which brands grew the most YoY and what's their margin %?"*
— the CentricIQ chart + insights widget should render inline.

## Known limitation: suggestion chips

The chart, bullets, provenance line, and initial render are all built on the
same handshake pattern proven to work end-to-end. The **suggestion chips**
(tapping one to re-query) additionally send a `tools/call` request *from the
widget back through the host*, via `callServerTool`-equivalent raw
`postMessage` — this specific path is less battle-tested than the base
handshake, since the verified reference implementation this project is built
on didn't include interactive re-querying. If a chip click doesn't visibly
refresh the chart, that's the first place to look; it does not affect the
initial chart rendering on the first question.

## Extending beyond dummy data

Replace `routeQuestion()` in `server.mjs` with a real call (e.g. into your
`Snowflake:*_agent` tools via an MCP client, or directly to Cortex Analyst).
Keep the returned shape the same — `{ domain, period, chart_hint, title,
categories, series, rows, bullets, suggestions }` — so `widget.html` doesn't
need to change.
