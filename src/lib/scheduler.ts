import { callTool } from "./mcp-client";
import fs from "fs";

const SCHEDULE_FILE = process.env.SCHEDULE_FILE ?? "/tmp/vk-scheduled.json";

/** Added to prompt when extendedWait is true */
const EXTENDED_WAIT_PREFIX =
  "Note: There will be an extended period before this response is reviewed. " +
  "Take your time — think through the problem step by step, consider multiple approaches, " +
  "challenge your initial assumptions, and refine your answer before responding.\n\n";

/** Milliseconds after token reset to send the prompt */
export const DELAY_AFTER_RESET_MS = 5 * 60 * 1000;

export interface ScheduledMessage {
  workspaceId: string;
  workspaceName: string;
  prompt: string;
  tokenResetAt: string; // ISO
  scheduledAt: string;  // ISO (tokenResetAt + 5 min)
  extendedWait: boolean;
  createdAt: string;    // ISO
}

type Entry = { message: ScheduledMessage; timer: ReturnType<typeof setTimeout> };

const store = new Map<string, Entry>();

async function execute(msg: ScheduledMessage) {
  store.delete(msg.workspaceId);
  persist();

  const finalPrompt = msg.extendedWait
    ? EXTENDED_WAIT_PREFIX + msg.prompt
    : msg.prompt;

  try {
    // Try to find the active session for this workspace so we can send the prompt
    let sessionId: string | null = null;
    try {
      const sessionsResult = await callTool("list_sessions", {
        workspace_id: msg.workspaceId,
      });
      const r = sessionsResult as { content?: Array<{ type: string; text?: string }> };
      const text = r?.content?.find((c) => c.type === "text")?.text;
      if (text) {
        const sessions = JSON.parse(text);
        const arr: Array<{ id: string; status?: string }> = Array.isArray(sessions)
          ? sessions
          : sessions?.sessions ?? [];
        // Prefer running sessions, otherwise take the last one
        const running = arr.find((s) => s.status === "running" || s.status === "active");
        sessionId = (running ?? arr[arr.length - 1])?.id ?? null;
      }
    } catch {
      // list_sessions failed — fall through to workspace_id approach
    }

    const promptArgs: Record<string, unknown> = { prompt: finalPrompt };
    if (sessionId) {
      promptArgs.session_id = sessionId;
    } else {
      promptArgs.workspace_id = msg.workspaceId;
    }

    await callTool("run_session_prompt", promptArgs);
    console.log(`[scheduler] Sent prompt to workspace ${msg.workspaceId}`);
  } catch (err) {
    console.error(
      `[scheduler] Failed to send prompt to workspace ${msg.workspaceId}:`,
      err instanceof Error ? err.message : err
    );
  }
}

function persist() {
  try {
    const data = [...store.values()].map((e) => e.message);
    fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(data, null, 2));
  } catch {
    // Non-fatal — schedule still works in memory
  }
}

export function scheduleMessage(msg: ScheduledMessage): void {
  cancelMessage(msg.workspaceId);
  const delay = Math.max(0, new Date(msg.scheduledAt).getTime() - Date.now());
  const timer = setTimeout(() => execute(msg), delay);
  store.set(msg.workspaceId, { message: msg, timer });
  persist();
}

export function cancelMessage(workspaceId: string): boolean {
  const entry = store.get(workspaceId);
  if (!entry) return false;
  clearTimeout(entry.timer);
  store.delete(workspaceId);
  persist();
  return true;
}

export function listScheduled(): ScheduledMessage[] {
  return [...store.values()].map((e) => e.message);
}

// On module load: restore any previously scheduled messages from disk
(function restore() {
  if (!fs.existsSync(SCHEDULE_FILE)) return;
  try {
    const data = JSON.parse(
      fs.readFileSync(SCHEDULE_FILE, "utf-8")
    ) as ScheduledMessage[];
    for (const msg of data) {
      if (new Date(msg.scheduledAt).getTime() > Date.now()) {
        scheduleMessage(msg);
        console.log(
          `[scheduler] Restored schedule for workspace ${msg.workspaceId} at ${msg.scheduledAt}`
        );
      }
    }
  } catch {
    // Corrupt or missing file — start fresh
  }
})();
