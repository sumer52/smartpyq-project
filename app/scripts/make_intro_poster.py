"""One-off dev script: extract a poster frame from public/intro.mp4.

Uses the bundled imageio-ffmpeg binary directly (no pyav dependency).
Grabs a frame ~1s in, downscales to 1280px wide, saves public/intro-poster.jpg.
Safe to re-run if the intro video changes.
"""
import os
import subprocess

import imageio_ffmpeg

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PUBLIC = os.path.join(ROOT, "smartpyq-frontend", "public")
VIDEO = os.path.join(PUBLIC, "intro.mp4")
OUT = os.path.join(PUBLIC, "intro-poster.jpg")

ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
cmd = [
    ffmpeg, "-y",
    "-ss", "1.0",            # seek to 1s (after the intro fade-in)
    "-i", VIDEO,
    "-frames:v", "1",
    "-vf", "scale=1280:-2",
    "-q:v", "3",
    OUT,
]
subprocess.run(cmd, check=True, capture_output=True)
print(f"poster saved: {OUT} ({os.path.getsize(OUT) // 1024} KB)")
