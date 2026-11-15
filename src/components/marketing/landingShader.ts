/**
 * The landing page's WebGL2 photo grade (ADR-0073, phase S6).
 *
 * A real leaf photo is re-graded on the GPU: its luminance maps onto three fixed
 * deep greens, normals come from blurred luminance, and a soft light follows the
 * cursor. The footer preset also extracts the leaf veins with a band-pass filter
 * and lights the veins near the cursor lime.
 *
 * Everything outside the shader is a pure function so it can be unit tested, and
 * this file has no imports so `scripts/export-landing-assets.mjs` can load it in
 * Node to render the still fallbacks with the same shader.
 */

export type TexturePreset = {
  /** Rotation of the photo on screen, in radians. */
  angle: number;
  /** Strength of the relief lighting. */
  relief: number;
  /** Mip level of the blurred luminance that the normals come from. */
  heightLod: number;
  /** Distance in texels between the normal samples. */
  sampleStep: number;
  /** Band-pass vein extraction and lime vein light (footer only). */
  veins: boolean;
  /** Gamma applied before the green gradient map; below 1 lifts the mid-tones. */
  gamma: number;
  /** Width of the photo the parameters were tuned on; larger exports shift the mip levels to keep the same look. */
  referenceWidth: number;
};

/** Light banana-leaf ridges (Pexels 12321610), tuned on the accepted prototype v4 at 1500 px wide. */
export const heroPreset: TexturePreset = { angle: -0.42, relief: 9, heightLod: 3.2, sampleStep: 10, veins: false, gamma: 1, referenceWidth: 1500 };

/** Dense leaf-vein mesh (Pexels 35451631), tuned on the accepted prototype v4 at 1000 px wide. */
export const footerPreset: TexturePreset = { angle: -0.2, relief: 5, heightLod: 1.4, sampleStep: 3, veins: true, gamma: 0.6, referenceWidth: 1000 };

/** The canvas never renders above this device pixel ratio. */
export const maxPixelRatio = 2;

export const vertexShaderSource = `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }`;

export const fragmentShaderSource = `#version 300 es
precision highp float;
uniform sampler2D photo;
uniform vec2 resolution, imageSize, light;
uniform float angle, relief, heightLod, sampleStep, veins, low, high, time, gamma, lodShift;
out vec4 color;

// Screen pixel (y down) to photo uv: rotate, then cover the rotated bounding box.
vec2 toPhoto(vec2 f) {
  vec2 q = f - resolution * 0.5;
  float c = cos(angle), s = sin(angle);
  q = mat2(c, -s, s, c) * q;
  vec2 box = vec2(abs(c) * resolution.x + abs(s) * resolution.y, abs(s) * resolution.x + abs(c) * resolution.y);
  float k = max(box.x / imageSize.x, box.y / imageSize.y);
  return q / (imageSize * k) + 0.5;
}
// Structural reads shift their mip level so a larger export keeps the tuned look;
// the fine relief reads the full-resolution level, which is where a larger export adds detail.
float luma(vec2 uv, float lod) { return dot(textureLod(photo, uv, lod + lodShift).rgb, vec3(0.299, 0.587, 0.114)); }
float fine(vec2 uv) { return dot(textureLod(photo, uv, 0.0).rgb, vec3(0.299, 0.587, 0.114)); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 f = vec2(gl_FragCoord.x, resolution.y - gl_FragCoord.y);
  vec2 uv = toPhoto(f);
  vec2 texel = 1.0 / imageSize;
  vec2 dx = vec2(texel.x * sampleStep, 0.0), dy = vec2(0.0, texel.y * sampleStep);
  float hl = luma(uv - dx, heightLod), hr = luma(uv + dx, heightLod), hu = luma(uv - dy, heightLod), hd = luma(uv + dy, heightLod);
  float dl = fine(uv - vec2(texel.x, 0.0)), dr = fine(uv + vec2(texel.x, 0.0));
  float du = fine(uv - vec2(0.0, texel.y)), dd = fine(uv + vec2(0.0, texel.y));
  vec3 normal = normalize(vec3((hl - hr) * relief + (dl - dr) * relief * 0.35, (hu - hd) * relief + (du - dd) * relief * 0.35, 1.0));

  vec2 toLight = (toPhoto(light) - uv) * imageSize;
  float dist = length(f - light) / max(resolution.x, resolution.y);
  vec3 lightDir = normalize(vec3(toLight / max(imageSize.x, imageSize.y) * 1.6, 0.55));
  float diffuse = max(dot(normal, lightDir), 0.0);
  float specular = pow(max(dot(normal, normalize(lightDir + vec3(0.0, 0.0, 1.0))), 0.0), 40.0);

  float t = clamp((luma(uv, 0.6) - low) / (high - low), 0.0, 1.0);
  t = smoothstep(0.0, 1.0, pow(t, gamma));
  vec3 c0 = vec3(0.020, 0.050, 0.033), c1 = vec3(0.085, 0.170, 0.115), c2 = vec3(0.200, 0.330, 0.240);
  vec3 base = t < 0.5 ? mix(c0, c1, t * 2.0) : mix(c1, c2, (t - 0.5) * 2.0);
  float falloff = 1.0 / (1.0 + dist * dist * 5.0);
  vec3 col = base * (0.42 + 1.25 * diffuse * (0.55 + 0.45 * falloff)) + vec3(0.75, 0.85, 0.7) * specular * 0.22 * falloff;

  if (veins > 0.5) {
    float bandPass = (luma(uv, 1.1) - luma(uv, 4.6)) / (high - low);
    float vein = smoothstep(0.08, 0.24, bandPass);
    float near = exp(-pow(length(f - light) / (resolution.y * 0.38), 2.0));
    float glow = vein * (0.09 + near);
    col = mix(col, vec3(0.84, 1.0, 0.36), clamp(glow * 0.7, 0.0, 1.0)) + vec3(0.84, 1.0, 0.36) * glow * 0.22;
  }
  col *= 1.0 - 0.35 * smoothstep(0.45, 1.1, length(f / resolution - 0.5) * 1.3);
  col += (hash(f + time) - 0.5) * 0.035;
  color = vec4(pow(col, vec3(0.92)), 1.0);
}`;

/** The canvas pixel ratio: the device ratio, capped at `maxPixelRatio`. */
export function canvasPixelRatio(devicePixelRatio: number | undefined): number {
  return Math.min(devicePixelRatio && devicePixelRatio > 0 ? devicePixelRatio : 1, maxPixelRatio);
}

/** Mip-level shift and sample-step scale that keep a preset's look on a photo exported at `imageWidth`. */
export function textureScale(preset: TexturePreset, imageWidth: number): { lodShift: number; sampleStep: number } {
  const ratio = imageWidth / preset.referenceWidth;
  return { lodShift: Math.log2(ratio), sampleStep: preset.sampleStep * ratio };
}

/** The 3rd and 97th percentile of a luminance sample: the range the gradient map stretches to. */
export function luminanceRange(luminance: ArrayLike<number>): { low: number; high: number } {
  const sorted = Array.from(luminance).sort((a, b) => a - b);
  if (sorted.length === 0) return { low: 0, high: 1 };
  const low = sorted[Math.floor(sorted.length * 0.03)];
  const high = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.97))];
  return high > low ? { low, high } : { low, high: low + 1e-3 };
}

/** Where the light rests when no pointer is over the band: a slow orbit in the upper right. */
export function idleLight(seconds: number, width: number, height: number): [number, number] {
  return [width * (0.62 + 0.22 * Math.cos(seconds * 0.35)), height * (0.32 + 0.18 * Math.sin(seconds * 0.47))];
}

type Size = { width: number; height: number };

function coverScale(angle: number, band: Size, image: Size): number {
  const c = Math.abs(Math.cos(angle));
  const s = Math.abs(Math.sin(angle));
  return Math.max((c * band.width + s * band.height) / image.width, (s * band.width + c * band.height) / image.height);
}

/** Band point (y down) to photo uv; the same mapping as `toPhoto` in the shader. */
export function bandToPhoto(point: [number, number], angle: number, band: Size, image: Size): [number, number] {
  const qx = point[0] - band.width / 2;
  const qy = point[1] - band.height / 2;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  // GLSL mat2(c, -s, s, c) is column-major: x' = c·x + s·y, y' = −s·x + c·y.
  const rx = c * qx + s * qy;
  const ry = -s * qx + c * qy;
  const k = coverScale(angle, band, image);
  return [rx / (image.width * k) + 0.5, ry / (image.height * k) + 0.5];
}

/** Photo uv to band point (y down): the inverse of `bandToPhoto`. */
export function photoToBand(uv: [number, number], angle: number, band: Size, image: Size): [number, number] {
  const k = coverScale(angle, band, image);
  const rx = (uv[0] - 0.5) * image.width * k;
  const ry = (uv[1] - 0.5) * image.height * k;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [c * rx - s * ry + band.width / 2, s * rx + c * ry + band.height / 2];
}

export type LuminanceSample = { width: number; height: number; luminance: ArrayLike<number> };

/**
 * The strongest vein points of a small luminance sample, in photo uv. A point's
 * strength is its luminance above the mean of its neighbourhood; picked points
 * keep a minimum distance so the nodes spread along the veins.
 */
export function pickVeinNodes(sample: LuminanceSample, { limit = 34, radius = 6, minDistance = 11, threshold = 0.05 } = {}): Array<{ u: number; v: number; strength: number }> {
  const { width, height, luminance } = sample;
  const candidates: Array<[number, number, number]> = [];
  for (let y = radius; y < height - radius; y += 1) {
    for (let x = radius; x < width - radius; x += 1) {
      let sum = 0;
      let count = 0;
      for (let j = -radius; j <= radius; j += 2) for (let i = -radius; i <= radius; i += 2) { sum += luminance[(y + j) * width + x + i]; count += 1; }
      const strength = luminance[y * width + x] - sum / count;
      if (strength > threshold) candidates.push([strength, x, y]);
    }
  }
  candidates.sort((a, b) => b[0] - a[0]);
  const picked: Array<[number, number, number]> = [];
  for (const candidate of candidates) {
    if (picked.length >= limit) break;
    if (picked.every((p) => (p[1] - candidate[1]) ** 2 + (p[2] - candidate[2]) ** 2 >= minDistance ** 2)) picked.push(candidate);
  }
  return picked.map(([strength, x, y]) => ({ u: (x + 0.5) / width, v: (y + 0.5) / height, strength }));
}

/** Band area per node, so a narrow phone band does not get as many nodes as a wide desktop band. */
export const bandAreaPerNode = 22_000;

/**
 * Vein nodes placed on the band, strongest first. Nodes outside the band are
 * dropped, and the count is capped by the band's area.
 */
export function placeVeinNodes(nodes: Array<{ u: number; v: number }>, angle: number, band: Size, image: Size): Array<[number, number]> {
  const limit = Math.max(1, Math.round((band.width * band.height) / bandAreaPerNode));
  return nodes
    .map((node) => photoToBand([node.u, node.v], angle, band, image))
    .filter(([x, y]) => x >= 0 && y >= 0 && x <= band.width && y <= band.height)
    .slice(0, limit);
}

/** A node glows near the light and dims to a faint trace away from it. */
export function nodeOpacity(node: [number, number], light: [number, number], bandHeight: number): number {
  const r = bandHeight * 0.42;
  const d2 = (node[0] - light[0]) ** 2 + (node[1] - light[1]) ** 2;
  return 0.12 + 0.88 * Math.exp(-d2 / (r * r));
}

export type PhotoGrade = {
  /** Draws one frame. `light` is in canvas pixels (y down); `time` seeds the film grain. */
  draw: (light: [number, number], time: number) => void;
  dispose: () => void;
};

/**
 * Compiles the grade and uploads the photo. Returns null when the shader cannot
 * compile, so the caller shows the still instead.
 *
 * This function uses only its arguments, so the asset export script can send its
 * source text into a headless browser and render the stills with the same code.
 */
export function createPhotoGrade(
  gl: WebGL2RenderingContext,
  sources: { vertex: string; fragment: string },
  photo: TexImageSource & { width: number; height: number },
  settings: { preset: TexturePreset; low: number; high: number; lodShift: number; sampleStep: number },
): PhotoGrade | null {
  const program = gl.createProgram();
  const shaders = [[gl.VERTEX_SHADER, sources.vertex], [gl.FRAGMENT_SHADER, sources.fragment]] as const;
  for (const [type, source] of shaders) {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return null;
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, photo);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);

  const at = (name: string) => gl.getUniformLocation(program, name);
  const { preset } = settings;
  gl.uniform1i(at("photo"), 0);
  gl.uniform2f(at("imageSize"), photo.width, photo.height);
  gl.uniform1f(at("angle"), preset.angle);
  gl.uniform1f(at("relief"), preset.relief);
  gl.uniform1f(at("heightLod"), preset.heightLod);
  gl.uniform1f(at("sampleStep"), settings.sampleStep);
  gl.uniform1f(at("veins"), preset.veins ? 1 : 0);
  gl.uniform1f(at("gamma"), preset.gamma);
  gl.uniform1f(at("low"), settings.low);
  gl.uniform1f(at("high"), settings.high);
  gl.uniform1f(at("lodShift"), settings.lodShift);
  const resolution = at("resolution");
  const light = at("light");
  const time = at("time");

  return {
    draw(point, seconds) {
      const canvas = gl.canvas;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(resolution, canvas.width, canvas.height);
      gl.uniform2f(light, point[0], point[1]);
      gl.uniform1f(time, seconds);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    dispose() {
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    },
  };
}

/** Luminance of a photo drawn small (160 px wide): the input for `luminanceRange` and `pickVeinNodes`. */
export function sampleLuminance(photo: CanvasImageSource & { width: number; height: number }, width = 160): LuminanceSample | null {
  const height = Math.max(1, Math.round((width * photo.height) / photo.width));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(photo, 0, 0, width, height);
  const data = context.getImageData(0, 0, width, height).data;
  const luminance = new Float32Array(width * height);
  for (let i = 0; i < luminance.length; i += 1) luminance[i] = (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) / 255;
  return { width, height, luminance };
}
