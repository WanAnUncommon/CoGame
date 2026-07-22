from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import struct
import subprocess
from pathlib import Path
from typing import Any
from urllib.parse import quote


SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
IMAGE_LIKE_EXTENSIONS = SUPPORTED_EXTENSIONS | {".avif", ".bmp", ".gif", ".svg"}
MAX_IMAGE_BYTES = 16 * 1024 * 1024
MAX_IMAGE_EDGE = 16_384
MAX_IMAGE_PIXELS = 50_000_000
RESULT_PREFIX = "COGAME_RESULT:"


class SkinError(Exception):
    pass


class SkinNotFoundError(SkinError):
    pass


class SkinValidationError(SkinError):
    pass


class RuntimeUnavailableError(SkinError):
    def __init__(self, message: str, status: dict[str, Any]):
        super().__init__(message)
        self.status = status


class SkinActionError(SkinError):
    pass


def _skin_id(filename: str) -> str:
    digest = hashlib.sha256(filename.casefold().encode("utf-8")).hexdigest()
    return digest[:16]


def _default_name(path: Path) -> str:
    name = re.sub(r"[-_]+", " ", path.stem).strip()
    return name or path.name


def _inside(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def _read_png_dimensions(path: Path) -> tuple[int, int]:
    with path.open("rb") as handle:
        header = handle.read(24)
    if len(header) < 24 or header[:8] != b"\x89PNG\r\n\x1a\n" or header[12:16] != b"IHDR":
        raise SkinValidationError("PNG 文件头无效")
    return struct.unpack(">II", header[16:24])


def _read_jpeg_dimensions(path: Path) -> tuple[int, int]:
    sof_markers = {
        0xC0,
        0xC1,
        0xC2,
        0xC3,
        0xC5,
        0xC6,
        0xC7,
        0xC9,
        0xCA,
        0xCB,
        0xCD,
        0xCE,
        0xCF,
    }
    with path.open("rb") as handle:
        if handle.read(2) != b"\xff\xd8":
            raise SkinValidationError("JPEG 文件头无效")
        while True:
            byte = handle.read(1)
            while byte and byte != b"\xff":
                byte = handle.read(1)
            if not byte:
                break
            marker = handle.read(1)
            while marker == b"\xff":
                marker = handle.read(1)
            if not marker:
                break
            code = marker[0]
            if code in {0x01, 0xD8, 0xD9} or 0xD0 <= code <= 0xD7:
                continue
            raw_length = handle.read(2)
            if len(raw_length) != 2:
                break
            length = struct.unpack(">H", raw_length)[0]
            if length < 2:
                break
            if code in sof_markers:
                frame = handle.read(5)
                if len(frame) != 5:
                    break
                height, width = struct.unpack(">HH", frame[1:5])
                return width, height
            handle.seek(length - 2, os.SEEK_CUR)
    raise SkinValidationError("无法读取 JPEG 尺寸")


def _read_webp_dimensions(path: Path) -> tuple[int, int]:
    with path.open("rb") as handle:
        header = handle.read(30)
    if len(header) < 30 or header[:4] != b"RIFF" or header[8:12] != b"WEBP":
        raise SkinValidationError("WebP 文件头无效")
    chunk = header[12:16]
    if chunk == b"VP8X":
        width = 1 + int.from_bytes(header[24:27], "little")
        height = 1 + int.from_bytes(header[27:30], "little")
        return width, height
    if chunk == b"VP8L" and header[20] == 0x2F:
        bits = int.from_bytes(header[21:25], "little")
        return 1 + (bits & 0x3FFF), 1 + ((bits >> 14) & 0x3FFF)
    if chunk == b"VP8 " and header[23:26] == b"\x9d\x01\x2a":
        width = int.from_bytes(header[26:28], "little") & 0x3FFF
        height = int.from_bytes(header[28:30], "little") & 0x3FFF
        return width, height
    raise SkinValidationError("无法读取 WebP 尺寸")


def read_image_dimensions(path: Path) -> tuple[int, int]:
    extension = path.suffix.lower()
    if extension == ".png":
        return _read_png_dimensions(path)
    if extension in {".jpg", ".jpeg"}:
        return _read_jpeg_dimensions(path)
    if extension == ".webp":
        return _read_webp_dimensions(path)
    raise SkinValidationError("仅支持 PNG、JPEG 和 WebP")


def _load_manifest(skin_dir: Path) -> tuple[dict[str, Any], list[str]]:
    manifest_path = skin_dir / "skins.json"
    if not manifest_path.is_file():
        return {}, []
    try:
        resolved = manifest_path.resolve(strict=True)
        if _is_reparse_point(manifest_path) or not _inside(resolved, skin_dir):
            raise ValueError("文件不能是链接或位于皮肤目录外")
        payload = json.loads(resolved.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("根节点必须是对象")
        return payload, []
    except (OSError, UnicodeError, ValueError, json.JSONDecodeError) as exc:
        return {}, [f"skins.json 无法读取：{exc}"]


def _metadata_for(manifest: dict[str, Any], filename: str) -> dict[str, str]:
    value = manifest.get(filename, {})
    if not isinstance(value, dict):
        value = {}
    return {
        "name": str(value.get("name") or "").strip()[:80],
        "description": str(value.get("description") or "").strip()[:240],
        "source": str(value.get("source") or "").strip()[:80],
    }


def scan_skin_catalog(root: Path) -> dict[str, Any]:
    static_dir = (root / "static").resolve()
    skin_path = root / "static" / "skins"
    skin_path.mkdir(parents=True, exist_ok=True)
    skin_dir = skin_path.resolve()
    if _is_reparse_point(skin_path) or not _inside(skin_dir, static_dir):
        return {"skins": [], "warnings": ["皮肤目录不能是链接或位于 static 目录外"]}
    manifest, warnings = _load_manifest(skin_dir)
    skins: list[dict[str, Any]] = []

    for candidate in sorted(skin_dir.iterdir(), key=lambda item: item.name.casefold()):
        extension = candidate.suffix.lower()
        if extension not in IMAGE_LIKE_EXTENSIONS or not candidate.is_file():
            continue
        error = ""
        width = 0
        height = 0
        size = 0
        try:
            resolved = candidate.resolve(strict=True)
            if _is_reparse_point(candidate) or not _inside(resolved, skin_dir):
                raise SkinValidationError("皮肤文件不能是链接或位于皮肤目录外")
            size = resolved.stat().st_size
            if size < 1:
                raise SkinValidationError("图片文件为空")
            if size > MAX_IMAGE_BYTES:
                raise SkinValidationError("图片超过 16 MB")
            width, height = read_image_dimensions(resolved)
            if width < 1 or height < 1:
                raise SkinValidationError("图片尺寸无效")
            if width > MAX_IMAGE_EDGE or height > MAX_IMAGE_EDGE:
                raise SkinValidationError("图片宽或高超过 16384 像素")
            if width * height > MAX_IMAGE_PIXELS:
                raise SkinValidationError("图片总像素超过 5000 万")
        except (OSError, SkinValidationError) as exc:
            error = str(exc)

        metadata = _metadata_for(manifest, candidate.name)
        try:
            modified_ns = candidate.stat().st_mtime_ns
        except OSError as exc:
            modified_ns = 0
            error = error or f"读取文件状态失败：{exc}"
        valid = not error
        skins.append(
            {
                "id": _skin_id(candidate.name),
                "filename": candidate.name,
                "name": metadata["name"] or _default_name(candidate),
                "description": metadata["description"] or "项目皮肤目录中的本地背景",
                "source": metadata["source"] or "本地资源",
                "format": extension.removeprefix(".").upper().replace("JPEG", "JPG"),
                "width": width,
                "height": height,
                "size_bytes": size,
                "valid": valid,
                "error": error,
                "url": f"/skins/{quote(candidate.name)}?v={modified_ns}" if valid else None,
                "modified_ns": modified_ns,
            }
        )

    return {"skins": skins, "warnings": warnings}


def find_skin(root: Path, skin_id: str) -> dict[str, Any]:
    catalog = scan_skin_catalog(root)
    for skin in catalog["skins"]:
        if skin["id"] == skin_id:
            if not skin["valid"]:
                raise SkinValidationError(skin["error"] or "皮肤文件无效")
            return skin
    raise SkinNotFoundError("未找到该皮肤，可能已被移动或删除")


def _run_probe(command: list[str], timeout: int = 8) -> str:
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except (OSError, subprocess.SubprocessError):
        return ""
    return result.stdout.strip() if result.returncode == 0 else ""


def _node_status() -> tuple[str | None, int | None]:
    executable = shutil.which("node")
    if not executable:
        return None, None
    output = _run_probe([executable, "--version"])
    match = re.fullmatch(r"v?(\d+)(?:\.\d+){0,2}", output)
    return (output or None), (int(match.group(1)) if match else None)


def _codex_version(powershell: str | None) -> str | None:
    if not powershell:
        return None
    command = (
        "[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);"
        "$package=Get-AppxPackage -Name OpenAI.Codex -ErrorAction SilentlyContinue;"
        "if($null -ne $package){$package.Version.ToString()}"
    )
    return _run_probe([powershell, "-NoProfile", "-NonInteractive", "-Command", command]) or None


def _is_reparse_point(path: Path) -> bool:
    try:
        attributes = os.lstat(path).st_file_attributes
    except (AttributeError, OSError):
        return path.is_symlink()
    return bool(attributes & 0x400)


def dream_skin_status() -> dict[str, Any]:
    powershell = shutil.which("powershell.exe") or shutil.which("powershell")
    node_version, node_major = _node_status()
    codex_version = _codex_version(powershell)
    local_app_data = os.environ.get("LOCALAPPDATA")
    state_root = Path(local_app_data) / "CodexDreamSkin" if local_app_data else None
    engine = state_root / "engine" if state_root else None
    runtime_scripts = engine / "scripts" if engine else None
    scripts = {
        "theme": runtime_scripts / "theme-windows.ps1" if runtime_scripts else None,
        "start": runtime_scripts / "start-dream-skin.ps1" if runtime_scripts else None,
        "restore": runtime_scripts / "restore-dream-skin.ps1" if runtime_scripts else None,
    }
    runtime_directories = [state_root, engine, runtime_scripts]
    runtime_installed = bool(
        state_root
        and all(
            path and path.is_dir() and not _is_reparse_point(path)
            for path in runtime_directories
        )
        and all(
            path and path.is_file() and not _is_reparse_point(path)
            for path in scripts.values()
        )
    )
    requirements: list[str] = []
    if not powershell:
        requirements.append("未找到 Windows PowerShell")
    if node_major is None:
        requirements.append("未找到 Node.js 22+")
    elif node_major < 22:
        requirements.append(f"Node.js 版本过低：{node_version}，需要 22+")
    if not codex_version:
        requirements.append("未检测到当前用户的官方 Codex Store 应用")
    if not runtime_installed:
        requirements.append("未安装 Codex Dream Skin 运行时")

    active_theme: dict[str, str] | None = None
    if state_root:
        theme_path = state_root / "active-theme" / "theme.json"
        try:
            payload = json.loads(theme_path.read_text(encoding="utf-8"))
            if isinstance(payload, dict):
                active_theme = {
                    "id": str(payload.get("id") or ""),
                    "name": str(payload.get("name") or "当前主题"),
                }
        except (OSError, UnicodeError, ValueError, json.JSONDecodeError):
            pass

    ready = not requirements
    return {
        "ready": ready,
        "powershell": powershell,
        "node_version": node_version,
        "node_major": node_major,
        "codex_installed": bool(codex_version),
        "codex_version": codex_version,
        "runtime_installed": runtime_installed,
        "state_root": str(state_root) if state_root else None,
        "engine": str(engine) if engine else None,
        "session_configured": bool(state_root and (state_root / "state.json").is_file()),
        "active_theme": active_theme,
        "requirements": requirements,
    }

def public_dream_skin_status(status: dict[str, Any] | None = None) -> dict[str, Any]:
    current = status or dream_skin_status()
    keys = {
        "ready",
        "node_version",
        "node_major",
        "codex_installed",
        "codex_version",
        "runtime_installed",
        "session_configured",
        "active_theme",
        "requirements",
    }
    return {key: current.get(key) for key in keys}


def _bridge_command(
    root: Path,
    action: str,
    status: dict[str, Any],
    skin_id: str | None = None,
    image_path: Path | None = None,
    name: str | None = None,
    restart_existing: bool = False,
) -> list[str]:
    powershell = status.get("powershell")
    if not powershell:
        raise RuntimeUnavailableError("Windows PowerShell 不可用", status)
    command = [
        str(powershell),
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "RemoteSigned",
        "-File",
        str((root / "scripts" / "apply_dream_skin.ps1").resolve()),
        "-Action",
        action,
    ]
    if skin_id:
        command.extend(["-SkinId", skin_id])
    if image_path is not None:
        command.extend(["-ImagePath", str(image_path.resolve())])
    if name:
        command.extend(["-Name", name])
    if restart_existing:
        command.append("-RestartExisting")
    return command


def _run_bridge(command: list[str]) -> dict[str, Any]:
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=120,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except subprocess.TimeoutExpired as exc:
        raise SkinActionError("Dream Skin 操作超时") from exc
    except OSError as exc:
        raise SkinActionError(f"无法启动 Dream Skin：{exc}") from exc

    combined = "\n".join(part for part in (result.stdout, result.stderr) if part).strip()
    payload: dict[str, Any] | None = None
    for line in reversed(combined.splitlines()):
        if line.startswith(RESULT_PREFIX):
            try:
                candidate = json.loads(line[len(RESULT_PREFIX) :])
                if isinstance(candidate, dict):
                    payload = candidate
            except json.JSONDecodeError:
                pass
            break
    if result.returncode != 0:
        detail = combined[-2000:] if combined else f"退出码 {result.returncode}"
        raise SkinActionError(f"Dream Skin 操作失败：{detail}")
    return payload or {"ok": True, "message": "Dream Skin 操作已完成"}


def apply_skin(root: Path, skin_id: str, restart_existing: bool) -> dict[str, Any]:
    skin = find_skin(root, skin_id)
    status = dream_skin_status()
    if not status["ready"]:
        raise RuntimeUnavailableError("运行环境未就绪", status)
    image_path = root / "static" / "skins" / skin["filename"]
    command = _bridge_command(
        root,
        "Apply",
        status,
        skin_id=skin["id"],
        image_path=image_path,
        name=skin["name"],
        restart_existing=restart_existing,
    )
    result = _run_bridge(command)
    result["skin"] = skin
    return result


def restore_skin(root: Path, restart_existing: bool) -> dict[str, Any]:
    status = dream_skin_status()
    if not status["ready"]:
        raise RuntimeUnavailableError("运行环境未就绪", status)
    if not restart_existing:
        raise SkinValidationError("恢复官方外观需要确认允许重启 Codex")
    command = _bridge_command(root, "Restore", status, restart_existing=True)
    return _run_bridge(command)
