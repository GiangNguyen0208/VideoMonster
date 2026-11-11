"""Backlot CLI.

    python -m backlot open [project-id]   # start server if needed, open browser
    python -m backlot open --studio       # same, but open the Studio app
    python -m backlot serve [--port N]    # run the server in the foreground
    python -m backlot await-decision <project-id> [stage] [--timeout S]
                                          # agent: wait for a Studio review decision
    python -m backlot consume-decision <project-id> <decision-id>
                                          # agent: mark a Studio decision applied

``open`` is idempotent and non-fatal by design: agents call it at pipeline
initialization and must continue the production even if it fails.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
import urllib.request
import webbrowser

from backlot import DEFAULT_PORT


def _port() -> int:
    try:
        return int(os.environ.get("BACKLOT_PORT", DEFAULT_PORT))
    except ValueError:
        return DEFAULT_PORT


def _server_alive(port: int) -> bool:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=1.5) as resp:
            return resp.status == 200
    except Exception:
        return False


def _spawn_server(port: int) -> None:
    """Start the server as a detached background process."""
    cmd = [sys.executable, "-m", "backlot", "serve", "--port", str(port)]
    kwargs: dict = {
        "stdout": subprocess.DEVNULL,
        "stderr": subprocess.DEVNULL,
        "stdin": subprocess.DEVNULL,
    }
    if os.name == "nt":
        kwargs["creationflags"] = (
            subprocess.CREATE_NEW_PROCESS_GROUP | getattr(subprocess, "DETACHED_PROCESS", 0x00000008)
        )
    else:
        kwargs["start_new_session"] = True
    subprocess.Popen(cmd, **kwargs)


def cmd_open(project_id: str | None, studio: bool = False) -> int:
    port = _port()
    if not _server_alive(port):
        try:
            _spawn_server(port)
        except Exception as exc:
            print(f"backlot: could not start server ({exc}) — continuing without the board")
            return 1
        deadline = time.time() + 15
        while time.time() < deadline:
            if _server_alive(port):
                break
            time.sleep(0.4)
        else:
            print("backlot: server did not come up in time — continuing without the board")
            return 1
    base = f"http://127.0.0.1:{port}"
    if studio:
        url = f"{base}/studio/p/{project_id}" if project_id else f"{base}/studio"
    elif project_id:
        url = f"{base}/p/{project_id}"
    else:
        url = f"{base}/"
    try:
        webbrowser.open(url)
    except Exception:
        pass
    print(f"backlot: {url}")
    return 0


def cmd_serve(port: int) -> int:
    import uvicorn

    uvicorn.run("backlot.server:app", host="127.0.0.1", port=port, log_level="warning")
    return 0


def _project_files(project_id: str):
    from backlot.project_store import DiskProjectStore, ProjectStoreError
    from backlot.state import PROJECTS_DIR

    try:
        return DiskProjectStore(PROJECTS_DIR).files(project_id)
    except ProjectStoreError:
        return None


def cmd_await_decision(project_id: str, stage: str | None, timeout: float, poll: float = 1.0) -> int:
    """Block until a Studio decision matches the current review point.

    Exit codes: 0 = decision printed as JSON, 2 = timed out, 3 = bad project.
    Read-only: the agent applies the decision, then runs consume-decision.
    """
    import json

    from backlot.studio_decisions import pending_for

    files = _project_files(project_id)
    if files is None:
        print(f"await-decision: unknown project {project_id!r}", file=sys.stderr)
        return 3
    deadline = time.monotonic() + max(0.0, timeout)
    while True:
        decision = pending_for(files, stage)
        if decision:
            print(json.dumps(decision, indent=2, ensure_ascii=False))
            return 0
        if time.monotonic() >= deadline:
            where = f"stage {stage!r}" if stage else "any review point"
            print(
                f"await-decision: no Studio decision for {where} of {project_id} "
                f"after {timeout:g}s. Ask the user to review in Studio or reply in chat.",
                file=sys.stderr,
            )
            return 2
        time.sleep(poll)


def cmd_consume_decision(project_id: str, decision_id: str) -> int:
    from backlot.studio_decisions import DecisionError, consume

    files = _project_files(project_id)
    if files is None:
        print(f"consume-decision: unknown project {project_id!r}", file=sys.stderr)
        return 3
    try:
        name = consume(files, decision_id)
    except DecisionError as exc:
        print(f"consume-decision: {exc.detail}", file=sys.stderr)
        return 3
    print(f"consume-decision: {name}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="backlot", description=__doc__)
    sub = parser.add_subparsers(dest="command")

    p_open = sub.add_parser("open", help="open the board in the browser (starts server if needed)")
    p_open.add_argument("project_id", nargs="?", default=None)
    p_open.add_argument("--studio", action="store_true", help="open the Studio app instead of the classic board")

    p_serve = sub.add_parser("serve", help="run the Backlot server in the foreground")
    p_serve.add_argument("--port", type=int, default=_port())

    p_wait = sub.add_parser("await-decision", help="wait for a Studio review decision (agent use)")
    p_wait.add_argument("project_id")
    p_wait.add_argument("stage", nargs="?", default=None)
    p_wait.add_argument("--timeout", type=float, default=3600, help="seconds; 0 = check once")

    p_consume = sub.add_parser("consume-decision", help="mark a Studio decision applied (agent use)")
    p_consume.add_argument("project_id")
    p_consume.add_argument("decision_id")

    args = parser.parse_args(argv)
    if args.command == "open":
        return cmd_open(args.project_id, studio=args.studio)
    if args.command == "serve":
        return cmd_serve(args.port)
    if args.command == "await-decision":
        return cmd_await_decision(args.project_id, args.stage, args.timeout)
    if args.command == "consume-decision":
        return cmd_consume_decision(args.project_id, args.decision_id)
    parser.print_help()
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
