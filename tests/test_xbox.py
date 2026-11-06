"""Tests for the Xbox capture-card viewer. Run: python3 -m unittest discover -s tests"""

import importlib.machinery
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import textwrap
import time
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
_loader = importlib.machinery.SourceFileLoader("xboxapp", os.path.join(HERE, "..", "xbox"))
_spec = importlib.util.spec_from_loader("xboxapp", _loader)
x = importlib.util.module_from_spec(_spec)
_loader.exec_module(x)

# What a MacroSilicon MS2130 card (the common "4K USB 3.0" capture card) reports.
MS2130 = textwrap.dedent("""\
    ioctl: VIDIOC_ENUM_FMT
    	Type: Video Capture

    	[0]: 'MJPG' (Motion-JPEG, compressed)
    		Size: Discrete 1920x1080
    			Interval: Discrete 0.017s (60.000 fps)
    			Interval: Discrete 0.033s (30.000 fps)
    		Size: Discrete 1280x720
    			Interval: Discrete 0.017s (60.000 fps)
    		Size: Discrete 3840x2160
    			Interval: Discrete 0.033s (30.000 fps)
    	[1]: 'YUYV' (YUYV 4:2:2)
    		Size: Discrete 1920x1080
    			Interval: Discrete 0.033s (30.000 fps)
    		Size: Discrete 1280x720
    			Interval: Discrete 0.017s (60.000 fps)
    """)

WEBCAM = textwrap.dedent("""\
    	[0]: 'MJPG' (Motion-JPEG, compressed)
    		Size: Discrete 1920x1080
    			Interval: Discrete 0.033s (30.000 fps)
    """)

PW_DUMP = [
    {"id": 40, "type": "PipeWire:Interface:Node", "info": {"props": {
        "media.class": "Audio/Sink", "api.alsa.card": "0", "node.name": "alsa_output.pci-0000_00_1f.3.analog-stereo"}}},
    {"id": 41, "type": "PipeWire:Interface:Node", "info": {"props": {
        "media.class": "Audio/Source", "api.alsa.card": "0", "node.name": "alsa_input.pci-0000_00_1f.3.analog-stereo"}}},
    {"id": 55, "type": "PipeWire:Interface:Node", "info": {"props": {
        "media.class": "Audio/Source", "api.alsa.card": 1,
        "node.name": "alsa_input.usb-MACROSILICON_USB3_Video-02.analog-stereo"}}},
    {"id": 60, "type": "PipeWire:Interface:Link"},
]


def fake_sysfs():
    """A /sys with the capture card (video + sound on one USB device), its metadata node,
    a webcam and the onboard sound card."""
    root = tempfile.mkdtemp()
    pci = os.path.join(root, "devices/pci0000:00/0000:00:14.0")
    card_usb = os.path.join(pci, "usb2/2-5")
    cam_usb = os.path.join(pci, "usb1/1-4")
    for path in [f"{card_usb}/2-5:1.0", f"{card_usb}/2-5:1.2", f"{cam_usb}/1-4:1.0",
                 os.path.join(root, "devices/pci0000:00/0000:00:1f.3")]:
        os.makedirs(path)

    def video(n, name, target):
        d = os.path.join(root, f"class/video4linux/video{n}")
        os.makedirs(d)
        with open(os.path.join(d, "name"), "w") as f:
            f.write(name + "\n")
        os.symlink(target, os.path.join(d, "device"))

    video(0, "USB3 Video: USB3 Video", f"{card_usb}/2-5:1.0")
    video(1, "USB3 Video: USB3 Video", f"{card_usb}/2-5:1.0")  # metadata node
    video(2, "HD Webcam: HD Webcam", f"{cam_usb}/1-4:1.0")
    for n, target in [(0, os.path.join(root, "devices/pci0000:00/0000:00:1f.3")), (1, f"{card_usb}/2-5:1.2")]:
        d = os.path.join(root, f"class/sound/card{n}")
        os.makedirs(d)
        os.symlink(target, os.path.join(d, "device"))
    return root, card_usb


def modes_of(dev):
    return {"/dev/video0": x.parse_formats(MS2130), "/dev/video2": x.parse_formats(WEBCAM)}.get(dev, [])


class ModeTests(unittest.TestCase):
    def test_parse(self):
        modes = x.parse_formats(MS2130)
        self.assertIn(("MJPG", 1920, 1080, 60.0), modes)
        self.assertIn(("YUYV", 1920, 1080, 30.0), modes)
        self.assertIn(("MJPG", 3840, 2160, 30.0), modes)
        self.assertEqual(len(modes), 6)
        self.assertEqual(x.parse_formats(""), [])

    def test_1080p_highest_fps(self):
        self.assertEqual(x.choose_mode(x.parse_formats(MS2130)), ("MJPG", 1920, 1080, 60.0))

    def test_uncompressed_first_at_equal_fps(self):
        self.assertEqual(x.choose_mode(x.parse_formats(MS2130), 1280, 720), ("YUYV", 1280, 720, 60.0))

    def test_wanted_fps_and_format(self):
        modes = x.parse_formats(MS2130)
        self.assertEqual(x.choose_mode(modes, fps=30), ("YUYV", 1920, 1080, 30.0))
        self.assertEqual(x.choose_mode(modes, fmt="mjpg", fps=30), ("MJPG", 1920, 1080, 30.0))

    def test_size_not_offered_takes_largest_smaller(self):
        self.assertEqual(x.choose_mode(x.parse_formats(MS2130), 2560, 1440), ("MJPG", 1920, 1080, 60.0))

    def test_120fps_card(self):
        modes = [("MJPG", 1920, 1080, 60.0), ("MJPG", 1920, 1080, 120.0), ("YUYV", 1920, 1080, 60.0)]
        self.assertEqual(x.choose_mode(modes), ("MJPG", 1920, 1080, 120.0))

    def test_unknown_formats(self):
        self.assertIsNone(x.choose_mode([("H264", 1920, 1080, 60.0)]))
        self.assertIsNone(x.choose_mode([]))


class DeviceTests(unittest.TestCase):
    def setUp(self):
        self.sys, self.card_usb = fake_sysfs()

    def test_finds_the_capture_card_not_the_webcam(self):
        d, modes = x.find_capture(x.merge_config({}), self.sys, modes_of)
        self.assertEqual(d["dev"], "/dev/video0")
        self.assertEqual(d["usb"], os.path.realpath(self.card_usb))
        self.assertEqual(x.choose_mode(modes), ("MJPG", 1920, 1080, 60.0))

    def test_device_from_config(self):
        d, _ = x.find_capture(x.merge_config({"device": "/dev/video2"}), self.sys, modes_of)
        self.assertEqual(d["dev"], "/dev/video2")

    def test_nothing_found(self):
        d, modes = x.find_capture(x.merge_config({}), self.sys, lambda dev: [])
        self.assertIsNone(d)
        self.assertEqual(modes, [])

    def test_sound_of_the_same_usb_device(self):
        self.assertEqual(x.alsa_card_for(os.path.realpath(self.card_usb), self.sys), 1)
        d, _ = x.find_capture(x.merge_config({}), self.sys, modes_of)
        src = x.find_audio_source(x.merge_config({}), d, self.sys, json.dumps(PW_DUMP))
        self.assertEqual(src, "alsa_input.usb-MACROSILICON_USB3_Video-02.analog-stereo")

    def test_sound_source_from_config(self):
        d = {"usb": "/nowhere"}
        self.assertEqual(x.find_audio_source(x.merge_config({"audio_source": "mine"}), d, self.sys, "[]"), "mine")

    def test_card_number_only_on_the_device_object(self):
        dump = [
            {"id": 70, "type": "PipeWire:Interface:Device", "info": {"props": {
                "media.class": "Audio/Device", "api.alsa.card": "1", "device.name": "alsa_card.usb-MACROSILICON"}}},
            {"id": 71, "type": "PipeWire:Interface:Node", "info": {"props": {
                "media.class": "Audio/Source", "device.id": 70, "node.name": "alsa_input.usb-MACROSILICON-02.mono"}}},
        ]
        self.assertEqual(x.pipewire_source_for_card(1, json.dumps(dump)), "alsa_input.usb-MACROSILICON-02.mono")

    def test_card_number_as_pcm_card(self):
        dump = [{"id": 5, "type": "PipeWire:Interface:Node", "info": {"props": {
            "media.class": "Audio/Source", "api.alsa.pcm.card": 1, "node.name": "src"}}}]
        self.assertEqual(x.pipewire_source_for_card(1, dump), "src")

    def test_no_sound(self):
        self.assertIsNone(x.pipewire_source_for_card(5, json.dumps(PW_DUMP)))
        self.assertIsNone(x.pipewire_source_for_card(1, "not json"))


class CommandTests(unittest.TestCase):
    def test_no_wait_options_for_each_mpv_version(self):
        self.assertEqual(x.no_wait_options({"vulkan-swap-mode", "wayland-internal-vsync", "wayland-disable-vsync"}),
                         ["--vulkan-swap-mode=mailbox", "--wayland-internal-vsync=no"])
        self.assertEqual(x.no_wait_options({"vulkan-swap-mode", "wayland-disable-vsync"}),
                         ["--vulkan-swap-mode=mailbox", "--wayland-disable-vsync=yes"])
        self.assertEqual(x.no_wait_options(set()), [])  # never pass an option mpv does not know

    def test_detects_options_of_the_installed_mpv(self):
        x._MPV_OPTIONS = None
        try:
            known = x.mpv_options()
            if known:  # mpv installed here
                self.assertIn("vulkan-swap-mode", known)
                self.assertIn("profile", known)
        finally:
            x._MPV_OPTIONS = None

    def test_mpv(self):
        cmd = x.mpv_cmd("/dev/video0", ("MJPG", 1920, 1080, 60.0), x.merge_config({}), known=set())
        self.assertEqual(cmd[:2], ["mpv", "av://v4l2:/dev/video0"])
        self.assertIn("--demuxer-lavf-o=video_size=1920x1080,framerate=60,input_format=mjpeg,fflags=+nobuffer", cmd)
        for opt in ("--profile=low-latency", "--untimed", "--no-audio", "--wayland-app-id=xbox", "--title=Xbox", "--fs"):
            self.assertIn(opt, cmd)
        self.assertNotIn("--fs", x.mpv_cmd("/dev/video0", ("YUYV", 1920, 1080, 30.0), x.merge_config({"fullscreen": False})))
        self.assertIn("input_format=yuyv422", " ".join(x.mpv_cmd("/dev/video0", ("YUYV", 1280, 720, 60.0), x.merge_config({}))))

    def test_loopback(self):
        cmd = x.loopback_cmd("alsa_input.usb-X", x.merge_config({}))
        self.assertEqual(cmd[:5], ["pw-loopback", "-n", "xbox-audio", "-C", "alsa_input.usb-X"])
        self.assertEqual(cmd[-2:], ["-l", "25"])
        self.assertNotIn("-l", x.loopback_cmd("s", x.merge_config({"audio_latency_ms": 0})))

    def test_config(self):
        c = x.merge_config({"fps": 120.0, "fullscreen": 0, "mpv_args": ["--a", 1], "nope": 1, "width": "x"})
        self.assertEqual(c["fps"], 120)
        self.assertIs(c["fullscreen"], False)
        self.assertEqual(c["mpv_args"], ["--a", "1"])
        self.assertNotIn("nope", c)
        self.assertEqual(c["width"], 1920)


class RunTests(unittest.TestCase):
    """run() with fake mpv / v4l2-ctl / pw-dump / pw-loopback on PATH."""

    def setUp(self):
        self.sys, _ = fake_sysfs()
        self.bin = tempfile.mkdtemp()
        self.out = tempfile.mkdtemp()
        self.old = (x.SYSFS, os.environ["PATH"], x.notify, x.RUNTIME_DIR, x.PID_FILE)
        x.SYSFS = self.sys
        os.environ["PATH"] = self.bin + os.pathsep + os.environ["PATH"]
        self.notes = []
        x.notify = self.notes.append
        x.RUNTIME_DIR = self.out
        x.PID_FILE = os.path.join(self.out, "xbox.pid")
        ms = MS2130.replace("'", "'\\''")
        self.tool("v4l2-ctl", f"""[ "$3" = /dev/video0 ] && printf '%s' '{ms}'; exit 0""")
        self.tool("pw-dump", f"cat <<'J'\n{json.dumps(PW_DUMP)}\nJ")
        self.tool("pw-loopback", f'echo "$@" > {self.out}/loopback.args; trap "echo stopped > {self.out}/loopback.state; exit 0" TERM; while :; do sleep 0.1; done')

    def tearDown(self):
        x.SYSFS, os.environ["PATH"], x.notify, x.RUNTIME_DIR, x.PID_FILE = self.old

    def tool(self, name, body):
        path = os.path.join(self.bin, name)
        with open(path, "w") as f:
            f.write("#!/bin/sh\n" + body + "\n")
        os.chmod(path, 0o755)

    def test_plays_card_with_sound_and_stops_sound_after(self):
        self.tool("mpv", f'echo "$@" > {self.out}/mpv.args; sleep 0.5; exit 0')
        self.assertEqual(x.run(x.merge_config({})), 0)
        mpv = open(os.path.join(self.out, "mpv.args")).read()
        self.assertIn("av://v4l2:/dev/video0", mpv)
        self.assertIn("input_format=mjpeg", mpv)
        loop = open(os.path.join(self.out, "loopback.args")).read()
        self.assertIn("-C alsa_input.usb-MACROSILICON_USB3_Video-02.analog-stereo", loop)
        for _ in range(30):
            if os.path.exists(os.path.join(self.out, "loopback.state")):
                break
            time.sleep(0.1)
        self.assertEqual(open(os.path.join(self.out, "loopback.state")).read().strip(), "stopped")

    def test_busy_card(self):
        self.tool("mpv", 'echo "[ffmpeg] v4l2: ioctl(VIDIOC_STREAMON): Device or resource busy" >&2; exit 2')
        self.assertEqual(x.run(x.merge_config({})), 1)
        self.assertTrue(any("zajęta" in n for n in self.notes))

    def test_no_card(self):
        self.tool("v4l2-ctl", "exit 0")
        self.tool("mpv", "exit 0")
        self.assertEqual(x.run(x.merge_config({})), 1)
        self.assertTrue(any("Nie widzę karty" in n for n in self.notes))

    def test_toggle_closes_the_open_window(self):
        p = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)", "xbox"])
        try:
            with open(x.PID_FILE, "w") as f:
                f.write(str(p.pid))
            self.assertEqual(x.running_pid(), p.pid)
            self.assertEqual(x.main(["--toggle"]), 0)
            self.assertIsNotNone(p.wait(timeout=5))
        finally:
            if p.poll() is None:
                p.kill()

    def test_stale_pid_is_ignored(self):
        with open(x.PID_FILE, "w") as f:
            f.write("999999999")
        self.assertIsNone(x.running_pid())


if __name__ == "__main__":
    unittest.main()
