from __future__ import annotations

import json
import os
import re
import tomllib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlparse


CODEX_HOME = Path(
    os.environ.get("CODEX_HOME", Path.home() / ".codex")
).expanduser()


def load_toml(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    with path.open("rb") as file:
        return tomllib.load(file)


def read_skill_frontmatter(path: Path) -> dict[str, str]:
    """Read the simple name and description fields from SKILL.md."""
    text = path.read_text(encoding="utf-8", errors="replace")
    result = {"name": path.parent.name, "description": ""}
    if not text.startswith("---"):
        return result

    parts = text.split("---", 2)
    if len(parts) < 3:
        return result

    for key in ("name", "description"):
        match = re.search(
            rf"(?m)^\s*{key}\s*:\s*[\"']?(.*?)[\"']?\s*$",
            parts[1],
        )
        if match:
            result[key] = match.group(1).strip()
    return result


def _relative_path(path: Path, root: Path) -> str:
    try:
        return str(path.resolve().relative_to(root.resolve()))
    except (OSError, ValueError):
        return path.name


def _skill_source(path: Path) -> str:
    lowered = {part.lower() for part in path.parts}
    if "plugins" in lowered:
        return "plugin"
    if ".system" in lowered:
        return "system"
    return "user"


def scan_skills(codex_home: Path = CODEX_HOME) -> list[dict[str, Any]]:
    skill_files: set[Path] = set()
    for root in (codex_home / "skills", codex_home / "plugins"):
        if not root.is_dir():
            continue
        try:
            skill_files.update(root.rglob("SKILL.md"))
        except OSError:
            continue

    skills = []
    for skill_file in skill_files:
        try:
            skills.append({
                **read_skill_frontmatter(skill_file),
                "source": _skill_source(skill_file),
                "path": _relative_path(skill_file, codex_home),
                "status": "ready",
            })
        except OSError as exc:
            skills.append({
                "name": skill_file.parent.name,
                "description": "",
                "source": _skill_source(skill_file),
                "path": _relative_path(skill_file, codex_home),
                "status": "error",
                "error": str(exc),
            })
    return sorted(skills, key=lambda item: item["name"].casefold())


def _url_label(value: Any) -> str | None:
    if not isinstance(value, str) or not value:
        return None
    parsed = urlparse(value)
    return parsed.netloc or parsed.path or None


def scan_mcp_servers(codex_home: Path = CODEX_HOME) -> list[dict[str, Any]]:
    servers = load_toml(codex_home / "config.toml").get("mcp_servers", {})
    if not isinstance(servers, dict):
        return []

    result = []
    for name, settings in servers.items():
        if not isinstance(settings, dict):
            continue
        env = settings.get("env", {})
        command = settings.get("command")
        enabled = bool(settings.get("enabled", True))
        result.append({
            "name": str(name),
            "transport": "http" if settings.get("url") else "stdio",
            "endpoint": _url_label(settings.get("url")),
            "command": Path(command).name if isinstance(command, str) else None,
            "enabled": enabled,
            "env_keys": sorted(env.keys()) if isinstance(env, dict) else [],
            "status": "ready" if enabled else "disabled",
        })
    return sorted(result, key=lambda item: item["name"].casefold())


def scan_plugins(codex_home: Path = CODEX_HOME) -> list[dict[str, Any]]:
    plugin_settings = load_toml(codex_home / "config.toml").get("plugins", {})
    if not isinstance(plugin_settings, dict):
        plugin_settings = {}

    root = codex_home / "plugins"
    if not root.is_dir():
        return []

    plugins = []
    try:
        manifests = root.glob("**/.codex-plugin/plugin.json")
        for manifest_path in manifests:
            try:
                manifest = json.loads(
                    manifest_path.read_text(encoding="utf-8", errors="replace")
                )
                name = str(manifest.get("name") or manifest_path.parent.parent.name)
                matching = plugin_settings.get(name, {})
                enabled = matching.get("enabled") if isinstance(matching, dict) else None
                plugins.append({
                    "name": name,
                    "version": manifest.get("version"),
                    "description": manifest.get("description", ""),
                    "enabled": enabled,
                    "path": _relative_path(manifest_path, codex_home),
                    "status": "ready" if enabled is not False else "disabled",
                })
            except (OSError, json.JSONDecodeError) as exc:
                plugins.append({
                    "name": manifest_path.parent.parent.name,
                    "version": None,
                    "description": "",
                    "enabled": None,
                    "path": _relative_path(manifest_path, codex_home),
                    "status": "error",
                    "error": str(exc),
                })
    except OSError:
        return []
    return sorted(plugins, key=lambda item: item["name"].casefold())


def scan_automations(codex_home: Path = CODEX_HOME) -> list[dict[str, Any]]:
    root = codex_home / "automations"
    if not root.is_dir():
        return []

    automations = []
    try:
        configs = root.glob("*/automation.toml")
        for config_path in configs:
            try:
                config = load_toml(config_path)
                automations.append({
                    "id": str(config.get("id") or config_path.parent.name),
                    "name": str(config.get("name") or config_path.parent.name),
                    "status": str(config.get("status") or "active"),
                    "kind": str(config.get("kind") or "scheduled"),
                    "schedule": config.get("rrule"),
                    "path": _relative_path(config_path, codex_home),
                })
            except (OSError, tomllib.TOMLDecodeError) as exc:
                automations.append({
                    "id": config_path.parent.name,
                    "name": config_path.parent.name,
                    "status": "error",
                    "kind": "unknown",
                    "schedule": None,
                    "path": _relative_path(config_path, codex_home),
                    "error": str(exc),
                })
    except OSError:
        return []
    return sorted(automations, key=lambda item: item["name"].casefold())


def find_agents_files(
    project_root: Path | None = None,
    target_dir: Path | None = None,
    codex_home: Path = CODEX_HOME,
) -> list[dict[str, str]]:
    """Find applicable AGENTS.md files without returning their contents."""
    result = []
    global_agents = codex_home / "AGENTS.md"
    if global_agents.is_file():
        result.append({
            "scope": "global",
            "name": "Global rules",
            "path": _relative_path(global_agents, codex_home),
        })

    if project_root is None:
        return result

    project_root = project_root.resolve()
    target_dir = (target_dir or project_root).resolve()
    try:
        relative = target_dir.relative_to(project_root)
    except ValueError as exc:
        raise ValueError("target_dir must be inside project_root") from exc

    directories = [project_root]
    current = project_root
    for part in relative.parts:
        current = current / part
        directories.append(current)

    for directory in directories:
        agents_file = directory / "AGENTS.md"
        if agents_file.is_file():
            result.append({
                "scope": "project",
                "name": directory.name or "Project rules",
                "path": str(agents_file.relative_to(project_root)),
            })
    return result


def _capture(
    label: str,
    operation: Callable[[], list[dict[str, Any]]],
    errors: list[dict[str, str]],
) -> list[dict[str, Any]]:
    try:
        return operation()
    except (OSError, tomllib.TOMLDecodeError, ValueError) as exc:
        errors.append({"source": label, "message": str(exc)})
        return []


def scan_codex(
    project_root: Path | None = None,
    codex_home: Path = CODEX_HOME,
) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    skills = _capture("skills", lambda: scan_skills(codex_home), errors)
    mcp_servers = _capture("mcp_servers", lambda: scan_mcp_servers(codex_home), errors)
    plugins = _capture("plugins", lambda: scan_plugins(codex_home), errors)
    automations = _capture("automations", lambda: scan_automations(codex_home), errors)
    agents = _capture(
        "agents",
        lambda: find_agents_files(project_root, codex_home=codex_home),
        errors,
    )
    return {
        "scanned_at": datetime.now(timezone.utc).isoformat(),
        "project": project_root.name if project_root else None,
        "skills": skills,
        "mcp_servers": mcp_servers,
        "plugins": plugins,
        "automations": automations,
        "agents": agents,
        "errors": errors,
    }


if __name__ == "__main__":
    print(json.dumps(scan_codex(Path.cwd()), ensure_ascii=False, indent=2, default=str))
