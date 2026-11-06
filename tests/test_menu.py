"""The settings menu (menu.lua) driven in a real, headless mpv over its IPC socket.
Skipped when mpv is not installed. Run: python3 -m unittest discover -s tests"""

import json
import os
import shutil
import socket
import subprocess
import tempfile
import time
import unittest

from test_xbox import MS2130, x


@unittest.skipUnless(shutil.which("mpv"), "mpv not installed")
class MenuInMpvTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dir = tempfile.mkdtemp()
        cls.old_config = x.CONFIG_PATH
        x.CONFIG_PATH = os.path.join(cls.dir, "config.json")
        x.ensure_config()
        modes = x.parse_formats(MS2130)
        cfg = x.merge_config({"fullscreen": False})
        state = x.write_menu_state("/dev/video0", modes, x.choose_mode(modes), cfg, os.path.join(cls.dir, "state.json"))
        st = json.load(open(state))
        st["url"] = "av://lavfi:testsrc2=size=640x360:rate=30"  # stands in for the card
        json.dump(st, open(state, "w"))
        cmd = x.mpv_cmd("/dev/video0", x.choose_mode(modes), cfg, known=set(), menu_state=state)
        cmd[1] = st["url"]
        cmd = [c for c in cmd if not c.startswith("--demuxer-lavf-o=")]
        sock_path = os.path.join(cls.dir, "sock")
        cls.mpv = subprocess.Popen(cmd + ["--vo=null", "--ao=null", f"--input-ipc-server={sock_path}"],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(100):
            if os.path.exists(sock_path):
                break
            time.sleep(0.05)
        time.sleep(0.5)
        cls.sock = socket.socket(socket.AF_UNIX)
        cls.sock.connect(sock_path)
        cls.io = cls.sock.makefile("rw")
        cls.rid = 0

    @classmethod
    def tearDownClass(cls):
        try:
            cls.call("quit")
        except OSError:
            pass
        try:
            cls.mpv.wait(timeout=5)
        except subprocess.TimeoutExpired:
            cls.mpv.kill()
        x.CONFIG_PATH = cls.old_config

    @classmethod
    def call(cls, *command):
        cls.rid += 1
        cls.io.write(json.dumps({"command": list(command), "request_id": cls.rid}) + "\n")
        cls.io.flush()
        while True:
            reply = json.loads(cls.io.readline())
            if reply.get("request_id") == cls.rid:
                return reply.get("data")

    def key(self, name, wait=0.15):
        self.call("keypress", name)
        time.sleep(wait)

    def menu(self):
        self.call("script-message", "xbox-menu-dump")
        time.sleep(0.2)
        return json.loads(self.call("get_property", "user-data/xbox-menu"))

    def go_to(self, text):
        items = self.menu()["items"]
        target = next(i for i, s in enumerate(items) if text in s)
        current = next(i for i, s in enumerate(items) if s.startswith(">"))
        for _ in range(abs(target - current)):
            self.key("UP" if target < current else "DOWN", 0.05)

    def config(self):
        return json.load(open(x.CONFIG_PATH))

    def test_1_ctrl_shift_m_opens_with_modes(self):
        self.key("Ctrl+M", 0.3)
        m = self.menu()
        self.assertTrue(m["open"])
        self.assertIn("Pełny ekran", m["items"][0])
        self.assertTrue(any("YUYV  1920x1080  30 kl./s" in s for s in m["items"]))
        self.assertTrue(m["items"][1].startswith(">*") and "Automatycznie" in m["items"][1])

    def test_2_enter_switches_the_mode_and_saves_it(self):
        self.go_to("YUYV  1280x720  60")
        self.key("ENTER", 1.0)
        self.assertFalse(self.menu()["open"])
        lavf = self.call("get_property", "demuxer-lavf-o")
        self.assertEqual(lavf, {"video_size": "1280x720", "framerate": "60", "input_format": "yuyv422",
                                "fflags": "+nobuffer"})
        cfg = x.merge_config(self.config())
        self.assertEqual((cfg["format"], cfg["width"], cfg["height"], cfg["fps"]), ("YUYV", 1280, 720, 60))

    def test_3_chosen_mode_is_marked_and_esc_closes(self):
        self.key("Ctrl+M", 0.3)
        marked = [s for s in self.menu()["items"] if s[1] == "*"]
        self.assertEqual(len(marked), 1)
        self.assertIn("YUYV  1280x720  60", marked[0])
        self.key("ESC")
        self.assertFalse(self.menu()["open"])

    def test_4_ctrl_f_fullscreen(self):
        before = self.call("get_property", "fullscreen")
        self.key("Ctrl+f", 0.3)
        self.assertEqual(self.call("get_property", "fullscreen"), not before)
        self.key("Ctrl+f", 0.3)

    def test_5_auto_goes_back_to_the_best_mode(self):
        self.key("Ctrl+M", 0.3)
        self.go_to("Automatycznie")
        self.key("ENTER", 1.0)
        self.assertEqual(self.call("get_property", "demuxer-lavf-o")["video_size"], "1920x1080")
        cfg = x.merge_config(self.config())
        self.assertEqual((cfg["format"], cfg["fps"]), ("", 0))

    def test_6_fullscreen_item_saves_the_default(self):
        self.key("Ctrl+M", 0.3)
        self.go_to("Pełny ekran")
        self.key("ENTER", 0.4)
        now = self.call("get_property", "fullscreen")
        self.assertEqual(self.config()["fullscreen"], now)


if __name__ == "__main__":
    unittest.main()
