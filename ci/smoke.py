"""Real HTTPS appointment/email smoke for a configured Mốc3 namespace; no mock success."""

import argparse
import json
import os
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid


def smoke(namespace):
    base = os.environ.get("CLINIC_SMOKE_URL", "").rstrip("/")
    if not base.startswith("https://"):
        raise ValueError("Set CLINIC_SMOKE_URL to the trusted HTTPS URL of the namespace")
    password = os.environ.get("CLINIC_SMOKE_PASSWORD")
    email = os.environ.get("CLINIC_SMOKE_EMAIL")
    if not password or not email or not email.endswith(".test"):
        raise ValueError("Provide a synthetic .test smoke account through Jenkins Credentials")
    context = ssl.create_default_context(cafile=os.environ.get("CLINIC_SMOKE_CA_FILE"))

    def request(path, *, data=None, token=None, key=None):
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = "Bearer " + token
        if key:
            headers["Idempotency-Key"] = key
        body = json.dumps(data).encode() if data is not None else None
        query = urllib.request.Request(base + path, data=body, headers=headers)
        try:
            with urllib.request.urlopen(query, timeout=15, context=context) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            raise RuntimeError(
                f"Smoke HTTP{error.code}; response body and credentials withheld"
            ) from None

    token = request("/api/auth/login", data={"email": email, "password": password})["access_token"]
    doctors = request("/api/doctors", token=token)
    selected = None
    for doctor in doctors:
        slots = request(
            "/api/doctors/" + urllib.parse.quote(doctor["id"], safe="") + "/slots", token=token
        )
        if slots:
            selected = slots[0]
            break
    if not selected:
        raise RuntimeError("No synthetic future slot available for smoke")
    appointment = request(
        "/api/appointments",
        data={"slot_id": selected["id"], "reminder_enabled": False},
        token=token,
        key="smoke-" + uuid.uuid4().hex,
    )
    try:
        for _ in range(30):
            state = request("/api/appointments/" + appointment["id"], token=token)
            if state["notification_status"] == "SENT":
                print(
                    json.dumps(
                        {
                            "namespace": namespace,
                            "appointment_id": appointment["id"],
                            "notification_status": "SENT",
                            "scope": "Provider accepted delivery; external mailbox receipt is a separate check",
                        }
                    )
                )
                break
            if state["notification_status"] == "FAILED_DLQ":
                raise RuntimeError("Notification entered DLQ")
            time.sleep(2)
        else:
            raise TimeoutError("Notification did not reach SENT within60seconds")
    finally:
        request("/api/appointments/" + appointment["id"] + "/cancel", data={}, token=token)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("namespace", choices=["staging", "production"])
    smoke(parser.parse_args().namespace)
