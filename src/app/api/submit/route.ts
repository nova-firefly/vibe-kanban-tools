import { NextRequest, NextResponse } from "next/server";
import { callTool } from "@/lib/mcp-client";

const SUBMIT_TOKEN = process.env.SUBMIT_TOKEN ?? "";

function extractText(result: unknown): string {
  const r = result as { content?: Array<{ type: string; text?: string }> };
  const item = r?.content?.find((c) => c.type === "text");
  if (!item?.text) throw new Error("No text content in MCP response");
  return item.text;
}

export async function POST(req: NextRequest) {
  const { title, description, token } = await req.json();

  if (SUBMIT_TOKEN && token !== SUBMIT_TOKEN) {
    return NextResponse.json({ error: "Invalid token" }, { status: 403 });
  }

  if (!title?.trim()) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  try {
    const issueArgs: Record<string, unknown> = { title: title.trim() };
    if (description?.trim()) issueArgs.description = description.trim();
    if (process.env.VIBE_KANBAN_PROJECT_ID)
      issueArgs.project_id = process.env.VIBE_KANBAN_PROJECT_ID;

    const issueResult = await callTool("create_issue", issueArgs);
    const issueText = extractText(issueResult);
    const issue = JSON.parse(issueText);
    const issueId: string = issue?.id ?? issue?.issue?.id;

    return NextResponse.json({ issueId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
