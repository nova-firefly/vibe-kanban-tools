# Vibe Kanban Tools

A lightweight web app for creating Vibe Kanban tasks from any device (phone-friendly).

## Features

- **Quick-capture form** — hit a URL, fill in a title + description, and a task is created in your Vibe Kanban instance with a workspace automatically started.

## Getting started

### 1. Configure

```bash
cp .env.example .env
# Edit .env — set VIBE_KANBAN_URL and optionally VIBE_KANBAN_API_KEY / SUBMIT_TOKEN
```

### 2. Run with Docker

```bash
docker compose up --build
```

App is available at `http://localhost:8000`.

### 3. Run locally (no Docker)

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Optional access control

Set `SUBMIT_TOKEN=some-secret` in `.env`, then share the URL with the token appended:

```
http://your-host:8000/?token=some-secret
```

The token is passed through the form invisibly so you stay authenticated.

## Vibe Kanban API

`app/kanban.py` calls two endpoints:

| Action | Endpoint |
|---|---|
| Create task | `POST /api/tasks` |
| Start workspace | `POST /api/tasks/{id}/attempts` |

Adjust these if your Vibe Kanban version exposes a different API surface.

## Extending

- Add more fields (priority, labels, assignee) to the form + `kanban.py` payload
- Add a `/api/submit` JSON endpoint for programmatic use (e.g. Shortcuts app on iPhone)
- Add auth (OAuth, magic links) for multi-user deployments
