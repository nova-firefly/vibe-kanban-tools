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

/**
 * Parse a token-limit message like "You've hit your limit · resets 10am (America/Denver)"
 * and return the reset time as a UTC Date, or null if the message doesn't match.
 */
function parseResetMessage(text: string): Date | null {
  const m = text.match(/resets\s+(\d+)(?::(\d+))?\s*(am|pm)\s*\(([^)]+)\)/i);
  if (!m) return null;

  let hours = parseInt(m[1], 10);
  const minutes = m[2] ? parseInt(m[2], 10) : 0;
  const meridiem = m[3].toLowerCase();
  const tz = m[4];

  if (meridiem === "pm" && hours !== 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;

  // Get today's date in the target timezone (YYYY-MM-DD via en-CA locale)
  const now = new Date();
  const todayInTz = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  // Determine the UTC offset for the target timezone using longOffset
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "longOffset",
  }).formatToParts(now);
  const tzName = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  const offsetMatch = tzName.match(/GMT([+-])(\d+):(\d+)/);
  if (!offsetMatch) return null;

  const sign = offsetMatch[1] === "+" ? 1 : -1;
  const offsetMs = -sign * (parseInt(offsetMatch[2]) * 60 + parseInt(offsetMatch[3])) * 60_000;
  // offsetMs: positive means tz is west of UTC (e.g. UTC-6 → +6h to convert local→UTC)

  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  // Parse the target local time as if it were UTC, then apply the TZ offset
  const targetUTC = new Date(new Date(`${todayInTz}T${hh}:${mm}:00Z`).getTime() + offsetMs);

  // If already past, schedule for tomorrow
  if (targetUTC.getTime() <= now.getTime()) {
    return new Date(targetUTC.getTime() + 24 * 60 * 60 * 1000);
  }

  return targetUTC;
}

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

    const promptResult = await callTool("run_session_prompt", promptArgs);
    console.log(`[scheduler] Sent prompt to workspace ${msg.workspaceId}`);

    // Auto-reschedule "continue" if the response contains a token limit message
    const responseText =
      (promptResult as { content?: Array<{ type: string; text?: string }> })
        ?.content
        ?.map((c) => c.text ?? "")
        .join(" ") ?? "";
    const resetTime = parseResetMessage(responseText);
    if (resetTime) {
      const scheduledAt = new Date(resetTime.getTime() + DELAY_AFTER_RESET_MS).toISOString();
      const autoMsg: ScheduledMessage = {
        workspaceId: msg.workspaceId,
        workspaceName: msg.workspaceName,
        prompt: "continue",
        tokenResetAt: resetTime.toISOString(),
        scheduledAt,
        extendedWait: false,
        createdAt: new Date().toISOString(),
      };
      scheduleMessage(autoMsg);
      console.log(
        `[scheduler] Auto-scheduled "continue" for workspace ${msg.workspaceId} at ${scheduledAt}`
      );
    }
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
