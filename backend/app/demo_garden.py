"""The fixed demo garden that public AI features read instead of stored data.

The allocation agent (ADR-0056) and AI Garden Note (ADR-0059) share this one
file. src/lib/demoGarden.test.ts keeps it in step with the browser's demo
garden, so a public draft describes the garden the visitor is looking at.
"""

import json
from importlib import resources


PUBLIC_DEMO_GARDEN_ID = "demo-garden"


def load_demo_garden_data() -> dict:
    return json.loads(resources.files("app").joinpath("demo_garden.json").read_text(encoding="utf-8"))
