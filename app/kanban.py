"""
Vibe Kanban API client.

Vibe Kanban REST API docs: https://github.com/BloopAI/vibe-kanban
Adjust endpoints below to match your instance's API surface.
"""

import httpx
import os


VIBE_KANBAN_URL = os.getenv("VIBE_KANBAN_URL", "http://localhost:3000")
VIBE_KANBAN_API_KEY = os.getenv("VIBE_KANBAN_API_KEY", "")


def _headers() -> dict:
    h = {"Content-Type": "application/json"}
    if VIBE_KANBAN_API_KEY:
        h["Authorization"] = f"Bearer {VIBE_KANBAN_API_KEY}"
    return h


async def create_task(title: str, description: str) -> dict:
    """Create a task in Vibe Kanban and start its workspace."""
    payload = {
        "title": title,
        "description": description,
    }

    async with httpx.AsyncClient(base_url=VIBE_KANBAN_URL, headers=_headers()) as client:
        # 1. Create the task
        resp = await client.post("/api/tasks", json=payload)
        resp.raise_for_status()
        task = resp.json()
        task_id = task.get("id") or task.get("task", {}).get("id")

        # 2. Start a workspace for the task
        ws_resp = await client.post(f"/api/tasks/{task_id}/attempts", json={})
        ws_resp.raise_for_status()
        workspace = ws_resp.json()

    return {"task": task, "workspace": workspace}
