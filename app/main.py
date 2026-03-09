import os
from fastapi import FastAPI, Form, Request, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from app.kanban import create_task

app = FastAPI(title="Vibe Kanban Tools")
templates = Jinja2Templates(directory="app/templates")

SUBMIT_TOKEN = os.getenv("SUBMIT_TOKEN", "")


def _check_token(token: str | None):
    """If SUBMIT_TOKEN is set, requests must supply a matching token."""
    if SUBMIT_TOKEN and token != SUBMIT_TOKEN:
        raise HTTPException(status_code=403, detail="Invalid token")


@app.get("/", response_class=HTMLResponse)
async def index(request: Request, token: str = ""):
    _check_token(token or None)
    return templates.TemplateResponse("index.html", {"request": request, "token": token})


@app.post("/submit", response_class=HTMLResponse)
async def submit(
    request: Request,
    title: str = Form(...),
    description: str = Form(...),
    token: str = Form(""),
):
    _check_token(token or None)
    try:
        result = await create_task(title=title, description=description)
    except Exception as exc:
        return templates.TemplateResponse(
            "index.html",
            {"request": request, "token": token, "error": str(exc)},
            status_code=502,
        )

    task_id = result["task"].get("id") or result["task"].get("task", {}).get("id")
    return templates.TemplateResponse(
        "index.html",
        {"request": request, "token": token, "success": True, "task_id": task_id},
    )
