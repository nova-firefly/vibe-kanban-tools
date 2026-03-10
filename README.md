# Vibe Kanban Tools

A lightweight Next.js web app for creating Vibe Kanban tasks from any device (phone-friendly).

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

App is available at `http://localhost:3000`.

### 3. Run locally

```bash
npm install
npm run dev
```

## Optional access control

Set `SUBMIT_TOKEN=some-secret` in `.env`, then share the URL with the token appended:

```
http://your-host:3000/?token=some-secret
```

The token is passed invisibly with each submission.

## Vibe Kanban API

`src/app/api/submit/route.ts` calls two endpoints:

| Action | Endpoint |
|---|---|
| Create task | `POST /api/tasks` |
| Start workspace | `POST /api/tasks/{id}/attempts` |

Adjust these if your Vibe Kanban version exposes a different API surface.

## Extending

- Add more fields (priority, labels, assignee) to the form + API route payload
- Call the `/api/submit` JSON endpoint directly from iOS Shortcuts for fully native quick-capture
- Add auth (OAuth, magic links) for multi-user deployments
