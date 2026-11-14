import json
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

schema = json.loads(
    (Path(__file__).resolve().parents[2] / "contracts" / "appointment-event.schema.json").read_text(
        encoding="utf-8"
    )
)
validator = Draft202012Validator(schema, format_checker=FormatChecker())


def validate(event):
    errors = list(validator.iter_errors(event))
    if errors:
        raise ValueError("invalid appointment event")
