// CentricIQ MCP server — raw Streamable HTTP + JSON-RPC, no framework, no SDK.
// Built on a verified-working base (github.com/saswatPr/MCP-app-demo) after
// the official @modelcontextprotocol/ext-apps SDK path failed to render in
// claude.ai for a custom connector (tool called, but resources/read was
// never even attempted — see the diagnosis trail in the project chat).
//
// Every quirk below is required for claude.ai specifically, even where the
// spec marks it optional or leaves it implicit:
//   1. Echo the client's initialize protocolVersion exactly.
//   2. _meta.ui.domain === sha256("<endpoint URL incl. /mcp>")[:32] + ".claudemcpcontent.com"
//      — self-computable, not a partner credential, but silently required.
//   3. Declare the tool's resourceUri BOTH nested (_meta.ui.resourceUri, spec
//      form) and flat ("ui/resourceUri", what claude.ai's client actually reads).
//   4. mimeType must be exactly "text/html;profile=mcp-app".
//   5. Respond fast to CORS preflight + a real health endpoint that returns
//      and closes immediately (a streaming/never-ending response on the
//      health check path will hang Render's health checker forever).

import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const WIDGET_HTML = readFileSync(join(__dir, "widget.html"), "utf8");

const PORT = process.env.PORT || 8787;
const AUTH_TOKEN = process.env.AUTH_TOKEN || ""; // optional bearer; empty = open
const WIDGET_URI = "ui://centriciq/answer-shell";
const UI_MIME = "text/html;profile=mcp-app";

// ---------------------------------------------------------------------
// Dummy data + router — stand-in for Snowflake:routing_tool -> Cortex
// Analyst -> domain agent. Swap routeQuestion()'s body for a real call
// when going to production; the tool/widget contract stays the same.
// ---------------------------------------------------------------------

const BRAND_GROWTH = {
  domain: "Brand Performance",
  period: "YoY",
  chart_hint: "grouped_bar",
  title: "Revenue Growth % & Margin % by Brand — YoY",
  categories: ["Aria", "Northline", "Kestrel", "Vantage", "Solace"],
  series: [
    { name: "YoY Growth %", color: "#0F2A5C", data: [18.4, 14.2, 9.8, 6.1, -3.2] },
    { name: "Margin %", color: "#2563EB", data: [32.1, 27.6, 24.9, 21.3, 19.8] },
  ],
  rows: [
    { brand: "Aria", growth_pct: 18.4, margin_pct: 32.1, revenue_m: 42.7 },
    { brand: "Northline", growth_pct: 14.2, margin_pct: 27.6, revenue_m: 35.1 },
    { brand: "Kestrel", growth_pct: 9.8, margin_pct: 24.9, revenue_m: 28.4 },
    { brand: "Vantage", growth_pct: 6.1, margin_pct: 21.3, revenue_m: 22.9 },
    { brand: "Solace", growth_pct: -3.2, margin_pct: 19.8, revenue_m: 15.6 },
  ],
  bullets: [
    "**Aria** leads YoY growth at **+18.4%**, holding the highest margin at **32.1%**.",
    "Combined revenue across all 5 brands is **$144.7M** for the period.",
    "**Solace** is the only brand in decline, down **-3.2%** YoY.",
    "Margin and growth move together — the top 2 brands by growth also lead on margin %.",
  ],
  suggestions: [
    "Which brands grew the most YoY and what's their margin %?",
    "Show revenue trend by region",
  ],
};

const REVENUE_TREND = {
  domain: "Revenue",
  period: "Last 6 Months",
  chart_hint: "line",
  title: "Revenue Trend by Region — Last 6 Months",
  categories: ["Feb", "Mar", "Apr", "May", "Jun", "Jul"],
  series: [
    { name: "North America", color: "#0F2A5C", data: [21.3, 22.1, 23.0, 24.2, 25.1, 26.4] },
    { name: "EMEA", color: "#2563EB", data: [14.8, 15.0, 14.6, 15.4, 16.0, 16.9] },
    { name: "APAC", color: "#1E3A8A", data: [9.2, 9.6, 10.1, 10.5, 11.0, 11.8] },
  ],
  rows: [
    { region: "North America", latest_m: 26.4, prior_m: 21.3, change_pct: 24.0 },
    { region: "EMEA", latest_m: 16.9, prior_m: 14.8, change_pct: 14.2 },
    { region: "APAC", latest_m: 11.8, prior_m: 9.2, change_pct: 28.3 },
  ],
  bullets: [
    "**North America** is the largest region at **$26.4M** this month, **48.6%** of total.",
    "Total revenue across all regions this month is **$54.3M**.",
    "**APAC** grew fastest over the window, up **+28.3%** since Feb.",
    "All three regions trended up every month — no region declined in the window.",
  ],
  suggestions: [
    "Top accounts by rebate leakage %",
    "Which brands grew the most YoY and what's their margin %?",
  ],
};

const REBATE_LEAKAGE = {
  domain: "Rebates",
  period: "YTD",
  chart_hint: "bar_horizontal",
  title: "Rebate Leakage % by Account — YTD",
  categories: ["Meridian Foods", "Colton Retail Group", "Harbor & Vine", "Ashgrove Supply", "Ridgeline Co-op"],
  series: [{ name: "Leakage %", color: "#0F2A5C", data: [12.8, 9.4, 7.1, 5.6, 3.9] }],
  rows: [
    { account: "Meridian Foods", leakage_pct: 12.8, rebate_owed_k: 184.2, rebate_paid_k: 160.7 },
    { account: "Colton Retail Group", leakage_pct: 9.4, rebate_owed_k: 142.0, rebate_paid_k: 128.7 },
    { account: "Harbor & Vine", leakage_pct: 7.1, rebate_owed_k: 98.5, rebate_paid_k: 91.5 },
    { account: "Ashgrove Supply", leakage_pct: 5.6, rebate_owed_k: 76.3, rebate_paid_k: 72.0 },
    { account: "Ridgeline Co-op", leakage_pct: 3.9, rebate_owed_k: 61.1, rebate_paid_k: 58.7 },
  ],
  bullets: [
    "**Meridian Foods** has the highest leakage at **12.8%**, the top account by share of unpaid rebate.",
    "Total rebate owed across these 5 accounts is **$562.1K**, of which **$511.6K** was paid.",
    "Leakage is concentrated: the top 2 accounts account for over **60%** of total dollars at risk.",
    "**Ridgeline Co-op** has the tightest leakage at just **3.9%**.",
  ],
  suggestions: [
    "Show revenue trend by region",
    "Which brands grew the most YoY and what's their margin %?",
  ],
};

function genericFallback(question) {
  return {
    domain: "Order Pipeline",
    period: "YTD",
    chart_hint: "table",
    title: `Results — "${question}"`,
    categories: ["Order ID", "Account", "Status", "Value ($K)"],
    series: [],
    rows: [
      { order_id: "ORD-10421", account: "Meridian Foods", status: "on time", value_k: 84.2 },
      { order_id: "ORD-10433", account: "Colton Retail Group", status: "at risk", value_k: 61.0 },
      { order_id: "ORD-10457", account: "Harbor & Vine", status: "high risk", value_k: 39.7 },
      { order_id: "ORD-10462", account: "Ashgrove Supply", status: "on time", value_k: 52.4 },
    ],
    bullets: [
      "This is a **dummy** general-purpose result — no subject area keyword matched confidently.",
      "**4** sample orders shown, totalling **$237.3K** in value.",
      "**1** order is flagged **high risk** and **1** is **at risk**.",
      "Try one of the suggested questions below, or mention a subject area (brand, revenue, rebate) explicitly.",
    ],
    suggestions: [
      "Which brands grew the most YoY and what's their margin %?",
      "Top accounts by rebate leakage %",
    ],
  };
}

function routeQuestion(question = "", domainHint = "") {
  const q = `${domainHint} ${question}`.toLowerCase();
  if (/\brebate|leakage\b/.test(q)) return REBATE_LEAKAGE;
  if (/\brevenue|region|trend\b/.test(q)) return REVENUE_TREND;
  if (/\bbrand|growth|margin\b/.test(q)) return BRAND_GROWTH;
  return genericFallback(question || "(empty question)");
}

// ---------------------------------------------------------------------
// claude.ai requires ui.domain == sha256("<MCP endpoint URL>")[:32] +
// ".claudemcpcontent.com". Derived from the request's Host header, so it's
// automatically correct for whatever URL this ends up deployed at.
// ---------------------------------------------------------------------
function widgetDomain(host) {
  const endpoint = `https://${host}/mcp`;
  return createHash("sha256").update(endpoint).digest("hex").slice(0, 32) + ".claudemcpcontent.com";
}

function toolsList() {
  return {
    tools: [
      {
        name: "query_tool",
        description:
          "Answers a business question about the connected data (brand growth & margin, " +
          "revenue trend by region, rebate leakage by account, etc.) and renders the " +
          "answer as an interactive CentricIQ chart + insights widget. Read-only. Returns " +
          "dummy data in this standalone demo build (no live Snowflake connection).",
        inputSchema: {
          type: "object",
          properties: {
            question: {
              type: "string",
              description: "The full business question in plain English, including filters, time period, and metric.",
            },
            domain_hint: {
              type: "string",
              description: "Optional fast-path subject-area hint (e.g. 'brand performance', 'rebates'). Omit normally.",
            },
            user_id: {
              type: "string",
              description: "Caller identifier. Defaults to 'demo'.",
            },
          },
          required: ["question"],
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
        // Declare the widget BOTH ways; claude.ai reads the flat key.
        _meta: {
          ui: { resourceUri: WIDGET_URI },
          "ui/resourceUri": WIDGET_URI,
        },
      },
    ],
  };
}

function resourcesList() {
  return { resources: [{ uri: WIDGET_URI, name: "CentricIQ answer shell", mimeType: UI_MIME }] };
}

function resourceRead(host) {
  return {
    contents: [
      {
        uri: WIDGET_URI,
        mimeType: UI_MIME,
        text: WIDGET_HTML,
        _meta: {
          ui: {
            domain: widgetDomain(host), // <-- the claude.ai render gate
            csp: { connectDomains: [], resourceDomains: [] }, // fully self-contained widget, no external loads
            prefersBorder: false,
          },
        },
      },
    ],
  };
}

function toolCall(params) {
  const args = (params && params.arguments) || {};
  const question = args.question || "";
  const domain_hint = args.domain_hint;
  const user_id = args.user_id || "demo";

  const payload = routeQuestion(question, domain_hint);
  const summaryLines = [
    payload.title,
    ...payload.bullets.map((b) => `- ${b.replace(/\*\*/g, "")}`),
    `Source: ${payload.domain} · ${payload.period} · Updated daily (demo data)`,
  ];
  const structuredContent = {
    ok: true,
    question,
    domain_hint: domain_hint ?? null,
    user_id,
    ...payload,
  };

  return {
    content: [{ type: "text", text: summaryLines.join("\n") }],
    structuredContent,
    isError: false,
  };
}

function handle(method, params, host) {
  switch (method) {
    case "initialize":
      return {
        // Echo the client's requested base-MCP protocol version.
        protocolVersion: (params && params.protocolVersion) || "2025-11-25",
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: "centriciq-mcp-app", version: "1.0.0" },
      };
    case "tools/list":
      return toolsList();
    case "resources/list":
      return resourcesList();
    case "resources/read":
      return resourceRead(host);
    case "tools/call":
      return toolCall(params);
    default:
      return null; // notifications and unknowns
  }
}

// ---------------------------------------------------------------------
// HTTP server — raw Streamable HTTP, stateless
// ---------------------------------------------------------------------

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
};

const server = createServer((req, res) => {
  const host = req.headers.host || "localhost";

  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS).end();
    return;
  }

  // OAuth discovery probe: 404 so claude.ai falls through to no-auth / bearer.
  if (req.url.startsWith("/.well-known/")) {
    res.writeHead(404, CORS).end();
    return;
  }

  // Dedicated health endpoint: returns and CLOSES immediately. Render's
  // health checker needs a complete response, not just headers — don't
  // point it at a streaming/keep-alive path.
  if (req.method === "GET" && req.url === "/healthz") {
    res.writeHead(200, { ...CORS, "Content-Type": "text/plain" }).end("ok");
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/mcp")) {
    // Some hosts open an SSE stream; keep it alive, we push nothing.
    res.writeHead(200, {
      ...CORS,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    return;
  }

  if (req.method !== "POST" || !req.url.startsWith("/mcp")) {
    res.writeHead(404).end("Not found");
    return;
  }

  if (AUTH_TOKEN) {
    const auth = req.headers.authorization || "";
    if (auth !== `Bearer ${AUTH_TOKEN}`) {
      res.writeHead(401, { ...CORS, "WWW-Authenticate": "Bearer" }).end('{"error":"unauthorized"}');
      return;
    }
  }

  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    let msg;
    try {
      msg = JSON.parse(body);
    } catch {
      res.writeHead(400, CORS).end();
      return;
    }

    const sessionId = req.headers["mcp-session-id"] || randomUUID();
    const isNotification = msg.id === undefined || msg.id === null;
    const result = handle(msg.method, msg.params, host);
    console.log(
      `[mcp] ${msg.method}  pv=${msg.params?.protocolVersion || "-"}  accept=${req.headers.accept || "-"}${result ? "" : " (202)"}`,
    );

    if (isNotification || result === null) {
      res.writeHead(202, { ...CORS, "Mcp-Session-Id": sessionId }).end();
      return;
    }
    const payload = { jsonrpc: "2.0", id: msg.id, result };
    res.writeHead(200, {
      ...CORS,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Mcp-Session-Id": sessionId,
    });
    res.end(`event: message\ndata: ${JSON.stringify(payload)}\n\n`);
  });
});

server.listen(PORT, () => {
  console.log(`CentricIQ MCP server on http://localhost:${PORT}/mcp`);
  console.log(AUTH_TOKEN ? "auth: bearer (AUTH_TOKEN set)" : "auth: none (open)");
  console.log("Health check path: /healthz");
});
