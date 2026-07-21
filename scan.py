from __future__ import annotations

import json
from pathlib import Path

from codex_scan import (
    CODEX_HOME,
    find_agents_files,
    load_toml,
    read_skill_frontmatter,
    scan_automations,
    scan_mcp_servers,
    scan_plugins,
    scan_skills,
)
from state_scan import scan_codex


__all__ = [
    "CODEX_HOME",
    "find_agents_files",
    "load_toml",
    "read_skill_frontmatter",
    "scan_automations",
    "scan_codex",
    "scan_mcp_servers",
    "scan_plugins",
    "scan_skills",
]


if __name__ == "__main__":
    print(json.dumps(scan_codex(Path.cwd()), ensure_ascii=False, indent=2, default=str))
