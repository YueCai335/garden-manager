#!/usr/bin/env node
/**
 * Exports the landing page assets (ADR-0073, phase S6) into public/landing/.
 *
 *   node scripts/export-landing-assets.mjs
 *
 * Needs macOS (`sips`), `cwebp` (brew install webp), the full-size photos in
 * design/source-photos/ (see CREDITS.md), and the Playwright Chromium that the
 * e2e tests already use.
 *
 * 1. Each photo is resized to 2000 px wide, converted to grayscale (the shader
 *    reads luminance only), and saved as WebP.
 * 2. The still fallbacks and the Open Graph image are rendered from those WebP
 *    files by the same shader code the page runs (landingShader.ts), so the
 *    still matches the live grade.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import * as shader from "../src/components/marketing/landingShader.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "landing");
const grayProfile = "/System/Library/ColorSync/Profiles/Generic Gray Gamma 2.2 Profile.icc";
const textureWidth = 2000;

const photos = [
  { name: "hero-ridges", source: "pexels-victoria-knyshova-177079167-12321610.jpg", page: "https://www.pexels.com/photo/12321610/", preset: shader.heroPreset },
  { name: "footer-veins", source: "pexels-amel-uzunovic-440739273-35451631.jpg", page: "https://www.pexels.com/photo/35451631/", preset: shader.footerPreset },
];

/** Still renders: size in pixels and the light position as a fraction of the size. */
const stills = [
  { name: "hero-still", photo: "hero-ridges", width: 2400, height: 1200, light: [0.78, 0.3] },
  { name: "footer-still", photo: "footer-veins", width: 2400, height: 900, light: [0.68, 0.45] },
];

function run(command, args) { execFileSync(command, args, { stdio: ["ignore", "ignore", "inherit"] }); }
function kb(path) { return `${Math.round(statSync(path).size / 1024)} KB`; }

mkdirSync(out, { recursive: true });
const work = mkdtempSync(join(tmpdir(), "landing-assets-"));

try {
  for (const photo of photos) {
    const source = join(root, "design", "source-photos", photo.source);
    if (!existsSync(source)) throw new Error(`Missing ${source}. Download it from ${photo.page} (see design/source-photos/CREDITS.md).`);
    const png = join(work, `${photo.name}.png`);
    run("sips", ["--resampleWidth", String(textureWidth), "--matchTo", grayProfile, source, "-s", "format", "png", "--out", png]);
    const webp = join(out, `${photo.name}.webp`);
    run("cwebp", ["-quiet", "-q", "75", "-m", "6", "-metadata", "none", png, "-o", webp]);
    console.log(`${webp}  ${kb(webp)}`);
  }

  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await page.setContent("<!doctype html><body style='margin:0'></body>");
  // The page gets the same functions the site runs, as source text.
  await page.addScriptTag({ content: [
    `window.createPhotoGrade = ${shader.createPhotoGrade.toString()};`,
    `window.sampleLuminance = ${shader.sampleLuminance.toString()};`,
    `window.luminanceRange = ${shader.luminanceRange.toString()};`,
  ].join("\n") });

  const render = (still, preset, dataUrl, format) => page.evaluate(async ({ still, preset, dataUrl, sources, format }) => {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = still.width;
    canvas.height = still.height;
    document.body.replaceChildren(canvas);
    const gl = canvas.getContext("webgl2", { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error("This Chromium has no WebGL2.");
    const sample = window.sampleLuminance(image);
    const { low, high } = window.luminanceRange(sample.luminance);
    const ratio = image.width / preset.referenceWidth;
    const grade = window.createPhotoGrade(gl, sources, image, { preset, low, high, lodShift: Math.log2(ratio), sampleStep: preset.sampleStep * ratio });
    if (!grade) throw new Error("The shader did not compile.");
    grade.draw([still.width * still.light[0], still.height * still.light[1]], 0);
    return canvas.toDataURL(format);
  }, { still, preset, dataUrl, sources: { vertex: shader.vertexShaderSource, fragment: shader.fragmentShaderSource }, format });

  const textures = Object.fromEntries(photos.map((photo) => [photo.name, `data:image/webp;base64,${readFileSync(join(out, `${photo.name}.webp`)).toString("base64")}`]));
  const presets = Object.fromEntries(photos.map((photo) => [photo.name, photo.preset]));

  for (const still of stills) {
    const dataUrl = await render(still, presets[still.photo], textures[still.photo], "image/png");
    const png = join(work, `${still.name}.png`);
    writeFileSync(png, Buffer.from(dataUrl.split(",")[1], "base64"));
    const webp = join(out, `${still.name}.webp`);
    run("cwebp", ["-quiet", "-q", "78", "-m", "6", "-metadata", "none", png, "-o", webp]);
    console.log(`${webp}  ${kb(webp)}`);
  }

  // Open Graph image: the hero grade with the headline, 1200 × 630.
  const og = { width: 1200, height: 630, light: [0.8, 0.28] };
  const background = await render(og, presets["hero-ridges"], textures["hero-ridges"], "image/png");
  await page.setViewportSize({ width: og.width, height: og.height });
  await page.setContent(`<!doctype html><body style="margin:0">
    <div id="og" style="position:relative;width:${og.width}px;height:${og.height}px;background:url(${background}) center/cover;color:#fff;font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;overflow:hidden">
      <div style="position:absolute;inset:0;background:linear-gradient(90deg,rgb(6 14 10/60%),rgb(6 14 10/0%) 65%)"></div>
      <div style="position:absolute;left:72px;top:64px;font-size:30px;font-weight:600;letter-spacing:-.01em">Garden Manager</div>
      <div style="position:absolute;left:72px;bottom:96px;max-width:760px;font-size:76px;line-height:1;font-weight:600;letter-spacing:-.035em">Draw your garden. Log it in one sentence.</div>
      <div style="position:absolute;left:72px;bottom:56px;width:56px;height:6px;border-radius:3px;background:#d6ff5c"></div>
    </div></body>`);
  const ogPath = join(out, "og.jpg");
  await page.locator("#og").screenshot({ path: ogPath, type: "jpeg", quality: 85 });
  console.log(`${ogPath}  ${kb(ogPath)}`);
  await browser.close();
} finally {
  rmSync(work, { recursive: true, force: true });
}
