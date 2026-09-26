# Demo video

How the 15-second demo was made. Real UI, real local model; only the reading is sped up (and labelled).

1. `npm run dev`, then warm the model once (`npx tsx scripts/probe.mts wholesale-invoice`).
2. Record 2x frames plus a manifest of timed marks and element boxes. Needs Playwright
   (any install works; point `NODE_PATH` at its `node_modules`):
   ```bash
   rm -rf data
   NODE_PATH=/path/to/node_modules node scripts/demo/record.cjs http://localhost:4631 /tmp/rec
   ```
   Chromium's screencast only delivers 1x frames, so the recorder calls
   `Page.captureScreenshot` with `clip.scale: 2` in a loop. The clip is in document
   coordinates, so it follows the scroll offset from `Page.getLayoutMetrics`.
3. Compose at 30 fps: time remap (reading at 6x), eased camera zooms from the recorded
   element boxes, and captions (Pillow):
   ```bash
   python3 scripts/demo/compose.py /tmp/rec /tmp/out
   ffmpeg -framerate 30 -i /tmp/out/o%05d.jpg -c:v libx264 -preset slow -crf 19 -pix_fmt yuv420p -movflags +faststart shoebox-demo.mp4
   ```
