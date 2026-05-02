from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path

from import_excel import OFFICIALS_PATH, build_positions, normalize_text

HINTS_PATH = Path(__file__).resolve().parent.parent / "data" / "enrich_hints.json"


def extract_excel_positions(detail: str) -> str:
    match = re.search(r"曾任职务[:：]\s*(.+?)(?:\s+处理结果[:：]|$)", str(detail or ""))
    return normalize_text(match.group(1)) if match else ""


def has_excel_source(item: dict) -> bool:
    return any(source.get("type") == "excel" for source in item.get("sources", []))


def load_hint_keys() -> set[tuple[str, str]]:
    if not HINTS_PATH.exists():
        return set()
    hints = json.loads(HINTS_PATH.read_text("utf-8"))
    return {(hint.get("name", ""), hint.get("region", "")) for hint in hints}


def should_preserve_curated_profile(item: dict, hint_keys: set[tuple[str, str]]) -> bool:
    return (item.get("name", ""), item.get("region", "")) in hint_keys


def main() -> None:
    officials = json.loads(OFFICIALS_PATH.read_text("utf-8"))
    changed = 0
    hint_keys = load_hint_keys()

    for item in officials:
        if not has_excel_source(item):
            continue
        if should_preserve_curated_profile(item, hint_keys):
            continue
        positions = extract_excel_positions(item.get("detail", ""))
        if not positions:
            continue

        last_position, previous_positions = build_positions(positions, item.get("region", ""))
        if not last_position:
            continue

        before = json.dumps(
            {
                "lastPosition": item.get("lastPosition", ""),
                "previousPositions": item.get("previousPositions", []),
                "detail": item.get("detail", ""),
            },
            ensure_ascii=False,
            sort_keys=True,
        )

        corrected_positions = "，".join([*previous_positions, last_position])
        item["lastPosition"] = last_position
        item["previousPositions"] = previous_positions
        item["detail"] = re.sub(
            r"(曾任职务[:：]\s*)(.+?)(?=\s+处理结果[:：]|$)",
            lambda match: f"{match.group(1)}{corrected_positions}",
            item.get("detail", ""),
        )
        item["updatedAt"] = datetime.now().isoformat()

        after = json.dumps(
            {
                "lastPosition": item.get("lastPosition", ""),
                "previousPositions": item.get("previousPositions", []),
                "detail": item.get("detail", ""),
            },
            ensure_ascii=False,
            sort_keys=True,
        )

        if before != after:
            changed += 1
            print(f"已修正：{item.get('name','')}")

    OFFICIALS_PATH.write_text(json.dumps(officials, ensure_ascii=False, indent=2), "utf-8")
    print(json.dumps({"changed": changed}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
