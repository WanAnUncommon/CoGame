from __future__ import annotations

from pathlib import Path
from typing import Any, Iterable

from codex_scan import CODEX_HOME, scan_codex as scan_codex_raw


def _dedupe(items: Iterable[dict[str, Any]], *fields: str) -> list[dict[str, Any]]:
    unique: dict[tuple[str, ...], dict[str, Any]] = {}
    for item in items:
        key = tuple(str(item.get(field, "")).casefold() for field in fields)
        unique.setdefault(key, item)
    return list(unique.values())


def scan_codex(
    project_root: Path | None = None,
    codex_home: Path = CODEX_HOME,
) -> dict[str, Any]:
    data = scan_codex_raw(project_root, codex_home)
    data["skills"] = _dedupe(data.get("skills", []), "path")
    data["plugins"] = _dedupe(data.get("plugins", []), "path")
    return data
