"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";

interface Workspace {
  id: string;
  name?: string;
  status?: string;
}

interface ScheduledMessage {
  workspaceId: string;
  workspaceName: string;
  prompt: string;
  tokenResetAt: string;
  scheduledAt: string;
  extendedWait: boolean;
  createdAt: string;
}

function ScheduleForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [scheduled, setScheduled] = useState<ScheduledMessage[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [tokenResetAt, setTokenResetAt] = useState("");
  const [prompt, setPrompt] = useState("");
  const [extendedWait, setExtendedWait] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : "";
  const backHref = token ? `/?token=${encodeURIComponent(token)}` : "/";

  const loadData = useCallback(async () => {
    const [wsRes, schedRes] = await Promise.all([
      fetch(`/api/workspaces${tokenQuery}`).catch(() => null),
      fetch(`/api/schedule${tokenQuery}`).catch(() => null),
    ]);
    if (wsRes?.ok) {
      const d = await wsRes.json();
      setWorkspaces(d.workspaces ?? []);
    }
    if (schedRes?.ok) {
      const d = await schedRes.json();
      setScheduled(d.scheduled ?? []);
    }
  }, [tokenQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Pre-fill workspace selector if a scheduled message exists for this workspace
  useEffect(() => {
    if (workspaceId && scheduled.some((s) => s.workspaceId === workspaceId)) {
      // Already scheduled — user can see it in the list
    }
  }, [scheduled, workspaceId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);

    try {
      const ws = workspaces.find((w) => w.id === workspaceId);
      const res = await fetch(`/api/schedule${tokenQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          workspaceName: ws?.name,
          prompt,
          tokenResetAt: new Date(tokenResetAt).toISOString(),
          extendedWait,
          token,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ type: "error", message: data.error ?? "Failed to schedule." });
      } else {
        const sendTime = formatTime(data.scheduled.scheduledAt);
        setStatus({ type: "success", message: `Scheduled — will send at ${sendTime}` });
        setPrompt("");
        setExtendedWait(false);
        setTokenResetAt("");
        await loadData();
      }
    } catch {
      setStatus({ type: "error", message: "Network error — could not reach server." });
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel(wsId: string) {
    await fetch(`/api/schedule${tokenQuery}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: wsId, token }),
    });
    await loadData();
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const existingSchedule = scheduled.find((s) => s.workspaceId === workspaceId);

  return (
    <div style={{ width: "100%", maxWidth: 520 }}>
      {/* Back nav */}
      <div style={styles.nav}>
        <Link href={backHref} style={styles.navLink}>
          ← All tools
        </Link>
        <span style={styles.navActive}>Schedule prompt</span>
      </div>

      {/* Existing schedules */}
      {scheduled.length > 0 && (
        <div style={{ ...styles.card, marginBottom: "1rem" }}>
          <h2 style={styles.sectionHeading}>Scheduled</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {scheduled.map((s) => (
              <div key={s.workspaceId} style={styles.scheduledItem}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={styles.scheduledName}>{s.workspaceName}</div>
                  <div style={styles.scheduledMeta}>
                    Sends {formatTime(s.scheduledAt)}
                    {s.extendedWait && (
                      <span style={styles.extendedBadge}>extended wait</span>
                    )}
                  </div>
                  <div style={styles.scheduledPrompt}>
                    {s.prompt.length > 100
                      ? s.prompt.slice(0, 100) + "…"
                      : s.prompt}
                  </div>
                </div>
                <button
                  onClick={() => handleCancel(s.workspaceId)}
                  style={styles.cancelButton}
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Schedule form */}
      <div style={styles.card}>
        <h1 style={styles.heading}>Schedule Prompt</h1>
        <p style={styles.subtext}>
          Sends 5 minutes after token reset. One schedule per workspace — scheduling
          again replaces the existing one.
        </p>

        {status && (
          <div
            style={
              status.type === "success" ? styles.bannerSuccess : styles.bannerError
            }
          >
            {status.message}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Workspace */}
          <div style={styles.field}>
            <label style={styles.label}>Workspace</label>
            {workspaces.length > 0 ? (
              <select
                required
                value={workspaceId}
                onChange={(e) => setWorkspaceId(e.target.value)}
                style={styles.select}
              >
                <option value="">Select a workspace…</option>
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name ? `${w.name} (${w.status ?? "unknown"})` : w.id}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                placeholder="Workspace ID"
                required
                value={workspaceId}
                onChange={(e) => setWorkspaceId(e.target.value)}
                style={styles.input}
              />
            )}
            {existingSchedule && (
              <div style={styles.hint}>
                Already scheduled for {formatTime(existingSchedule.scheduledAt)} — submitting
                will replace it.
              </div>
            )}
          </div>

          {/* Token reset time */}
          <div style={styles.field}>
            <label style={styles.label}>Token resets at</label>
            <input
              type="datetime-local"
              required
              value={tokenResetAt}
              onChange={(e) => setTokenResetAt(e.target.value)}
              style={styles.input}
            />
            <div style={styles.hint}>Prompt will be sent 5 minutes after this time</div>
          </div>

          {/* Prompt */}
          <div style={styles.field}>
            <label style={styles.label}>Prompt</label>
            <textarea
              required
              placeholder="What should be sent to the workspace?"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              style={styles.textarea}
            />
          </div>

          {/* Extended wait checkbox */}
          <div style={styles.checkboxRow}>
            <input
              id="extendedWait"
              type="checkbox"
              checked={extendedWait}
              onChange={(e) => setExtendedWait(e.target.checked)}
              style={styles.checkbox}
            />
            <label htmlFor="extendedWait" style={styles.checkboxLabel}>
              Extended wait
            </label>
          </div>
          {extendedWait && (
            <div style={styles.extendedWaitNote}>
              Will prepend context telling the model it has extra time — it should think
              carefully, consider alternatives, and refine before responding.
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{ ...styles.button, marginTop: extendedWait ? "1rem" : "1.25rem" }}
          >
            {loading ? "Scheduling…" : "Schedule"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function SchedulePage() {
  return (
    <Suspense>
      <ScheduleForm />
    </Suspense>
  );
}

const styles = {
  nav: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    marginBottom: "1rem",
    fontSize: "0.85rem",
  } as React.CSSProperties,
  navLink: {
    color: "#7c3aed",
    textDecoration: "none",
  } as React.CSSProperties,
  navActive: {
    color: "#94a3b8",
  } as React.CSSProperties,
  card: {
    background: "#1a1d27",
    border: "1px solid #2d3148",
    borderRadius: 12,
    padding: "2rem 1.75rem",
    width: "100%",
  } as React.CSSProperties,
  heading: {
    fontSize: "1.25rem",
    fontWeight: 600,
    marginBottom: "0.5rem",
    color: "#a78bfa",
  } as React.CSSProperties,
  subtext: {
    fontSize: "0.82rem",
    color: "#64748b",
    marginBottom: "1.5rem",
    lineHeight: 1.5,
  } as React.CSSProperties,
  sectionHeading: {
    fontSize: "0.9rem",
    fontWeight: 600,
    color: "#94a3b8",
    marginBottom: "0.75rem",
  } as React.CSSProperties,
  field: { marginBottom: "1.25rem" } as React.CSSProperties,
  label: {
    display: "block",
    fontSize: "0.85rem",
    color: "#94a3b8",
    marginBottom: "0.35rem",
  } as React.CSSProperties,
  input: {
    width: "100%",
    background: "#0f1117",
    border: "1px solid #2d3148",
    borderRadius: 8,
    color: "#e2e8f0",
    fontSize: "1rem",
    padding: "0.65rem 0.85rem",
    outline: "none",
    colorScheme: "dark",
    boxSizing: "border-box",
  } as React.CSSProperties,
  select: {
    width: "100%",
    background: "#0f1117",
    border: "1px solid #2d3148",
    borderRadius: 8,
    color: "#e2e8f0",
    fontSize: "1rem",
    padding: "0.65rem 0.85rem",
    outline: "none",
    boxSizing: "border-box",
  } as React.CSSProperties,
  textarea: {
    width: "100%",
    background: "#0f1117",
    border: "1px solid #2d3148",
    borderRadius: 8,
    color: "#e2e8f0",
    fontSize: "1rem",
    padding: "0.65rem 0.85rem",
    outline: "none",
    resize: "vertical",
    minHeight: 120,
    fontFamily: "inherit",
    boxSizing: "border-box",
  } as React.CSSProperties,
  hint: {
    fontSize: "0.78rem",
    color: "#64748b",
    marginTop: "0.3rem",
  } as React.CSSProperties,
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  } as React.CSSProperties,
  checkbox: {
    width: 16,
    height: 16,
    accentColor: "#7c3aed",
    cursor: "pointer",
    flexShrink: 0,
  } as React.CSSProperties,
  checkboxLabel: {
    fontSize: "0.9rem",
    color: "#e2e8f0",
    cursor: "pointer",
  } as React.CSSProperties,
  extendedWaitNote: {
    fontSize: "0.78rem",
    color: "#a78bfa",
    background: "#1e1630",
    border: "1px solid #3b2d6b",
    borderRadius: 6,
    padding: "0.5rem 0.75rem",
    marginTop: "0.5rem",
    lineHeight: 1.5,
  } as React.CSSProperties,
  button: {
    width: "100%",
    background: "#7c3aed",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: "1rem",
    fontWeight: 600,
    padding: "0.75rem",
    cursor: "pointer",
  } as React.CSSProperties,
  scheduledItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: "0.75rem",
    background: "#0f1117",
    border: "1px solid #2d3148",
    borderRadius: 8,
    padding: "0.75rem 1rem",
  } as React.CSSProperties,
  scheduledName: {
    fontSize: "0.9rem",
    fontWeight: 600,
    color: "#e2e8f0",
    marginBottom: "0.2rem",
  } as React.CSSProperties,
  scheduledMeta: {
    fontSize: "0.78rem",
    color: "#64748b",
    marginBottom: "0.3rem",
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
  } as React.CSSProperties,
  extendedBadge: {
    background: "#1e1630",
    border: "1px solid #3b2d6b",
    color: "#a78bfa",
    borderRadius: 4,
    padding: "0 0.35rem",
    fontSize: "0.72rem",
  } as React.CSSProperties,
  scheduledPrompt: {
    fontSize: "0.82rem",
    color: "#94a3b8",
    fontStyle: "italic",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } as React.CSSProperties,
  cancelButton: {
    background: "transparent",
    border: "1px solid #450a0a",
    color: "#fca5a5",
    borderRadius: 6,
    padding: "0.3rem 0.65rem",
    fontSize: "0.78rem",
    cursor: "pointer",
    flexShrink: 0,
  } as React.CSSProperties,
  bannerSuccess: {
    background: "#14532d",
    border: "1px solid #16a34a",
    color: "#bbf7d0",
    borderRadius: 8,
    padding: "0.75rem 1rem",
    marginBottom: "1.25rem",
    fontSize: "0.9rem",
  } as React.CSSProperties,
  bannerError: {
    background: "#450a0a",
    border: "1px solid #dc2626",
    color: "#fecaca",
    borderRadius: 8,
    padding: "0.75rem 1rem",
    marginBottom: "1.25rem",
    fontSize: "0.9rem",
  } as React.CSSProperties,
};
