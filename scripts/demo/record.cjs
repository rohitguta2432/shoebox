// Records the Shoebox demo as high-quality screencast frames (JPEG, 2x) plus a
// manifest of timed marks and element boxes for the compositor.
// NODE_PATH=~/Documents/myfinancial-ui/node_modules node record-shoebox.cjs <url> <outdir>
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const [url, outDir] = process.argv.slice(2);
fs.mkdirSync(path.join(outDir, "frames"), { recursive: true });

const CURSOR = `
(() => {
  const install = () => {
    if (document.getElementById("__demo_cursor")) return;
    const c = document.createElement("div");
    c.id = "__demo_cursor";
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2.5 L4 19.5 L8.6 15.3 L11.6 22 L14.4 20.8 L11.5 14.2 L17.6 14.2 Z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: "fixed", left: "0px", top: "0px", zIndex: 2147483647, pointerEvents: "none", transform: "translate(720px, 520px)", transition: "none", filter: "drop-shadow(0 2px 3px rgba(0,0,0,.35))" });
    const ring = document.createElement("div");
    Object.assign(ring.style, { position: "fixed", left: "0px", top: "0px", width: "34px", height: "34px", marginLeft: "-17px", marginTop: "-17px", borderRadius: "50%", border: "2.5px solid rgba(58,94,210,.85)", zIndex: 2147483646, pointerEvents: "none", opacity: "0", transform: "translate(720px,520px) scale(.4)" });
    document.body.appendChild(ring);
    document.body.appendChild(c);
    let x = 720, y = 520;
    addEventListener("mousemove", (e) => { x = e.clientX; y = e.clientY; c.style.transform = "translate(" + (x - 3) + "px," + (y - 2) + "px)"; }, true);
    addEventListener("mousedown", () => {
      ring.animate([{ opacity: 1, transform: "translate(" + x + "px," + y + "px) scale(.4)" }, { opacity: 0, transform: "translate(" + x + "px," + y + "px) scale(1.3)" }], { duration: 420, easing: "cubic-bezier(.22,1,.36,1)" });
    }, true);
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", install); else install();
})();`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await context.addInitScript(CURSOR);
  const page = await context.newPage();

  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector(".drop");
  await page.mouse.move(720, 520);
  await page.waitForTimeout(600);

  // ---- capture 2x frames continuously (screencast only gives 1x)
  const cdp = await context.newCDPSession(page);
  const frames = [];
  let n = 0;
  let capturing = true;
  const loop = (async () => {
    while (capturing) {
      const t = Date.now() / 1000;
      // clip is in document coordinates, so follow the scroll position
      const { cssVisualViewport: vv } = await cdp.send("Page.getLayoutMetrics");
      const shot = await cdp.send("Page.captureScreenshot", {
        format: "jpeg",
        quality: 90,
        optimizeForSpeed: true,
        clip: { x: vv.pageX, y: vv.pageY, width: 1440, height: 900, scale: 2 },
      });
      const file = `f${String(n++).padStart(5, "0")}.jpg`;
      fs.writeFileSync(path.join(outDir, "frames", file), Buffer.from(shot.data, "base64"));
      frames.push({ file, t });
    }
  })();

  const marks = {};
  const boxes = {};
  const now = () => Date.now() / 1000;
  const mark = (name) => (marks[name] = now());
  const box = async (name, selector) => {
    boxes[name] = await page.evaluate((sel) => {
      const e = document.querySelector(sel);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    }, selector);
  };
  let cx = 720, cy = 520;
  const glide = async (x, y, ms = 650) => {
    const steps = Math.max(8, Math.round(ms / 16));
    const sx = cx, sy = cy;
    for (let i = 1; i <= steps; i++) {
      const p = i / steps;
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      await page.mouse.move(sx + (x - sx) * e, sy + (y - sy) * e);
      await page.waitForTimeout(16);
    }
    cx = x; cy = y;
  };
  const center = async (selector) => {
    const b = await page.locator(selector).first().boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const scrollTo = async (target, ms = 750) => {
    await page.evaluate(async ({ target, ms }) => {
      const from = scrollY;
      const start = performance.now();
      await new Promise((done) => {
        const step = (t) => {
          const p = Math.min(1, (t - start) / ms);
          const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
          scrollTo(0, from + (target - from) * e);
          p < 1 ? requestAnimationFrame(step) : done();
        };
        requestAnimationFrame(step);
      });
    }, { target, ms });
  };

  mark("start");
  await page.waitForTimeout(1000); // landing

  const sample = await center('button.sample:has-text("Handwritten bill book")');
  await glide(sample.x, sample.y, 600);
  await page.waitForTimeout(150);
  mark("click");
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(250);
  await glide(1190, 190, 500); // off the photo, near where the stamp will land

  await page.waitForSelector('.stamp[data-status="fix"]', { timeout: 180000 });
  mark("done");
  await box("stampFix", ".stamp");
  await box("head", ".sheet-head");
  await page.waitForTimeout(1250); // stamp lands, hold on NOT READY

  // bring the grand total and the problem into view
  const target = await page.evaluate(() => {
    const g = document.querySelector(".totals__row--grand").getBoundingClientRect();
    return Math.round(scrollY + g.top - 330);
  });
  mark("scrollDown");
  await scrollTo(target, 800);
  await page.waitForTimeout(120);
  mark("scrolled");
  await box("grand", ".totals__row--grand");
  await box("problem", ".check");
  await box("totals", ".totals");
  await page.waitForTimeout(1400); // read "off by ₹90"

  const grand = await center(".totals__row--grand input");
  await glide(grand.x + 40, grand.y, 520);
  await page.mouse.down();
  await page.mouse.up();
  await glide(grand.x - 90, grand.y + 64, 220); // out of the way of the digits
  mark("typing");
  await page.keyboard.type("9765", { delay: 120 });
  await page.waitForTimeout(350);
  mark("typed");

  // back up to the stamp, then commit so the new verdict lands on camera
  await glide(1190, 150, 380);
  mark("scrollUp");
  await scrollTo(0, 700);
  await page.waitForTimeout(150);
  mark("top");
  await page.keyboard.press("Enter");
  mark("fixed");
  await page.waitForTimeout(200);
  await box("stampOk", ".stamp");
  await page.waitForTimeout(1150); // hold on CHECKED

  const add = await center('.actions .btn--primary');
  await glide(add.x, add.y, 480);
  await page.waitForTimeout(120);
  mark("save");
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForSelector(".toast", { timeout: 5000 });
  await page.waitForTimeout(1500);
  mark("end");
  await box("toast", ".toast");

  capturing = false;
  await loop;
  fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify({ frames, marks, boxes, dsf: 2, viewport: [1440, 900] }, null, 2));
  console.log(`frames ${frames.length}; read took ${(marks.done - marks.click).toFixed(1)} s; total ${(marks.end - marks.start).toFixed(1)} s`);
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
