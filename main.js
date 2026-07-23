import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import cors from "cors";
import { createServer } from "./server.js";

/**
 * Starts the MCP server over Streamable HTTP, stateless (a fresh McpServer +
 * transport per request) — the standard pattern for a public, horizontally
 * scalable MCP Apps deployment.
 */
async function startHttpServer() {
  const port = parseInt(process.env.PORT ?? "3001", 10);

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  // Basic health check for hosting platforms (Render/Railway/Fly all probe this).
  app.get("/", (_req, res) => {
    res.status(200).json({
      name: "CentricIQ MCP App",
      status: "ok",
      mcp_endpoint: "/mcp",
      note: "Standalone demo server — dummy data only, no Snowflake connection.",
    });
  });

  app.all("/mcp", async (req, res) => {
    // Stateless mode: a new server + transport per request avoids shared
    // session state between callers, which is what you want for a public demo.
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on("close", () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("MCP error:", err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  const httpServer = app.listen(port, () => {
    console.log(`CentricIQ MCP App listening on http://localhost:${port}/mcp`);
  });

  const shutdown = () => {
    console.log("\nShutting down...");
    httpServer.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

/** Starts the MCP server over stdio — for local MCP clients (Claude Desktop, etc). */
async function startStdioServer() {
  const server = createServer();
  await server.connect(new StdioServerTransport());
}

async function main() {
  if (process.argv.includes("--stdio")) {
    await startStdioServer();
  } else {
    await startHttpServer();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
