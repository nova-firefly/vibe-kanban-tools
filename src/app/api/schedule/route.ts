import { NextRequest, NextResponse } from "next/server";
import {
  scheduleMessage,
  cancelMessage,
  listScheduled,
  DELAY_AFTER_RESET_MS,
  ScheduledMessage,
} from "@/lib/scheduler";

const SUBMIT_TOKEN = process.env.SUBMIT_TOKEN ?? "";

function isAuthorized(req: NextRequest, body?: Record<string, unknown>): boolean {
  if (!SUBMIT_TOKEN) return true;
  const urlToken = req.nextUrl.searchParams.get("token") ?? "";
  const bodyToken = (body?.token as string) ?? "";
  return urlToken === SUBMIT_TOKEN || bodyToken === SUBMIT_TOKEN;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Invalid token" }, { status: 403 });
  }
  return NextResponse.json({ scheduled: listScheduled() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!isAuthorized(req, body)) {
    return NextResponse.json({ error: "Invalid token" }, { status: 403 });
  }

  const { workspaceId, workspaceName, prompt, tokenResetAt, extendedWait } = body as Record<
    string,
    unknown
  >;

  if (!workspaceId || typeof workspaceId !== "string" || !workspaceId.trim()) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }
  if (!tokenResetAt) {
    return NextResponse.json({ error: "tokenResetAt is required" }, { status: 400 });
  }

  const resetTime = new Date(tokenResetAt as string);
  if (isNaN(resetTime.getTime())) {
    return NextResponse.json({ error: "Invalid tokenResetAt" }, { status: 400 });
  }

  const scheduledAt = new Date(resetTime.getTime() + DELAY_AFTER_RESET_MS).toISOString();

  const msg: ScheduledMessage = {
    workspaceId: workspaceId.trim(),
    workspaceName:
      typeof workspaceName === "string" && workspaceName.trim()
        ? workspaceName.trim()
        : workspaceId.trim(),
    prompt: prompt.trim(),
    tokenResetAt: resetTime.toISOString(),
    scheduledAt,
    extendedWait: !!extendedWait,
    createdAt: new Date().toISOString(),
  };

  scheduleMessage(msg);
  return NextResponse.json({ scheduled: msg });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json();
  if (!isAuthorized(req, body)) {
    return NextResponse.json({ error: "Invalid token" }, { status: 403 });
  }
  const { workspaceId } = body as Record<string, unknown>;
  if (!workspaceId || typeof workspaceId !== "string") {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }
  const cancelled = cancelMessage(workspaceId);
  return NextResponse.json({ cancelled });
}
