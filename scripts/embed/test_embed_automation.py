"""가짜 런타임 안에서 셸 진입점만 실행한다. DB·모델·launchd·알림에는 접근하지 않는다."""

import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


@unittest.skipIf(sys.platform == "win32", "bash 환경에서 실행")
class EmbedAutomationTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.embed = self.root / "scripts" / "embed"
        self.embed.mkdir(parents=True)
        source = Path(__file__).parent
        for name in ["macmini-setup.sh", "run-embed.sh", "check_db.py",
                     "com.samae.embed.plist.template", "com.samae.serve.plist.template"]:
            # Windows 체크아웃의 CRLF를 macOS/Linux 체크아웃과 같은 LF로 옮긴다.
            (self.embed / name).write_text((source / name).read_text(encoding="utf-8"), encoding="utf-8")
        setup = self.embed / "macmini-setup.sh"
        setup.write_text(setup.read_text().replace('/opt/homebrew/bin/python3.12', sys.executable))
        self.bin = self.embed / ".venv" / "bin"
        self.bin.mkdir(parents=True)
        (self.bin / "python").symlink_to(sys.executable)
        self.executable(self.bin / "pip", "#!/bin/sh\nexit 0\n")
        (self.embed / "siglip.py").write_text("def load():\n    return None\n")
        self.executable(self.bin / "launchctl", '#!/bin/sh\nprintf "%s\\n" "$*" >> "$LAUNCH_LOG"\n')
        # 파일을 가짜 런타임에만 쓰도록 HOME은 자식 프로세스 환경에서만 격리한다.
        # 현재 셸/사용자의 HOME 변수는 변경하지 않는다.
        self.env = {**os.environ, "HOME": str(self.root / "user"),
                    "PATH": str(self.bin) + os.pathsep + os.environ["PATH"],
                    "LAUNCH_LOG": str(self.root / "launch.log"), "FAKE_ARGS": str(self.root / "args")}

    def executable(self, path, content):
        path.write_text(content)
        path.chmod(0o755)

    def run_script(self, name):
        return subprocess.run(["bash", str(self.embed / name)], cwd=self.root, env=self.env,
                              capture_output=True, text=True, timeout=10)

    def test_setup_rejects_missing_or_empty_token_before_registering_jobs(self):
        for line in ["", 'PERSONA_SERVICE_TOKEN=""\n']:
            with self.subTest(line=line):
                (self.root / ".env.local").write_text("SUPABASE_SERVICE_ROLE_KEY=test\n" + line)
                result = self.run_script("macmini-setup.sh")
                self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertIn("PERSONA_SERVICE_TOKEN", result.stdout + result.stderr)
                self.assertFalse((self.root / "launch.log").exists())

    def test_setup_with_token_registers_both_services(self):
        (self.root / ".env.local").write_text('SUPABASE_SERVICE_ROLE_KEY=test\nPERSONA_SERVICE_TOKEN="test-token"\n')
        result = self.run_script("macmini-setup.sh")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        calls = (self.root / "launch.log").read_text().splitlines()
        loads = [line for line in calls if line.startswith("load ")]
        self.assertEqual(len(loads), 2)
        self.assertTrue(any("com.samae.embed.plist" in line for line in loads))
        self.assertTrue(any("com.samae.serve.plist" in line for line in loads))

    def test_wrapper_uses_local_service_and_preserves_failure_status(self):
        (self.root / ".env.local").write_text("")
        (self.bin / "python").unlink()
        self.executable(self.bin / "python", '#!/bin/sh\nprintf "%s\\n" "$@" > "$FAKE_ARGS"\nexit "${FAKE_STATUS:-0}"\n')
        for status in [0, 7]:
            with self.subTest(status=status):
                self.env["FAKE_STATUS"] = str(status)
                result = self.run_script("run-embed.sh")
                self.assertEqual(result.returncode, status, result.stdout + result.stderr)
                self.assertEqual((self.root / "args").read_text().splitlines(), [
                    "scripts/embed/embed_photos.py", "--apply", "--embed-url", "http://127.0.0.1:8077",
                ])
                self.assertFalse((self.embed / "logs" / ".running").exists())


if __name__ == "__main__":
    unittest.main()
