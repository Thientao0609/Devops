import argparse
import signal
import threading

import uvicorn
from fastapi import FastAPI
from fastapi.responses import JSONResponse, Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from sqlalchemy import text

from clinic.db import session
from clinic.telemetry import DEPENDENCY, configure_logging, log


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("role", choices=["publisher", "worker"])
    parser.add_argument("--port", type=int, default=8001)
    args = parser.parse_args()
    configure_logging()
    from clinic import publisher, worker

    stop = threading.Event()
    target = publisher.run if args.role == "publisher" else worker.run
    thread = threading.Thread(target=target, args=(stop,), daemon=True)
    app = FastAPI(title=args.role)

    @app.get("/health")
    def health():
        return JSONResponse(
            {"status": "ok" if thread.is_alive() else "stopped"},
            status_code=200 if thread.is_alive() else 503,
        )

    @app.get("/ready")
    def ready():
        try:
            with session() as db:
                db.execute(text("SELECT 1"))
            rabbit_ready = DEPENDENCY.labels("rabbitmq")._value.get() == 1
            return JSONResponse({"ready": rabbit_ready}, status_code=200 if rabbit_ready else 503)
        except Exception:
            return JSONResponse({"ready": False}, status_code=503)

    @app.get("/metrics")
    def metrics():
        return Response(generate_latest(), headers={"Content-Type": CONTENT_TYPE_LATEST})

    thread.start()
    server = uvicorn.Server(
        uvicorn.Config(app, host="0.0.0.0", port=args.port, access_log=False, log_config=None)
    )

    def shutdown(signum, frame):
        stop.set()
        server.should_exit = True

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    log(args.role, "runtime_started")
    try:
        server.run()
    finally:
        stop.set()
        thread.join(timeout=40)


if __name__ == "__main__":
    main()
