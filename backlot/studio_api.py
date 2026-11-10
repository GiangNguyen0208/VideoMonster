"""Studio API v1 — the write side next to Backlot's read-only board.

Studio is a companion to the agent CLI: it writes *intents* under
``projects/<id>/studio/`` and never touches checkpoints or artifacts the agent
owns (docs/ui-plan/03-architecture.md). Phase 0 ships only the skeleton:
session/CSRF plumbing, the ``current_user`` seam, and the ``ProjectStore``.
"""

from __future__ import annotations

import asyncio
import os
import secrets
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from pydantic import BaseModel, Field

from backlot import __version__, studio_catalog, studio_decisions, studio_setup, studio_uploads
from backlot.project_store import DiskProjectStore, ProjectStore, ProjectStoreError
from backlot.studio_jobs import jobs

API_PREFIX = "/api/v1"
TOKEN_HEADER = "X-Studio-Token"
SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
ALLOWED_HOSTS = frozenset({"127.0.0.1", "localhost"})

# Features later phases switch on; the UI reads these to show/hide entry points.
FEATURES: dict[str, bool] = {
    "setup": True,
    "wizard": True,
    "decisions": True,
    "uploads": True,
    "cost": False,
}


@dataclass(frozen=True)
class User:
    id: str
    display_name: str


LOCAL_USER = User(id="local", display_name="Local user")


def current_user() -> User:
    """Auth seam. Local v1 always returns the single local user; hosted mode
    (Phase 7) replaces this dependency with real session auth."""
    return LOCAL_USER


def get_store(request: Request) -> ProjectStore:
    return request.app.state.project_store


def _origin_allowed(origin: Optional[str]) -> bool:
    # Browsers omit Origin on some same-origin requests; the token still guards.
    if not origin:
        return True
    host = urlsplit(origin).hostname
    return host in ALLOWED_HOSTS


def install_studio_api(app, projects_dir) -> None:
    """Attach the v1 router, session token, project store and CSRF guard."""
    app.state.studio_token = secrets.token_urlsafe(32)
    app.state.project_store = DiskProjectStore(projects_dir)

    @app.middleware("http")
    async def studio_csrf_guard(request: Request, call_next):
        # Runs before routing, so every non-GET under /api/v1 — including
        # unknown paths — is rejected without the session token.
        path = request.url.path
        if path.startswith(API_PREFIX) and request.method not in SAFE_METHODS:
            token = request.headers.get(TOKEN_HEADER, "")
            if not secrets.compare_digest(token, app.state.studio_token):
                return JSONResponse({"detail": "missing or invalid studio token"}, status_code=403)
            if not _origin_allowed(request.headers.get("origin")):
                return JSONResponse({"detail": "cross-origin request rejected"}, status_code=403)
        return await call_next(request)

    app.include_router(_build_router())


class EnvVarUpdate(BaseModel):
    key: str = Field(min_length=2, max_length=64)
    # Empty string removes the key from .env.
    value: str = Field(max_length=4096)


PROBE_JOB = "setup_probe"


def _start_probe():
    return jobs.start(PROBE_JOB, studio_setup.run_probe, on_success=studio_setup.probe_cache.set)


def _ensure_probe() -> None:
    """Kick off the first capability check so lock states fill in soon."""
    if studio_setup.probe_cache.data is None:
        _start_probe()


def _project_dir(store: ProjectStore, project_id: str):
    try:
        return store.project_dir(project_id)
    except ProjectStoreError:
        raise HTTPException(status_code=404, detail=f"unknown project: {project_id}") from None


def _decision_error(exc: studio_decisions.DecisionError) -> JSONResponse:
    return JSONResponse({"detail": exc.detail, "code": exc.code}, status_code=exc.status)


def _upload_error(exc: studio_uploads.UploadError) -> JSONResponse:
    return JSONResponse({"detail": exc.detail, "code": exc.code}, status_code=exc.status)


def _declared_size(request: Request) -> Optional[int]:
    try:
        return int(request.headers["content-length"])
    except (KeyError, ValueError):
        return None


def _check_choices(intake: studio_catalog.IntakeIn) -> None:
    try:
        studio_catalog.validate_choices(intake)
    except studio_catalog.CatalogError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None


def _build_router() -> APIRouter:
    router = APIRouter(prefix=API_PREFIX)

    @router.get("/session")
    async def session(request: Request, user: User = Depends(current_user)) -> dict:
        return {
            "token": request.app.state.studio_token,
            "version": __version__,
            "user": {"id": user.id, "display_name": user.display_name},
            "features": FEATURES,
        }

    # ---- jobs ----------------------------------------------------------

    @router.get("/jobs/{job_id}")
    async def job_status(job_id: str) -> dict:
        job = jobs.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="unknown job")
        return job.public()

    # ---- setup center (Phase 2) ---------------------------------------

    @router.get("/setup")
    async def setup() -> JSONResponse:
        """Setup view, or 202 + job while the first capability check runs."""
        probe = studio_setup.probe_cache.data
        if probe is None:
            job = _start_probe()
            return JSONResponse({"status": "checking", "job": job.public()}, status_code=202)
        view = await asyncio.to_thread(studio_setup.build_view, probe)
        running = jobs.running(PROBE_JOB)
        view["rechecking"] = running.public() if running else None
        return JSONResponse(view)

    @router.post("/setup/recheck", status_code=202)
    async def setup_recheck() -> dict:
        return {"status": "checking", "job": _start_probe().public()}

    @router.put("/setup/env")
    async def setup_env(update: EnvVarUpdate) -> dict:
        if os.environ.get("STUDIO_READONLY_ENV") == "1":
            raise HTTPException(status_code=403, detail="editing .env is disabled on this server")
        probe = studio_setup.probe_cache.data
        if probe is None:
            raise HTTPException(status_code=409, detail="run a capability check first")
        if update.key not in studio_setup.allowed_env_keys(probe):
            raise HTTPException(status_code=422, detail=f"{update.key} is not a key any tool uses")
        try:
            await asyncio.to_thread(studio_setup.write_env_var, update.key, update.value.strip())
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from None
        status = studio_setup.env_status([update.key])[update.key]
        return {"key": update.key, **status}

    # ---- new video wizard (Phase 3) -----------------------------------

    @router.get("/pipelines")
    async def pipelines() -> dict:
        _ensure_probe()
        probe = studio_setup.probe_cache.data
        items = await asyncio.to_thread(studio_catalog.list_pipeline_catalog, probe)
        return {
            "pipelines": items,
            "checked": probe is not None,
            "defaults": studio_catalog.budget_defaults(),
        }

    @router.get("/styles")
    async def styles() -> dict:
        return {"styles": await asyncio.to_thread(studio_catalog.list_styles)}

    @router.post("/projects", status_code=201)
    async def create_project(
        intake: studio_catalog.IntakeIn,
        store: ProjectStore = Depends(get_store),
    ) -> dict:
        await asyncio.to_thread(_check_choices, intake)
        probe = studio_setup.probe_cache.data
        if probe is not None:
            item = next(
                (p for p in probe["pipelines"] if p["pipeline"] == intake.pipeline_type), None
            )
            if item and studio_setup.video_type_state(item) == "locked":
                raise HTTPException(
                    status_code=409,
                    detail="this video type needs more setup first — see Setup",
                )
        doc = studio_catalog.intake_document(intake)
        root = store.root
        project_id = studio_catalog.new_project_id(doc["title"], root)

        def create() -> None:
            from lib.checkpoint import init_project

            init_project(
                project_id,
                title=doc["title"],
                pipeline_type=intake.pipeline_type,
                pipeline_dir=root,
                style_playbook=intake.style_playbook,
            )
            store.write_json(project_id, studio_catalog.INTAKE_PATH, doc)
            if intake.reference.url:
                studio_uploads.add_reference(
                    store.project_dir(project_id),
                    studio_uploads.ReferenceIn(
                        url=intake.reference.url, notes=intake.reference.notes or ""
                    ),
                    source="wizard",
                )

        await asyncio.to_thread(create)
        return {"project_id": project_id, "kickoff": studio_catalog.kickoff(project_id)}

    @router.get("/projects/{project_id}/intake")
    async def get_intake(project_id: str, store: ProjectStore = Depends(get_store)) -> dict:
        project_dir = _project_dir(store, project_id)
        intake = store.read_json(project_id, studio_catalog.INTAKE_PATH)
        if intake is None:
            raise HTTPException(status_code=404, detail="project was not created in Studio")
        return {"intake": intake, "editable": not studio_catalog.has_checkpoint(project_dir)}

    @router.patch("/projects/{project_id}/intake")
    async def update_intake(
        project_id: str,
        intake: studio_catalog.IntakeIn,
        store: ProjectStore = Depends(get_store),
    ) -> dict:
        project_dir = _project_dir(store, project_id)
        current = store.read_json(project_id, studio_catalog.INTAKE_PATH)
        if current is None:
            raise HTTPException(status_code=404, detail="project was not created in Studio")
        if studio_catalog.has_checkpoint(project_dir):
            raise HTTPException(
                status_code=409, detail="the agent has started; tell it about changes in chat"
            )
        if intake.pipeline_type != current.get("pipeline_type"):
            raise HTTPException(status_code=422, detail="video type cannot change after creation")
        await asyncio.to_thread(_check_choices, intake)
        doc = studio_catalog.intake_document(intake, created_at=current.get("created_at"))
        store.write_json(project_id, studio_catalog.INTAKE_PATH, doc)
        return {"intake": doc, "editable": True}

    @router.get("/projects/{project_id}/kickoff")
    async def get_kickoff(project_id: str, store: ProjectStore = Depends(get_store)) -> dict:
        project_dir = _project_dir(store, project_id)
        if store.read_json(project_id, studio_catalog.INTAKE_PATH) is None:
            raise HTTPException(status_code=404, detail="project was not created in Studio")
        return {
            **studio_catalog.kickoff(project_id),
            "started": studio_catalog.has_checkpoint(project_dir),
        }

    # ---- review decisions (Phase 4) -----------------------------------

    @router.get("/projects/{project_id}/decisions")
    async def get_decisions(project_id: str, store: ProjectStore = Depends(get_store)) -> dict:
        project_dir = _project_dir(store, project_id)
        items = await asyncio.to_thread(studio_decisions.list_decisions, project_dir)
        return {"decisions": items}

    @router.post("/projects/{project_id}/decisions", status_code=201)
    async def post_decision(
        project_id: str,
        body: studio_decisions.DecisionIn,
        store: ProjectStore = Depends(get_store),
        user: User = Depends(current_user),
    ):
        project_dir = _project_dir(store, project_id)
        probe = studio_setup.probe_cache.data
        runtimes = (probe or {}).get("summary", {}).get("composition_runtimes") if probe else None
        try:
            decision = await asyncio.to_thread(
                studio_decisions.record, project_dir, body, user_id=user.id, runtimes=runtimes
            )
        except studio_decisions.DecisionError as exc:
            return _decision_error(exc)
        return JSONResponse(decision, status_code=201)

    @router.delete("/projects/{project_id}/decisions/{decision_id}", status_code=204)
    async def delete_decision(
        project_id: str, decision_id: str, store: ProjectStore = Depends(get_store)
    ):
        project_dir = _project_dir(store, project_id)
        try:
            await asyncio.to_thread(studio_decisions.retract, project_dir, decision_id)
        except studio_decisions.DecisionError as exc:
            return _decision_error(exc)
        return Response(status_code=204)

    # ---- footage & references (Phase 5) -------------------------------

    @router.get("/uploads/limits")
    async def upload_limits() -> dict:
        return studio_uploads.limits()

    @router.get("/projects/{project_id}/inputs")
    async def get_inputs(project_id: str, store: ProjectStore = Depends(get_store)) -> dict:
        project_dir = _project_dir(store, project_id)
        index = await asyncio.to_thread(studio_uploads.list_inputs, project_dir)
        return {**index, "started": studio_catalog.has_checkpoint(project_dir)}

    @router.post("/projects/{project_id}/uploads", status_code=201)
    async def upload(
        project_id: str,
        request: Request,
        name: str = Query(min_length=1, max_length=255),
        kind: studio_uploads.UploadKind = "footage",
        store: ProjectStore = Depends(get_store),
    ):
        project_dir = _project_dir(store, project_id)
        try:
            path, media = await studio_uploads.stream_to_folder(
                project_dir / studio_uploads.INPUTS_DIR,
                name,
                request.headers.get("content-type"),
                request.stream(),
                _declared_size(request),
            )
        except studio_uploads.UploadError as exc:
            return _upload_error(exc)
        entry = await asyncio.to_thread(studio_uploads.add_file, project_dir, path, media, kind)
        return JSONResponse(entry, status_code=201)

    @router.delete("/projects/{project_id}/uploads/{name}", status_code=204)
    async def delete_upload(project_id: str, name: str, store: ProjectStore = Depends(get_store)):
        project_dir = _project_dir(store, project_id)
        try:
            await asyncio.to_thread(
                studio_uploads.remove_file,
                project_dir,
                name,
                studio_catalog.has_checkpoint(project_dir),
            )
        except studio_uploads.UploadError as exc:
            return _upload_error(exc)
        return Response(status_code=204)

    @router.post("/projects/{project_id}/references", status_code=201)
    async def add_reference(
        project_id: str,
        body: studio_uploads.ReferenceIn,
        store: ProjectStore = Depends(get_store),
    ):
        project_dir = _project_dir(store, project_id)
        try:
            entry = await asyncio.to_thread(studio_uploads.add_reference, project_dir, body)
        except studio_uploads.UploadError as exc:
            return _upload_error(exc)
        return JSONResponse(entry, status_code=201)

    @router.delete("/projects/{project_id}/references/{ref_id}", status_code=204)
    async def delete_reference(
        project_id: str, ref_id: str, store: ProjectStore = Depends(get_store)
    ):
        project_dir = _project_dir(store, project_id)
        try:
            await asyncio.to_thread(
                studio_uploads.remove_reference,
                project_dir,
                ref_id,
                studio_catalog.has_checkpoint(project_dir),
            )
        except studio_uploads.UploadError as exc:
            return _upload_error(exc)
        return Response(status_code=204)

    # ---- music library ------------------------------------------------

    @router.get("/music")
    async def music() -> dict:
        tracks = await asyncio.to_thread(studio_uploads.list_music)
        return {"tracks": tracks}

    @router.post("/music", status_code=201)
    async def upload_music(request: Request, name: str = Query(min_length=1, max_length=255)):
        try:
            if studio_uploads.media_kind(name) != "audio":
                raise studio_uploads.UploadError(
                    415, "unsupported_type", "only audio files go in the music library"
                )
            path, _ = await studio_uploads.stream_to_folder(
                studio_uploads.music_dir(),
                name,
                request.headers.get("content-type"),
                request.stream(),
                _declared_size(request),
            )
        except studio_uploads.UploadError as exc:
            return _upload_error(exc)
        tracks = await asyncio.to_thread(studio_uploads.list_music)
        track = next(t for t in tracks if t["name"] == path.name)
        return JSONResponse(track, status_code=201)

    @router.get("/music/tracks/{name:path}")
    async def music_file(name: str):
        try:
            return FileResponse(studio_uploads.music_track(name))
        except studio_uploads.UploadError as exc:
            return _upload_error(exc)

    # ---- demos --------------------------------------------------------

    @router.get("/demos")
    async def demos() -> dict:
        items = await asyncio.to_thread(studio_catalog.list_demos)
        for item in items:
            running = jobs.running(f"demo_render:{item['name']}")
            item["job"] = running.public() if running else None
        return {"demos": items}

    @router.post("/demos/{name}/render", status_code=202)
    async def render_demo(name: str) -> dict:
        names = {d["name"] for d in await asyncio.to_thread(studio_catalog.list_demos)}
        if name not in names:
            raise HTTPException(status_code=404, detail=f"unknown demo: {name}")
        job = jobs.start(
            f"demo_render:{name}",
            lambda job: studio_catalog.render_demo_job(name, job),
            pass_job=True,
            public_output=True,
        )
        return {"job": job.public()}

    return router
