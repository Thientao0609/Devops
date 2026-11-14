"""Promote scanned digests; fails closed until real Mốc3 overlays/credentials exist."""

import argparse
import json
import os
import re

from ci.common import OUTPUT, ROOT, commit, read_json, run, write_json


def json_objects(content):
    decoder = json.JSONDecoder()
    remaining = content.lstrip()
    while remaining:
        item, offset = decoder.raw_decode(remaining)
        yield from item["items"] if item.get("kind") == "List" else [item]
        remaining = remaining[offset:].lstrip()


def render_release(resources, manifest, namespace):
    references = {
        item["tag"].rsplit(":", 1)[0]: item["reference"] for item in manifest["images"].values()
    }
    count = 0

    def walk(value):
        nonlocal count
        if isinstance(value, dict):
            for key, child in value.items():
                if key in {"containers", "initContainers"}:
                    for container in child:
                        source = container["image"]
                        repository = source.split("@", 1)[0].rsplit(":", 1)[0]
                        if repository not in references:
                            raise ValueError(
                                "Workload contains an image not covered by the scanned release"
                            )
                        container["image"] = references[repository]
                        count += 1
                else:
                    walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)

    for resource in resources:
        if resource.get("kind") in {
            "Namespace",
            "ClusterRole",
            "ClusterRoleBinding",
            "CustomResourceDefinition",
        }:
            raise ValueError("Cluster bootstrap does not belong to the application deployer")
        if resource.get("metadata", {}).get("namespace") != namespace:
            raise ValueError("Overlay must declare the correct deployment namespace")
        walk(resource.get("spec", {}))
    if not count:
        raise ValueError("Overlay has no release workload")
    return {"apiVersion": "v1", "kind": "List", "items": resources}


def deploy(namespace):
    if os.environ.get("CLINIC_IS_PR", "false").lower() == "true":
        raise ValueError("PR builds cannot deploy")
    overlay = ROOT / "deploy/k8s/overlays" / namespace
    if not overlay.is_dir():
        raise RuntimeError(
            "Mốc3 Kubernetes overlays do not exist; deployment is blocked, not passed"
        )
    manifest = read_json(OUTPUT / "release-manifest.json")
    if manifest["commit"] != commit():
        raise ValueError("Release manifest does not match the verified checkout")
    for item in manifest["images"].values():
        if not re.fullmatch(r"ghcr\.io/[^@]+@sha256:[a-f0-9]{64}", item["reference"]):
            raise ValueError("Immutable registry digests are required")
    rendered = run(["kubectl", "create", "--dry-run=client", "-k", overlay, "-o", "json"]).stdout
    release = render_release(list(json_objects(rendered)), manifest, namespace)
    release_file = OUTPUT / ("rendered-" + namespace + ".json")
    write_json(release_file, release)
    run(
        ["kubectl", "-n", namespace, "apply", "--dry-run=server", "-f", release_file],
        log=OUTPUT / (namespace + "-dry-run.log"),
    )
    run(
        ["kubectl", "-n", namespace, "apply", "-f", release_file],
        log=OUTPUT / (namespace + "-apply.log"),
    )
    for resource in release["items"]:
        if resource["kind"] in {"Deployment", "StatefulSet"}:
            target = resource["kind"].lower() + "/" + resource["metadata"]["name"]
            run(
                ["kubectl", "-n", namespace, "rollout", "status", target, "--timeout=180s"],
                log=OUTPUT / (namespace + "-" + resource["metadata"]["name"] + "-rollout.log"),
            )
    # A successful rollout alone is not business smoke evidence.
    run([os.sys.executable, "-m", "ci.smoke", namespace], log=OUTPUT / (namespace + "-smoke.log"))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("namespace", choices=["staging", "production"])
    deploy(parser.parse_args().namespace)
