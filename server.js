import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { routeQuestion, listSubjectAreas } from "./data/dummy-data.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIEWS_DIR = path.join(__dirname, "views");

// The ui:// URI is the link between the tool and its View (2-part registration).
const CENTRICIQ_RESOURCE_URI = "ui://centriciq/answer-shell.html";

/**
 * Creates a fresh MCP server instance (stateless per-request, per the
 * Streamable HTTP pattern recommended by the MCP Apps quickstart).
 */
export function createServer() {
  const server = new McpServer({
    name: "CentricIQ MCP App",
    version: "1.0.0",
  });

  // ---- Resource: the bundled View (HTML + inline JS) ---------------------
  // Served once, rendered by the host inside a sandboxed iframe, and driven
  // by tool results pushed over postMessage (App.ontoolresult).
  registerAppResource(
    server,
    "centriciq-answer-shell",
    CENTRICIQ_RESOURCE_URI,
    { mimeType: RESOURCE_MIME_TYPE },
    async () => {
      // DIAGNOSTIC: if this line never appears in your logs after a tool
      // call, the host never asked for the View — the gap is entirely on
      // the host's decision to render, not your server.
      console.log(`[MCP] resources/read -> ${CENTRICIQ_RESOURCE_URI}`);
      const html = await fs.readFile(
        path.join(VIEWS_DIR, "centriciq-view.html"),
        "utf-8",
      );
      return {
        contents: [
          { uri: CENTRICIQ_RESOURCE_URI, mimeType: RESOURCE_MIME_TYPE, text: html },
        ],
      };
    },
  );

  // ---- Tool: query_tool ---------------------------------------------------
  // Mirrors the CentricIQ contract: question (required), domain_hint
  // (optional fast-path), user_id (defaults to "demo"). Read-only, always
  // returns dummy data — no Snowflake / Cortex Analyst call is made.
  registerAppTool(
    server,
    "query_tool",
    {
      title: "Ask CentricIQ",
      description:
        "Answers a business question about the connected data (brand growth & margin, " +
        "revenue trend by region, rebate leakage by account, etc.) and renders the " +
        "answer as an interactive CentricIQ chart + insights UI. Read-only. Returns " +
        "dummy data in this standalone demo build (no live Snowflake connection).",
      inputSchema: {
        question: z
          .string()
          .describe(
            "The full business question in plain English, including filters, time period, and metric.",
          ),
        domain_hint: z
          .string()
          .optional()
          .describe(
            "Optional fast-path subject-area hint (e.g. 'brand performance', 'rebates'). Omit normally.",
          ),
        user_id: z
          .string()
          .optional()
          .default("demo")
          .describe("Caller identifier. Defaults to 'demo'."),
      },
      _meta: { ui: { resourceUri: CENTRICIQ_RESOURCE_URI } },
    },
    async ({ question, domain_hint, user_id }) => {
      const payload = routeQuestion(question, domain_hint);

      const summaryLines = [
        `${payload.title}`,
        ...payload.bullets.map((b) => `- ${b.replace(/\*\*/g, "")}`),
        `Source: ${payload.domain} · ${payload.period} · Updated daily (demo data)`,
      ];

      return {
        // Plain-text fallback for hosts that don't render the View, and for
        // the model's own reasoning/citation of the result.
        content: [{ type: "text", text: summaryLines.join("\n") }],
        // Structured payload the View actually renders.
        structuredContent: {
          ok: true,
          question,
          domain_hint: domain_hint ?? null,
          user_id: user_id ?? "demo",
          ...payload,
        },
      };
    },
  );

  // ---- Small read-only resource: subject areas (no UI) --------------------
  server.resource(
    "centriciq-subject-areas",
    "fluxiq://subject-areas",
    { mimeType: "text/plain" },
    async () => ({
      contents: [
        {
          uri: "fluxiq://subject-areas",
          mimeType: "text/plain",
          text: listSubjectAreas().join("\n"),
        },
      ],
    }),
  );

  return server;
}
