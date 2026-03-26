import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Singleton MCP client — spawns vibe-kanban-mcp once and reuses the subprocess.
// The binary connects to vibe-kanban at http://{HOST}:{VIBE_KANBAN_PORT}.
let mcpClient: Client | null = null;
let connecting: Promise<Client> | null = null;

async function createClient(): Promise<Client> {
  const mcpBinary =
    process.env.VIBE_KANBAN_MCP_BINARY ?? "/usr/local/bin/vibe-kanban-mcp";
  const host = process.env.VIBE_KANBAN_HOST ?? "localhost";
  const port = process.env.VIBE_KANBAN_PORT ?? "4000";

  const transport = new StdioClientTransport({
    command: mcpBinary,
    args: [],
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).filter(([, v]) => v !== undefined) as [
          string,
          string,
        ][]
      ),
      HOST: host,
      VIBE_KANBAN_PORT: port,
    },
  });

  const client = new Client({ name: "vibe-kanban-tools", version: "1.0.0" });

  transport.onclose = () => {
    // Clear singleton so the next call re-spawns the subprocess
    mcpClient = null;
    connecting = null;
  };

  await client.connect(transport);
  return client;
}

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
  const client = await getMcpClient();
  const result = await client.callTool({ name, arguments: args });
  return result;
}
