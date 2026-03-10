"use client";

import { useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";

function TaskForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);

    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, token }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus({ type: "error", message: data.error ?? "Something went wrong." });
      } else {
        setStatus({
          type: "success",
          message: `Task created${data.taskId ? ` (#${data.taskId})` : ""} and workspace started.`,
        });
        setTitle("");
        setDescription("");
      }
    } catch {
      setStatus({ type: "error", message: "Network error — could not reach server." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.card}>
      <h1 style={styles.heading}>New Kanban Task</h1>

      {status && (
        <div style={status.type === "success" ? styles.bannerSuccess : styles.bannerError}>
          {status.message}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={styles.field}>
          <label htmlFor="title" style={styles.label}>Title</label>
          <input
            id="title"
            type="text"
            placeholder="Short task title"
            required
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={styles.input}
          />
        </div>

        <div style={styles.field}>
          <label htmlFor="description" style={styles.label}>Description</label>
          <textarea
            id="description"
            placeholder="What needs doing? Include any context…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={styles.textarea}
          />
        </div>

        <button type="submit" disabled={loading} style={styles.button}>
          {loading ? "Creating…" : "Create task & start workspace"}
        </button>
      </form>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <TaskForm />
    </Suspense>
  );
}

const styles = {
  card: {
    background: "#1a1d27",
    border: "1px solid #2d3148",
    borderRadius: 12,
    padding: "2rem 1.75rem",
    width: "100%",
    maxWidth: 480,
  } as React.CSSProperties,
  heading: {
    fontSize: "1.25rem",
    fontWeight: 600,
    marginBottom: "1.5rem",
    color: "#a78bfa",
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
