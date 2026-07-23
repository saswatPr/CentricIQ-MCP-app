# CentricIQ MCP App (standalone demo)

A self-contained **[MCP Apps](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/)**
server that showcases the CentricIQ experience — branded chart, bulleted
insights, and tappable "suggested next questions" — rendered **inline inside
the chat**, not as a Claude Artifact.

This is a **standalone demo**: `query_tool` returns hand-authored dummy data
instead of calling Snowflake's `routing_tool` / Cortex Analyst. Swap the body
of `routeQuestion()` in `data/dummy-data.js` for a real call when you're ready
to go from demo → production — the tool contract and the View don't change.

## How it maps to the real CentricIQ project

| Real CentricIQ | This demo |
|---|---|
| `Snowflake:routing_tool` → Cortex Analyst → domain agent | `routeQuestion()` — keyword match over 3 canned subject areas + a generic fallback |
| `query_tool(question, domain_hint?, user_id)` | Same signature, same contract |
| Claude renders the branded `<answer_shell>` HTML as an **artifact** | An MCP host renders the CentricIQ View as an **MCP App**, inside a sandboxed iframe, driven live by tool results |
| Suggested-question chips call `sendPrompt(...)` to re-prompt Claude | Chips call `app.callServerTool()` to re-query directly, then `app.updateModelContext()` to keep the model in sync |

## What's an MCP App?

MCP Apps is the first official MCP extension: a tool declares
`_meta.ui.resourceUri` pointing at a `ui://` resource containing bundled
HTML/JS. A compatible host (Claude, ChatGPT, VS Code, Goose, ...) fetches that
resource, renders it in a sandboxed iframe, and wires up bidirectional
JSON-RPC over `postMessage` — the tool result streams straight into the UI,
and the UI can call more tools or nudge the conversation forward.

## Project layout

```
centriciq-mcp-app/
├── main.js                    # entry point (Streamable HTTP + stdio transports)
├── server.js                  # registers query_tool + its ui:// resource (2-part registration)
├── data/
│   └── dummy-data.js          # dummy dataset + keyword router (stand-in for routing_tool)
├── views/
│   └── centriciq-view.html    # the View: branded shell, dependency-free SVG charts, chips
├── package.json
└── README.md
```

No build step is required — the View imports the `@modelcontextprotocol/ext-apps`
browser SDK straight from `esm.sh` inside a `<script type="module">` tag, so
`views/centriciq-view.html` is already the "bundled" artifact the resource serves.

## 1. Run it locally

```bash
npm install
npm start
```

You should see:

```
CentricIQ MCP App listening on http://localhost:3001/mcp
```

Quick sanity check:

```bash
curl -s http://localhost:3001/                       # health check
curl -s -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"query_tool",
                 "arguments":{"question":"Top accounts by rebate leakage %"}}}'
```

### Try the View in the reference test host

The MCP Apps team ships a minimal browser-based host for exactly this:

```bash
git clone https://github.com/modelcontextprotocol/ext-apps.git
cd ext-apps && npm install
cd examples/basic-host && npm start
```

Open `http://localhost:8080`, point it at `http://localhost:3001/mcp`, pick
`query_tool` from the dropdown, fill in a `question`, and **Call Tool** — the
CentricIQ chart + insights + chips render in the sandboxed panel below.

### Try it over stdio (Claude Desktop, VS Code, etc.)

```json
{
  "mcpServers": {
    "centriciq": {
      "command": "node",
      "args": ["/absolute/path/to/centriciq-mcp-app/main.js", "--stdio"]
    }
  }
}
```

## 2. Deploy it publicly

Any host that runs a long-lived Node process works. Two easy options:

**Render / Railway / Fly.io (Node web service)**
1. Push this folder to a Git repo.
2. Create a new Web Service pointing at that repo.
3. Build command: `npm install` · Start command: `npm start`.
4. Set the `PORT` env var if your platform requires it (most inject it automatically —
   `main.js` already reads `process.env.PORT`).
5. Your public MCP endpoint is `https://<your-app>.onrender.com/mcp` (or the
   equivalent for your platform).

**Plain VM / container**
```bash
npm install --omit=dev
PORT=3001 node main.js
```
Put it behind your usual reverse proxy / TLS termination (nginx, Caddy, the
platform's load balancer, etc). CORS is already open (`app.use(cors())`) so
browser-based hosts can reach it directly.

There's nothing to configure for Snowflake/Cortex in this build — it's fully
standalone, read-only, and has no external data dependency.

## 3. Connect it to a host

**Claude.ai / Claude Desktop** — add a custom connector pointing at your public
`/mcp` URL (Settings → Connectors → Add custom connector). Once connected, ask
something like *"Which brands grew the most YoY and what's their margin %?"*
and CentricIQ calls `query_tool` and renders the View inline.

**ChatGPT / VS Code / Goose** — any MCP Apps-compatible host: add the same
`/mcp` URL as an MCP server and call `query_tool` the same way.

## 4. Extending beyond dummy data

To go from demo to production:

1. Replace `routeQuestion()` in `data/dummy-data.js` with a real call — e.g. an
   MCP client call into your `Snowflake:*_agent` tools, or a direct Cortex
   Analyst request.
2. Keep the returned shape the same:
   `{ domain, period, chart_hint, title, categories, series, rows, bullets, suggestions }`
   so the View doesn't need to change.
3. If you want the routing itself to be smarter than keyword matching, that's
   exactly what `domain_hint` is for — pass it through untouched from the
   caller, as this demo already does.

## Brand reference (used verbatim in the View)

- Navy `#0F2A5C` (header/identity) · Primary Blue `#2563EB` (CTA/accents)
- Dark Blue `#1E3A8A` · Ice Blue `#EEF3FF` (badges/chips) · Slate `#1F2937` (body text)
- Gray `#64748B` (secondary text) · Border Gray `#E2E8F0`
- Status colors (never brand-recolored): on time `#16A34A` · at risk `#D97706` · high risk `#DC2626`
