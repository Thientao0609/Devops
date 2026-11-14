import json
from pathlib import Path

import pytest
from clinic.contracts import validate


def test_event_contract():
    event = json.loads(Path("contracts/appointment-created.example.json").read_text())
    validate(event)
    event["patient_email"] = "synthetic@example.test"
    with pytest.raises(ValueError):
        validate(event)
