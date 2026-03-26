import { NextRequest, NextResponse } from "next/server";
import { callTool } from "@/lib/mcp-client";

const SUBMIT_TOKEN = process.env.SUBMIT_TOKEN ?? "";

function extractText(result: unknown): string {
  const r = result as { content?: Array<{ type: string; text?: string }> };
  const item = r?.content?.find((c) => c.type === "text");
  if (!item?.text) throw new Error("No text content in MCP response");
  return item.text;
}

export async function GET(req: NextRequest) {
  if (SUBMIT_TOKEN && req.nextUrl.searchParams.get("token") !== SUBMIT_TOKEN) {
    return NextResponse.json({ error: "Invalid token" }, { status: 403 });
  }

  try {
    const result = await callTool("list_workspaces", {});
    const text = extractText(result);
    const parsed = JSON.parse(text);

    // Normalise to array — vibe-kanban may return { workspaces: [...] } or [...] directly
    const workspaces: Array<{ id: string; name?: string; status?: string }> =
      Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.workspaces)
          ? parsed.workspaces
          : [];

    return NextResponse.json({ workspaces });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
