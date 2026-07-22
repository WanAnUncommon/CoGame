from __future__ import annotations

import json
import struct
import tempfile
import unittest
from pathlib import Path

from dream_skin import (
    SkinValidationError,
    _bridge_command,
    find_skin,
    scan_skin_catalog,
)


def write_minimal_png(path: Path, width: int = 2560, height: int = 1440) -> None:
    header = b"\x89PNG\r\n\x1a\n" + struct.pack(">I", 13) + b"IHDR"
    path.write_bytes(header + struct.pack(">II", width, height))


class SkinCatalogTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.skin_dir = self.root / "static" / "skins"
        self.skin_dir.mkdir(parents=True)

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_scans_valid_drop_in_image_with_manifest_metadata(self) -> None:
        write_minimal_png(self.skin_dir / "my_skin.png")
        (self.skin_dir / "skins.json").write_text(
            json.dumps(
                {
                    "my_skin.png": {
                        "name": "自定义皮肤",
                        "description": "本地测试背景",
                        "source": "用户资源",
                    }
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )

        catalog = scan_skin_catalog(self.root)

        self.assertEqual(len(catalog["skins"]), 1)
        skin = catalog["skins"][0]
        self.assertTrue(skin["valid"])
        self.assertEqual(skin["name"], "自定义皮肤")
        self.assertEqual((skin["width"], skin["height"]), (2560, 1440))
        self.assertIn("/skins/my_skin.png?v=", skin["url"])

    def test_keeps_invalid_and_unsupported_images_as_error_rows(self) -> None:
        (self.skin_dir / "broken.jpg").write_bytes(b"not-a-jpeg")
        (self.skin_dir / "legacy.gif").write_bytes(b"GIF89a")

        catalog = scan_skin_catalog(self.root)

        self.assertEqual(len(catalog["skins"]), 2)
        self.assertTrue(all(not skin["valid"] for skin in catalog["skins"]))
        self.assertTrue(all(skin["error"] for skin in catalog["skins"]))

    def test_reports_manifest_error_without_hiding_images(self) -> None:
        write_minimal_png(self.skin_dir / "visible.png")
        (self.skin_dir / "skins.json").write_text("{invalid", encoding="utf-8")

        catalog = scan_skin_catalog(self.root)

        self.assertEqual(len(catalog["skins"]), 1)
        self.assertTrue(catalog["skins"][0]["valid"])
        self.assertEqual(len(catalog["warnings"]), 1)

    def test_find_skin_rejects_invalid_file(self) -> None:
        (self.skin_dir / "broken.webp").write_bytes(b"broken")
        skin_id = scan_skin_catalog(self.root)["skins"][0]["id"]

        with self.assertRaises(SkinValidationError):
            find_skin(self.root, skin_id)


class BridgeCommandTests(unittest.TestCase):
    def test_builds_argument_list_without_shell_interpolation(self) -> None:
        root = Path("C:/CoGame")
        image = root / "static" / "skins" / "name with spaces.png"
        status = {"powershell": "C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"}

        command = _bridge_command(
            root,
            "Apply",
            status,
            image_path=image,
            name="本地皮肤",
            restart_existing=True,
        )

        self.assertIn("-File", command)
        self.assertIn("-ImagePath", command)
        self.assertIn(str(image.resolve()), command)
        self.assertIn("-RestartExisting", command)
        self.assertNotIn("-Command", command)


if __name__ == "__main__":
    unittest.main()
