import { NextRequest, NextResponse } from "next/server";

const VIBE_KANBAN_URL = process.env.VIBE_KANBAN_URL ?? "http://localhost:3000";
const VIBE_KANBAN_API_KEY = process.env.VIBE_KANBAN_API_KEY ?? "";
const SUBMIT_TOKEN = process.env.SUBMIT_TOKEN ?? "";

function kanbanHeaders() {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (VIBE_KANBAN_API_KEY) h["Authorization"] = `Bearer ${VIBE_KANBAN_API_KEY}`;
  return h;
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
    // 1. Create the task
    const taskRes = await fetch(`${VIBE_KANBAN_URL}/api/tasks`, {
      method: "POST",
      headers: kanbanHeaders(),
      body: JSON.stringify({ title, description }),
    });

    if (!taskRes.ok) {
      const text = await taskRes.text();
      throw new Error(`Vibe Kanban error (${taskRes.status}): ${text}`);
    }

    const task = await taskRes.json();
    const taskId = task?.id ?? task?.task?.id;

    // 2. Start a workspace for the task
    const wsRes = await fetch(`${VIBE_KANBAN_URL}/api/tasks/${taskId}/attempts`, {
      method: "POST",
      headers: kanbanHeaders(),
      body: JSON.stringify({}),
    });

    if (!wsRes.ok) {
      const text = await wsRes.text();
      throw new Error(`Workspace start error (${wsRes.status}): ${text}`);
    }

    return NextResponse.json({ taskId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
