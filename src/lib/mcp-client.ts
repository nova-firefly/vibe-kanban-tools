import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "fs";

// ─── Logger ──────────────────────────────────────────────────────────────────
// Writes to stderr (visible in `docker compose logs`) and optionally to a file
// set via MCP_LOG_FILE env var (e.g. /tmp/mcp-client.log).

const LOG_FILE = process.env.MCP_LOG_FILE ?? null;

function log(level: "INFO" | "WARN" | "ERROR", msg: string, extra?: unknown) {
  const ts = new Date().toISOString();
  const line =
    extra !== undefined
      ? `[mcp-client] ${ts} ${level} ${msg} ${JSON.stringify(extra)}`
      : `[mcp-client] ${ts} ${level} ${msg}`;

  process.stderr.write(line + "\n");

  if (LOG_FILE) {
    try {
      fs.appendFileSync(LOG_FILE, line + "\n");
    } catch {
      // Non-fatal — don't let logging break the app
    }
  }
}

// ─── Singleton state ─────────────────────────────────────────────────────────

let mcpClient: Client | null = null;
let connecting: Promise<Client> | null = null;
let reconnectCount = 0;

// ─── Client factory ───────────────────────────────────────────────────────────

async function createClient(): Promise<Client> {
  const mcpBinary =
    process.env.VIBE_KANBAN_MCP_BINARY ?? "/usr/local/bin/vibe-kanban-mcp";
  const host = process.env.VIBE_KANBAN_HOST ?? "localhost";
  const port = process.env.VIBE_KANBAN_PORT ?? "4000";

  log("INFO", `Spawning MCP binary`, {
    binary: mcpBinary,
    host,
    vibeKanbanPort: port,
    nextjsPort: process.env.PORT ?? "(not set)",
    attempt: reconnectCount + 1,
    binaryExists: (() => {
      try {
        return fs.existsSync(mcpBinary);
      } catch {
        return "check-failed";
      }
    })(),
  });

  const childEnv: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([, v]) => v !== undefined) as [
        string,
        string,
      ][]
    ),
    HOST: host,
    VIBE_KANBAN_PORT: port,
  };

  // The MCP binary uses HOST + PORT (not VIBE_KANBAN_PORT) to connect.
  // Next.js sets PORT=3000 in its own env; override it with the vibe-kanban
  // port so the binary reaches the right service instead of looping back to
  // the Next.js server. Without PORT set the binary falls back to reading
  // /tmp/vibe-kanban/vibe-kanban.port which doesn't exist in this container.
  childEnv.PORT = port;

  const transport = new StdioClientTransport({
    command: mcpBinary,
    args: [],
    env: childEnv,
  });

  // Capture stderr from the MCP subprocess so binary startup errors are visible
  transport.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString().trimEnd();
    if (text) log("WARN", `[mcp-binary stderr] ${text}`);
  });

  const client = new Client({ name: "vibe-kanban-tools", version: "1.0.0" });

  transport.onclose = () => {
    reconnectCount += 1;
    log("WARN", `MCP transport closed — will reconnect on next call`, {
      reconnectCount,
    });
    mcpClient = null;
    connecting = null;
  };

  try {
    await client.connect(transport);
    log("INFO", "MCP client connected successfully");
  } catch (err) {
    log("ERROR", "Failed to connect MCP client", {
      error: err instanceof Error ? err.message : String(err),
      binary: mcpBinary,
      host,
      port,
    });
    throw err;
  }

  return client;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getMcpClient(): Promise<Client> {
  if (mcpClient) return mcpClient;
  if (connecting) return connecting;

  connecting = createClient().then((c) => {
    mcpClient = c;
    connecting = null;
    return c;
  });

  return connecting;
}

export async function callTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  log("INFO", `callTool: ${name}`, args);

  let client: Client;
  try {
    client = await getMcpClient();
  } catch (err) {
    log("ERROR", `getMcpClient failed for tool "${name}"`, {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  const start = Date.now();
  try {
    const result = await client.callTool({ name, arguments: args }) as {
      isError?: boolean;
      content?: Array<{ type: string; text?: string }>;
    };

    const ms = Date.now() - start;

    if (result?.isError) {
      const errText = result.content?.find((c) => c.type === "text")?.text ?? "(no error text)";
      log("ERROR", `callTool: ${name} returned is_error=true`, { ms, body: errText });
      throw new Error(`MCP tool "${name}" returned an error: ${errText}`);
    }

    log("INFO", `callTool: ${name} completed`, { ms });
    return result;
  } catch (err) {
    log("ERROR", `callTool: ${name} failed`, {
      ms: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
