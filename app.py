from __future__ import annotations

import argparse
import hashlib
import hmac
import ipaddress
import json
import os
import secrets
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from codex_scan import CODEX_HOME
from dream_skin import (
    RuntimeUnavailableError,
    SkinActionError,
    SkinNotFoundError,
    SkinValidationError,
    apply_skin,
    dream_skin_status,
    public_dream_skin_status,
    restore_skin,
    scan_skin_catalog,
)
from state_scan import scan_codex


ROOT = Path(__file__).resolve().parent
STATIC_DIR = ROOT / "static"
ACTION_TOKEN = secrets.token_urlsafe(32)
MAX_ACTION_BODY = 4096
MAX_RULES_BODY = 512 * 1024
MAX_RULES_CONTENT = 256 * 1024
GLOBAL_AGENTS_PATH = CODEX_HOME / "AGENTS.md"
RULES_WRITE_LOCK = threading.Lock()


class RulesConflictError(Exception):
    pass


class RulesValidationError(Exception):
    pass


def _rules_revision(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def read_global_rules(path: Path = GLOBAL_AGENTS_PATH) -> dict:
    content = path.read_bytes() if path.is_file() else b""
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise RulesValidationError("全局 AGENTS.md 不是有效的 UTF-8 文本") from exc
    return {
        "content": text,
        "exists": path.is_file(),
        "path": str(path),
        "revision": _rules_revision(content),
    }


def save_global_rules(content: str, expected_revision: str, path: Path = GLOBAL_AGENTS_PATH) -> dict:
    if not isinstance(content, str):
        raise RulesValidationError("content 必须是字符串")
    if not isinstance(expected_revision, str) or not expected_revision:
        raise RulesValidationError("revision 必须是非空字符串")
    if "\x00" in content:
        raise RulesValidationError("规则内容不能包含空字符")

    encoded = content.encode("utf-8")
    if len(encoded) > MAX_RULES_CONTENT:
        raise RulesValidationError("规则内容不能超过 256 KB")

    with RULES_WRITE_LOCK:
        current = read_global_rules(path)
        if current["revision"] != expected_revision:
            raise RulesConflictError("全局 AGENTS.md 已在其他位置更新，请重新载入后再保存")

        path.parent.mkdir(parents=True, exist_ok=True)
        temporary_path = path.with_name(f".{path.name}.{secrets.token_hex(6)}.tmp")
        try:
            temporary_path.write_bytes(encoded)
            os.replace(temporary_path, path)
        finally:
            temporary_path.unlink(missing_ok=True)

        return read_global_rules(path)


class CoGameHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def do_GET(self) -> None:
        route = urlparse(self.path).path
        if route == "/api/state":
            self._send_state()
            return
        if route in {"/api/rules", "/api/skins", "/api/skins/status"} and not self._request_host_is_loopback():
            self._send_json({"error": "forbidden", "message": "本地配置接口只接受本机 Host"}, 403)
            return
        if route == "/api/rules":
            try:
                self._send_json({"action_token": ACTION_TOKEN, **read_global_rules()})
            except RulesValidationError as exc:
                self._send_json({"error": "invalid_rules", "message": str(exc)}, 422)
            except OSError as exc:
                self.log_error("Global rules read failed: %s", exc)
                self._send_json({"error": "rules_read_failed", "message": "无法读取全局 AGENTS.md"}, 500)
            return
        if route == "/api/skins":
            try:
                self._send_json(scan_skin_catalog(ROOT))
            except Exception as exc:
                self.log_error("Skin catalog scan failed: %s", exc)
                self._send_json(
                    {"error": "skin_scan_failed", "message": "皮肤目录无法读取，请检查 static/skins 目录"},
                    500,
                )
            return
        if route == "/api/skins/status":
            try:
                status = dream_skin_status()
                self._send_json({"action_token": ACTION_TOKEN, **public_dream_skin_status(status)})
            except Exception as exc:
                self.log_error("Dream Skin status check failed: %s", exc)
                self._send_json(
                    {"error": "skin_status_failed", "message": "Dream Skin 运行环境检测失败"},
                    500,
                )
            return
        if route == "/":
            self.path = "/index.html"
        super().do_GET()

    def do_POST(self) -> None:
        route = urlparse(self.path).path
        if route not in {"/api/rules", "/api/skins/apply", "/api/skins/restore"}:
            self._send_json({"error": "not_found", "message": "API route not found"}, 404)
            return
        try:
            if route == "/api/rules":
                payload = self._read_action_payload(MAX_RULES_BODY, "规则操作")
                result = save_global_rules(payload.get("content"), payload.get("revision"))
                self._send_json({"message": "全局 AGENTS.md 已保存", **result})
                return

            payload = self._read_action_payload()
            if route == "/api/skins/apply":
                skin_id = payload.get("skin_id")
                if not isinstance(skin_id, str) or not skin_id:
                    raise SkinValidationError("skin_id 必须是非空字符串")
                result = apply_skin(ROOT, skin_id, payload.get("restart_existing") is True)
            else:
                result = restore_skin(ROOT, payload.get("restart_existing") is True)
            self._send_json(result)
        except PermissionError as exc:
            self._send_json({"error": "forbidden", "message": str(exc)}, 403)
        except ValueError as exc:
            self._send_json({"error": "bad_request", "message": str(exc)}, 400)
        except RulesConflictError as exc:
            self._send_json({"error": "rules_conflict", "message": str(exc)}, 409)
        except RulesValidationError as exc:
            self._send_json({"error": "invalid_rules", "message": str(exc)}, 422)
        except SkinNotFoundError as exc:
            self._send_json({"error": "skin_not_found", "message": str(exc)}, 404)
        except SkinValidationError as exc:
            self._send_json({"error": "invalid_skin", "message": str(exc)}, 422)
        except RuntimeUnavailableError as exc:
            self._send_json(
                {"error": "runtime_unavailable", "message": str(exc), "status": public_dream_skin_status(exc.status)},
                409,
            )
        except SkinActionError as exc:
            self._send_json({"error": "skin_action_failed", "message": str(exc)}, 502)
        except OSError as exc:
            self.log_error("Local file action failed: %s", exc)
            self._send_json({"error": "file_action_failed", "message": "本地文件写入失败"}, 500)
        except Exception as exc:
            self.log_error("Unexpected local action failure: %s", exc)
            self._send_json({"error": "action_failed", "message": "本地操作发生内部错误"}, 500)

    def end_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        if self.path.startswith("/api/") or self.path.startswith("/skins/"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _request_host(self):
        host_header = self.headers.get("Host", "")
        parsed = urlparse(f"//{host_header}")
        try:
            return parsed.hostname, parsed.port
        except ValueError:
            return None, None

    def _request_host_is_loopback(self) -> bool:
        hostname, _ = self._request_host()
        if not hostname:
            return False
        if hostname.casefold() == "localhost":
            return True
        try:
            return ipaddress.ip_address(hostname).is_loopback
        except ValueError:
            return False

    def _read_action_payload(self, max_body: int = MAX_ACTION_BODY, action_label: str = "皮肤操作") -> dict:
        try:
            if not ipaddress.ip_address(self.client_address[0]).is_loopback:
                raise PermissionError(f"{action_label}只允许来自本机回环地址")
        except ValueError as exc:
            raise PermissionError("无法验证请求来源") from exc
        if not self._request_host_is_loopback():
            raise PermissionError(f"{action_label}只接受本机 Host")
        origin = self.headers.get("Origin")
        if origin:
            parsed_origin = urlparse(origin)
            request_host, request_port = self._request_host()
            if (
                parsed_origin.scheme != "http"
                or parsed_origin.hostname != request_host
                or parsed_origin.port != request_port
            ):
                raise PermissionError(f"{action_label}来源与当前页面不一致")
        token = self.headers.get("X-CoGame-Action-Token", "")
        if not hmac.compare_digest(token, ACTION_TOKEN):
            raise PermissionError(f"{action_label}令牌无效，请刷新页面后重试")
        if self.headers.get_content_type() != "application/json":
            raise ValueError(f"{action_label}只接受 application/json")
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as exc:
            raise ValueError("Content-Length 无效") from exc
        if length < 1 or length > max_body:
            raise ValueError("请求体大小无效")
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ValueError("请求体不是有效的 UTF-8 JSON") from exc
        if not isinstance(payload, dict):
            raise ValueError("请求体根节点必须是对象")
        return payload

    def _send_json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_state(self) -> None:
        try:
            payload = scan_codex(ROOT)
            status = 200
        except Exception as exc:  # Keep the local UI available on partial failures.
            payload = {"error": "scan_failed", "message": str(exc)}
            status = 500

        self._send_json(payload, status)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the CoGame MVP locally.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), CoGameHandler)
    print(f"CoGame is running at http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
