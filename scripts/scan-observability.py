"""Scan all pinned operator images; missing or CRITICAL findings block bootstrap."""

import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ci.common import OUTPUT, ROOT, now, run, tool, write_json


def main():
    versions_file = ROOT / "observability/versions.json"
    versions = json.loads(versions_file.read_text(encoding="utf-8"))
    destination = OUTPUT / "observability-images"
    destination.mkdir(parents=True, exist_ok=True)
    receipt = destination / "metadata.json"
    receipt.unlink(missing_ok=True)
    results = {}
    for name, image in versions["images"].items():
        report = destination / (name + ".json")
        report.unlink(missing_ok=True)
        result = run(
            [
                tool("trivy"),
                "image",
                "--image-src",
                "remote",
                "--scanners",
                "vuln",
                "--severity",
                "CRITICAL",
                "--exit-code",
                "1",
                "--format",
                "json",
                "--output",
                report,
                image["reference"],
            ],
            log=destination / (name + ".log"),
            check=False,
        )
        data = json.loads(report.read_text(encoding="utf-8")) if report.is_file() else None
        critical = sum(
            v["Severity"] == "CRITICAL"
            for item in (data or {}).get("Results", [])
            for v in item.get("Vulnerabilities", [])
        )
        valid = bool(
            data and data.get("ArtifactName") == image["reference"] and data.get("Results")
        )
        results[name] = {
            "reference": image["reference"],
            "exit_code": result.returncode,
            "critical": critical,
            "report_valid": valid,
            "report_sha256": hashlib.sha256(report.read_bytes()).hexdigest() if data else None,
        }
    passed = all(
        item["exit_code"] == 0 and item["critical"] == 0 and item["report_valid"]
        for item in results.values()
    )
    write_json(
        receipt,
        {
            "at_utc": now(),
            "versions_sha256": hashlib.sha256(versions_file.read_bytes()).hexdigest(),
            "passed": passed,
            "images": results,
        },
    )
    if not passed:
        raise SystemExit("Operator image gate failed; do not bootstrap this stack")


if __name__ == "__main__":
    main()
