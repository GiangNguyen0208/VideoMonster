"""Studio API v1 — the write side next to Backlot's read-only board.

Studio is a companion to the agent CLI: it writes *intents* under
``projects/<id>/studio/`` and never touches checkpoints or artifacts the agent
owns (docs/ui-plan/03-architecture.md).

Hosted-readiness seams (docs/ui-plan/hosted/design.md):
- every route depends on ``current_user`` (router-level dependency);
- every project route resolves its project through ``project_access``, which
  calls ``authorize(user, project_id, access)`` before handing out a
  ``ProjectFiles`` handle;
- project files go through ``ProjectStore``, machine files through
  ``backlot/machine_store.py`` — never the filesystem directly
  (tests/contracts/test_studio_store_contract.py).
"""

from __future__ import annotations

import asyncio
import os
import secrets
from dataclasses import dataclass
from datetime import datetime
from typing import Callable, Literal, Optional
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from pydantic import BaseModel, Field
from starlette.background import BackgroundTask

from backlot import (
    __version__,
    studio_catalog,
    studio_cost,
    studio_decisions,
    studio_results,
    studio_settings,
    studio_setup,
    studio_uploads,
)
from backlot.project_store import DiskProjectStore, ProjectFiles, ProjectStore, ProjectStoreError
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
    "cost": True,
    "results": True,
    "settings": True,
}

Access = Literal["view", "edit"]


@dataclass(frozen=True)
class User:
    id: str
    display_name: str


LOCAL_USER = User(id="local", display_name="Local user")


def current_user() -> User:
    """Auth seam. Local v1 always returns the single local user; hosted mode
    replaces this dependency with session auth (hosted/design.md §2)."""
    return LOCAL_USER


def authorize(user: User, project_id: str, access: Access) -> bool:
    """Authorization seam. Local: the one user owns every project. Hosted:
    owners may ``edit``; shared viewers may only ``view`` (hosted/design.md §2.3)."""
    return True


def get_store(request: Request) -> ProjectStore:
    return request.app.state.project_store


def project_access(access: Access) -> Callable[..., ProjectFiles]:
    """Dependency: the ``ProjectFiles`` of ``{project_id}``, after checking
    the user may ``access`` it. Unknown and forbidden projects are both 404,
    so ids of other tenants' projects are not revealed."""

    def dependency(
        project_id: str,
        store: ProjectStore = Depends(get_store),
        user: User = Depends(current_user),
    ) -> ProjectFiles:
        try:
            if authorize(user, project_id, access):
                return store.files(project_id)
        except ProjectStoreError:
            pass
        raise HTTPException(status_code=404, detail=f"unknown project: {project_id}")

    return dependency


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


def _coded_error(exc: studio_decisions.DecisionError | studio_uploads.UploadError) -> JSONResponse:
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


def _studio_project(files: ProjectFiles) -> dict:
    intake = files.read_json(studio_catalog.INTAKE_PATH)
    if intake is None:
        raise HTTPException(status_code=404, detail="project was not created in Studio")
    return intake


def _build_router() -> APIRouter:
    router = APIRouter(prefix=API_PREFIX, dependencies=[Depends(current_user)])
    viewer = Depends(project_access("view"))
    editor = Depends(project_access("edit"))

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
        project_id = studio_catalog.new_project_id(doc["title"], store)

        def create() -> None:
            files = store.create_project(
                project_id,
                title=doc["title"],
                pipeline_type=intake.pipeline_type,
                style_playbook=intake.style_playbook,
            )
            files.write_json(studio_catalog.INTAKE_PATH, doc)
            if intake.reference.url:
                studio_uploads.add_reference(
                    files,
                    studio_uploads.ReferenceIn(
                        url=intake.reference.url, notes=intake.reference.notes or ""
                    ),
                    source="wizard",
                )

        await asyncio.to_thread(create)
        return {"project_id": project_id, "kickoff": studio_catalog.kickoff(project_id)}

    @router.get("/projects/{project_id}/intake")
    async def get_intake(files: ProjectFiles = viewer) -> dict:
        def read() -> dict:
            intake = _studio_project(files)
            return {"intake": intake, "editable": not studio_catalog.has_checkpoint(files)}

        return await asyncio.to_thread(read)

    @router.patch("/projects/{project_id}/intake")
    async def update_intake(intake: studio_catalog.IntakeIn, files: ProjectFiles = editor) -> dict:
        def update() -> dict:
            current = _studio_project(files)
            if studio_catalog.has_checkpoint(files):
                raise HTTPException(
                    status_code=409, detail="the agent has started; tell it about changes in chat"
                )
            if intake.pipeline_type != current.get("pipeline_type"):
                raise HTTPException(status_code=422, detail="video type cannot change after creation")
            _check_choices(intake)
            doc = studio_catalog.intake_document(intake, created_at=current.get("created_at"))
            files.write_json(studio_catalog.INTAKE_PATH, doc)
            return {"intake": doc, "editable": True}

        return await asyncio.to_thread(update)

    @router.get("/projects/{project_id}/kickoff")
    async def get_kickoff(files: ProjectFiles = viewer) -> dict:
        def read() -> dict:
            _studio_project(files)
            return {
                **studio_catalog.kickoff(files.project_id),
                "started": studio_catalog.has_checkpoint(files),
            }

        return await asyncio.to_thread(read)

    # ---- review decisions (Phase 4) -----------------------------------

    @router.get("/projects/{project_id}/decisions")
    async def get_decisions(files: ProjectFiles = viewer) -> dict:
        return {"decisions": await asyncio.to_thread(studio_decisions.list_decisions, files)}

    @router.post("/projects/{project_id}/decisions", status_code=201)
    async def post_decision(
        body: studio_decisions.DecisionIn,
        files: ProjectFiles = editor,
        user: User = Depends(current_user),
    ):
        probe = studio_setup.probe_cache.data
        runtimes = (probe or {}).get("summary", {}).get("composition_runtimes") if probe else None
        try:
            decision = await asyncio.to_thread(
                studio_decisions.record, files, body, user_id=user.id, runtimes=runtimes
            )
        except studio_decisions.DecisionError as exc:
            return _coded_error(exc)
        return JSONResponse(decision, status_code=201)

    @router.delete("/projects/{project_id}/decisions/{decision_id}", status_code=204)
    async def delete_decision(decision_id: str, files: ProjectFiles = editor):
        try:
            await asyncio.to_thread(studio_decisions.retract, files, decision_id)
        except studio_decisions.DecisionError as exc:
            return _coded_error(exc)
        return Response(status_code=204)

    # ---- footage & references (Phase 5) -------------------------------

    @router.get("/uploads/limits")
    async def upload_limits() -> dict:
        return studio_uploads.limits()

    @router.get("/projects/{project_id}/inputs")
    async def get_inputs(files: ProjectFiles = viewer) -> dict:
        def read() -> dict:
            index = studio_uploads.list_inputs(files)
            return {**index, "started": studio_catalog.has_checkpoint(files)}

        return await asyncio.to_thread(read)

    @router.post("/projects/{project_id}/uploads", status_code=201)
    async def upload(
        request: Request,
        name: str = Query(min_length=1, max_length=255),
        kind: studio_uploads.UploadKind = "footage",
        files: ProjectFiles = editor,
    ):
        try:
            info, media = await studio_uploads.save_upload(
                files,
                name,
                request.headers.get("content-type"),
                request.stream(),
                _declared_size(request),
            )
        except studio_uploads.UploadError as exc:
            return _coded_error(exc)
        entry = await asyncio.to_thread(studio_uploads.add_file, files, info, media, kind)
        return JSONResponse(entry, status_code=201)

    @router.delete("/projects/{project_id}/uploads/{name}", status_code=204)
    async def delete_upload(name: str, files: ProjectFiles = editor):
        try:
            await asyncio.to_thread(
                lambda: studio_uploads.remove_file(files, name, studio_catalog.has_checkpoint(files))
            )
        except studio_uploads.UploadError as exc:
            return _coded_error(exc)
        return Response(status_code=204)

    @router.post("/projects/{project_id}/references", status_code=201)
    async def add_reference(body: studio_uploads.ReferenceIn, files: ProjectFiles = editor):
        try:
            entry = await asyncio.to_thread(studio_uploads.add_reference, files, body)
        except studio_uploads.UploadError as exc:
            return _coded_error(exc)
        return JSONResponse(entry, status_code=201)

    @router.delete("/projects/{project_id}/references/{ref_id}", status_code=204)
    async def delete_reference(ref_id: str, files: ProjectFiles = editor):
        try:
            await asyncio.to_thread(
                lambda: studio_uploads.remove_reference(
                    files, ref_id, studio_catalog.has_checkpoint(files)
                )
            )
        except studio_uploads.UploadError as exc:
            return _coded_error(exc)
        return Response(status_code=204)

    # ---- music library ------------------------------------------------

    @router.get("/music")
    async def music() -> dict:
        return {"tracks": await asyncio.to_thread(studio_uploads.list_music)}

    @router.post("/music", status_code=201)
    async def upload_music(request: Request, name: str = Query(min_length=1, max_length=255)):
        try:
            saved = await studio_uploads.save_music(
                name, request.headers.get("content-type"), request.stream(), _declared_size(request)
            )
        except studio_uploads.UploadError as exc:
            return _coded_error(exc)
        tracks = await asyncio.to_thread(studio_uploads.list_music)
        entry = next((t for t in tracks if t["name"] == saved), None)
        if entry is None:
            # Saved, but the library moved (MUSIC_LIBRARY_DIR changed) meanwhile.
            return _coded_error(studio_uploads.UploadError(404, "unknown_track", "no such track"))
        return JSONResponse(entry, status_code=201)

    @router.get("/music/tracks/{name:path}")
    async def music_file(name: str):
        try:
            return FileResponse(studio_uploads.music_track(name))
        except studio_uploads.UploadError as exc:
            return _coded_error(exc)

    # ---- results, cost & settings (Phase 6) ---------------------------

    @router.get("/projects/{project_id}/results")
    async def results(files: ProjectFiles = viewer) -> dict:
        return await asyncio.to_thread(
            lambda: studio_results.list_results(files, files.board_state())
        )

    @router.get("/projects/{project_id}/export")
    async def export(files: ProjectFiles = viewer):
        target = await asyncio.to_thread(
            lambda: studio_results.export_target(files, files.board_state())
        )
        if target is None:
            raise HTTPException(status_code=404, detail="the agent has not exported this video")
        rel, is_folder = target
        if not is_folder:
            path = files.local_file(rel)
            return FileResponse(path, filename=path.name)
        bundle, cleanup = await asyncio.to_thread(files.zip_dir, rel)
        return FileResponse(
            bundle,
            filename=f"{files.project_id}-export.zip",
            media_type="application/zip",
            background=BackgroundTask(cleanup),
        )

    @router.get("/projects/{project_id}/cost")
    async def cost(files: ProjectFiles = viewer) -> dict:
        def build():
            intake = files.read_json(studio_catalog.INTAKE_PATH) or {}
            cap = (intake.get("budget") or {}).get("cap_usd")
            settings = studio_settings.read_settings()["settings"]["budget"]
            data = studio_cost.project_cost(
                files,
                files.board_state().get("stages") or [],
                budget_cap_usd=cap if isinstance(cap, (int, float)) else settings["total_usd"],
            )
            return {**data, "budget_mode": settings["mode"]}

        return await asyncio.to_thread(build)

    @router.get("/cost/summary")
    async def cost_summary(since: str, store: ProjectStore = Depends(get_store)) -> dict:
        try:
            start = datetime.fromisoformat(since.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=422, detail="since must be an ISO date-time") from None
        if start.tzinfo is None:
            raise HTTPException(status_code=422, detail="since needs a time zone")
        return await asyncio.to_thread(studio_cost.spent_since, store, start)

    @router.get("/settings")
    async def get_settings() -> dict:
        return await asyncio.to_thread(studio_settings.read_settings)

    @router.put("/settings")
    async def put_settings(body: studio_settings.SettingsIn) -> dict:
        if os.environ.get("STUDIO_READONLY_CONFIG") == "1":
            raise HTTPException(status_code=403, detail="editing config.yaml is disabled on this server")
        try:
            return await asyncio.to_thread(studio_settings.write_settings, body)
        except studio_settings.SettingsError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from None

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
