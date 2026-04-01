"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect, useCallback, Suspense } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Workspace {
  id: string;
  name?: string;
  archived?: boolean;
}

interface ScheduledMessage {
  workspaceId: string;
  workspaceName: string;
  prompt: string;
  tokenResetAt: string;
  scheduledAt: string;
  extendedWait: boolean;
}

type Banner = { type: "success" | "error"; message: string } | null;

// The API already filters with archived: false, but guard here too.
function isActiveWorkspace(ws: Workspace) {
  return !ws.archived;
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function StatusBanner({ banner }: { banner: Banner }) {
  if (!banner) return null;
  return (
    <div style={banner.type === "success" ? s.bannerSuccess : s.bannerError}>
      {banner.message}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={s.field}>
      <label style={s.label}>{label}</label>
      {children}
      {hint && <div style={s.hint}>{hint}</div>}
    </div>
  );
}

// ─── New Issue Card ───────────────────────────────────────────────────────────

function NewIssueCard({ token }: { token: string }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [banner, setBanner] = useState<Banner>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setBanner(null);
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBanner({ type: "error", message: data.error ?? "Something went wrong." });
      } else {
        setBanner({
          type: "success",
          message: `Issue created${data.issueId ? ` (${data.issueId})` : ""}.`,
        });
        setTitle("");
        setDescription("");
      }
    } catch {
      setBanner({ type: "error", message: "Network error — could not reach server." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={s.card}>
      <div style={s.cardHeader}>
        <span style={{ ...s.cardIcon, background: "#1e1a3a" }}>✦</span>
        <div>
          <h2 style={s.cardTitle}>New Issue</h2>
          <p style={s.cardSub}>Create a kanban issue and start a workspace</p>
        </div>
      </div>

      <StatusBanner banner={banner} />

      <form onSubmit={handleSubmit}>
        <Field label="Title">
          <input
            type="text"
            placeholder="Short task title"
            required
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={s.input}
          />
        </Field>

        <Field label="Description">
          <textarea
            placeholder="What needs doing? Include any context…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={s.textarea}
          />
        </Field>

        <button type="submit" disabled={loading} style={s.button}>
          {loading ? "Creating…" : "Create issue"}
        </button>
      </form>
    </div>
  );
}

// ─── Schedule Prompt Card ─────────────────────────────────────────────────────

function ScheduleCard({ token }: { token: string }) {
  const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : "";

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [wsError, setWsError] = useState(false);
  const [scheduled, setScheduled] = useState<ScheduledMessage[]>([]);

  const [workspaceId, setWorkspaceId] = useState("");
  const [tokenResetAt, setTokenResetAt] = useState("");
  const [prompt, setPrompt] = useState("");
  const [extendedWait, setExtendedWait] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    const [wsRes, schedRes] = await Promise.all([
      fetch(`/api/workspaces${tokenQuery}`).catch(() => null),
      fetch(`/api/schedule${tokenQuery}`).catch(() => null),
    ]);
    if (wsRes?.ok) {
      const d = await wsRes.json();
      const active = (d.workspaces ?? []).filter(isActiveWorkspace);
      setWorkspaces(active);
      setWsError(false);
    } else {
      setWsError(true);
    }
    if (schedRes?.ok) {
      const d = await schedRes.json();
      setScheduled(d.scheduled ?? []);
    }
  }, [tokenQuery]);

  useEffect(() => { loadData(); }, [loadData]);

  const activeWorkspaces = workspaces.filter(isActiveWorkspace);
  const existingSchedule = scheduled.find((s) => s.workspaceId === workspaceId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setBanner(null);
    try {
      const ws = activeWorkspaces.find((w) => w.id === workspaceId);
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
        setBanner({ type: "error", message: data.error ?? "Failed to schedule." });
      } else {
        setBanner({
          type: "success",
          message: `Scheduled — sends at ${formatTime(data.scheduled.scheduledAt)}`,
        });
        setPrompt("");
        setExtendedWait(false);
        setTokenResetAt("");
        await loadData();
      }
    } catch {
      setBanner({ type: "error", message: "Network error — could not reach server." });
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

  return (
    <div style={s.card}>
      <div style={s.cardHeader}>
        <span style={{ ...s.cardIcon, background: "#0f1e14" }}>⏱</span>
        <div>
          <h2 style={s.cardTitle}>Schedule Prompt</h2>
          <p style={s.cardSub}>Send a prompt 5 min after token reset</p>
        </div>
      </div>

      <StatusBanner banner={banner} />

      <form onSubmit={handleSubmit}>
        <Field
          label="Workspace"
          hint={existingSchedule ? `Already scheduled for ${formatTime(existingSchedule.scheduledAt)} — will replace` : undefined}
        >
          {wsError ? (
            <input
              type="text"
              placeholder="Workspace ID"
              required
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              style={s.input}
            />
          ) : (
            <select
              required
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              style={s.select}
              disabled={activeWorkspaces.length === 0}
            >
              <option value="">
                {activeWorkspaces.length === 0
                  ? "No active workspaces"
                  : "Select active workspace…"}
              </option>
              {activeWorkspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name ?? w.id}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field label="Token resets at" hint="Prompt sends 5 minutes after this time">
          <input
            type="datetime-local"
            required
            value={tokenResetAt}
            onChange={(e) => setTokenResetAt(e.target.value)}
            style={{ ...s.input, colorScheme: "dark" } as React.CSSProperties}
          />
        </Field>

        <Field label="Prompt">
          <textarea
            required
            placeholder="What should be sent to the workspace?"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            style={s.textarea}
          />
        </Field>

        <div style={s.checkboxRow}>
          <input
            id="extendedWait"
            type="checkbox"
            checked={extendedWait}
            onChange={(e) => setExtendedWait(e.target.checked)}
            style={s.checkbox}
          />
          <label htmlFor="extendedWait" style={s.checkboxLabel}>
            Extended wait
          </label>
        </div>

        {extendedWait && (
          <div style={s.extendedNote}>
            Prepends context telling the model it has extra time — think carefully,
            consider alternatives, refine before responding.
          </div>
        )}

        <button
          type="submit"
          disabled={loading || (!wsError && activeWorkspaces.length === 0)}
          style={{ ...s.button, marginTop: "1.25rem" }}
        >
          {loading ? "Scheduling…" : "Schedule"}
        </button>
      </form>

      {/* Pending schedules */}
      {scheduled.length > 0 && (
        <>
          <div style={s.divider} />
          <div style={s.pendingLabel}>Pending</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {scheduled.map((item) => (
              <div key={item.workspaceId} style={s.pendingItem}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={s.pendingName}>{item.workspaceName}</div>
                  <div style={s.pendingMeta}>
                    {formatTime(item.scheduledAt)}
                    {item.extendedWait && (
                      <span style={s.extendedBadge}>extended</span>
                    )}
                  </div>
                  <div style={s.pendingPrompt}>
                    {item.prompt.length > 80
                      ? item.prompt.slice(0, 80) + "…"
                      : item.prompt}
                  </div>
                </div>
                <button
                  onClick={() => handleCancel(item.workspaceId)}
                  style={s.cancelBtn}
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function Dashboard() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  return (
    <div className="tools-wrapper">
      <header style={s.pageHeader}>
        <h1 style={s.pageTitle}>Vibe Kanban Tools</h1>
      </header>
      <div className="tools-grid">
        <NewIssueCard token={token} />
        <ScheduleCard token={token} />
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Dashboard />
    </Suspense>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = {
  pageHeader: {
    marginBottom: "1.5rem",
    paddingBottom: "1.25rem",
    borderBottom: "1px solid #1e2235",
  } as React.CSSProperties,
  pageTitle: {
    fontSize: "1rem",
    fontWeight: 600,
    color: "#a78bfa",
    letterSpacing: "0.02em",
  } as React.CSSProperties,

  card: {
    background: "#1a1d27",
    border: "1px solid #2d3148",
    borderRadius: 12,
    padding: "1.75rem",
  } as React.CSSProperties,
  cardHeader: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    marginBottom: "1.5rem",
  } as React.CSSProperties,
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1rem",
    flexShrink: 0,
    border: "1px solid #2d3148",
  } as React.CSSProperties,
  cardTitle: {
    fontSize: "1rem",
    fontWeight: 600,
    color: "#e2e8f0",
    lineHeight: 1.3,
  } as React.CSSProperties,
  cardSub: {
    fontSize: "0.78rem",
    color: "#64748b",
    marginTop: "0.15rem",
  } as React.CSSProperties,

  field: { marginBottom: "1.1rem" } as React.CSSProperties,
  label: {
    display: "block",
    fontSize: "0.8rem",
    color: "#94a3b8",
    marginBottom: "0.3rem",
    fontWeight: 500,
  } as React.CSSProperties,
  hint: {
    fontSize: "0.74rem",
    color: "#64748b",
    marginTop: "0.3rem",
    lineHeight: 1.4,
  } as React.CSSProperties,
  input: {
    width: "100%",
    background: "#0f1117",
    border: "1px solid #2d3148",
    borderRadius: 7,
    color: "#e2e8f0",
    fontSize: "0.9rem",
    padding: "0.6rem 0.75rem",
    outline: "none",
  } as React.CSSProperties,
  select: {
    width: "100%",
    background: "#0f1117",
    border: "1px solid #2d3148",
    borderRadius: 7,
    color: "#e2e8f0",
    fontSize: "0.9rem",
    padding: "0.6rem 0.75rem",
    outline: "none",
  } as React.CSSProperties,
  textarea: {
    width: "100%",
    background: "#0f1117",
    border: "1px solid #2d3148",
    borderRadius: 7,
    color: "#e2e8f0",
    fontSize: "0.9rem",
    padding: "0.6rem 0.75rem",
    outline: "none",
    resize: "vertical",
    minHeight: 100,
    fontFamily: "inherit",
  } as React.CSSProperties,

  button: {
    width: "100%",
    background: "#7c3aed",
    color: "#fff",
    border: "none",
    borderRadius: 7,
    fontSize: "0.9rem",
    fontWeight: 600,
    padding: "0.7rem",
    cursor: "pointer",
  } as React.CSSProperties,

  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  } as React.CSSProperties,
  checkbox: {
    width: 15,
    height: 15,
    accentColor: "#7c3aed",
    cursor: "pointer",
    flexShrink: 0,
  } as React.CSSProperties,
  checkboxLabel: {
    fontSize: "0.85rem",
    color: "#e2e8f0",
    cursor: "pointer",
  } as React.CSSProperties,
  extendedNote: {
    fontSize: "0.74rem",
    color: "#a78bfa",
    background: "#1e1630",
    border: "1px solid #3b2d6b",
    borderRadius: 6,
    padding: "0.45rem 0.7rem",
    marginTop: "0.5rem",
    lineHeight: 1.5,
  } as React.CSSProperties,

  divider: {
    borderTop: "1px solid #2d3148",
    margin: "1.25rem 0 1rem",
  } as React.CSSProperties,
  pendingLabel: {
    fontSize: "0.72rem",
    fontWeight: 600,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    marginBottom: "0.6rem",
  } as React.CSSProperties,
  pendingItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: "0.6rem",
    background: "#0f1117",
    border: "1px solid #2d3148",
    borderRadius: 7,
    padding: "0.6rem 0.75rem",
  } as React.CSSProperties,
  pendingName: {
    fontSize: "0.82rem",
    fontWeight: 600,
    color: "#e2e8f0",
    marginBottom: "0.1rem",
  } as React.CSSProperties,
  pendingMeta: {
    fontSize: "0.74rem",
    color: "#64748b",
    display: "flex",
    alignItems: "center",
    gap: "0.35rem",
    marginBottom: "0.2rem",
  } as React.CSSProperties,
  pendingPrompt: {
    fontSize: "0.76rem",
    color: "#94a3b8",
    fontStyle: "italic",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } as React.CSSProperties,
  extendedBadge: {
    background: "#1e1630",
    border: "1px solid #3b2d6b",
    color: "#a78bfa",
    borderRadius: 4,
    padding: "0 0.3rem",
    fontSize: "0.68rem",
    fontStyle: "normal",
  } as React.CSSProperties,
  cancelBtn: {
    background: "transparent",
    border: "1px solid #3d1515",
    color: "#f87171",
    borderRadius: 5,
    padding: "0.25rem 0.55rem",
    fontSize: "0.74rem",
    cursor: "pointer",
    flexShrink: 0,
    marginTop: "0.1rem",
  } as React.CSSProperties,

  bannerSuccess: {
    background: "#14532d",
    border: "1px solid #16a34a",
    color: "#bbf7d0",
    borderRadius: 7,
    padding: "0.65rem 0.9rem",
    marginBottom: "1.1rem",
    fontSize: "0.85rem",
  } as React.CSSProperties,
  bannerError: {
    background: "#450a0a",
    border: "1px solid #dc2626",
    color: "#fecaca",
    borderRadius: 7,
    padding: "0.65rem 0.9rem",
    marginBottom: "1.1rem",
    fontSize: "0.85rem",
  } as React.CSSProperties,
};
