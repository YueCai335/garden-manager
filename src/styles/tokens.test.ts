import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ADR-0073 S5: checks the real colour tokens in tokens.css. Body text needs 4.5:1, and
 * large text, control borders, and other graphics need 3:1 (WCAG 2.1 AA).
 */
const css = readFileSync(join(__dirname, "tokens.css"), "utf8");
const declarations = new Map([...css.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));

function token(name: string, seen: string[] = []): string {
  const value = declarations.get(name);
  if (!value) throw new Error(`${name} is not defined in tokens.css`);
  const reference = value.match(/^var\((--[\w-]+)\)$/);
  if (!reference) return value.toLowerCase();
  if (seen.includes(name)) throw new Error(`${name} refers to itself`);
  return token(reference[1], [...seen, name]);
}

function luminance(hex: string) {
  const channels = hex.replace("#", "").match(/../g)!.map((pair) => parseInt(pair, 16) / 255);
  const [r, g, b] = channels.map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(first: string, second: string) {
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

const surfaces = ["--color-page", "--color-surface", "--color-soft"];

describe("ADR-0073 colour tokens", () => {
  it("uses the approved hue-free neutrals and content green", () => {
    expect({
      page: token("--color-page"), surface: token("--color-surface"), line: token("--color-line"),
      text: token("--color-text"), muted: token("--color-muted"), subtle: token("--color-ink-subtle"),
      brand: token("--color-brand"), brandHover: token("--color-brand-hover"), heading: token("--color-heading"),
    }).toEqual({
      page: "#f4f4f3", surface: "#ffffff", line: "#e3e3e1",
      text: "#18181a", muted: "#5f5f63", subtle: "#8d8d91",
      brand: "#1f4230", brandHover: "#285239", heading: "#173322",
    });
  });

  it("keeps every neutral free of a green tint", () => {
    for (const name of [...surfaces, "--color-line", "--color-text", "--color-muted", "--color-input-border"]) {
      const [r, g, b] = token(name).replace("#", "").match(/../g)!.map((pair) => parseInt(pair, 16));
      expect(Math.max(r, g, b) - Math.min(r, g, b), name).toBeLessThanOrEqual(4);
      expect(g, `${name} leans green`).toBeLessThanOrEqual(Math.max(r, b));
    }
  });

  it.each([
    ["--color-text", 4.5], ["--color-muted", 4.5], ["--color-heading", 4.5], ["--color-brand", 4.5],
    ["--color-error", 4.5], ["--color-warning", 4.5],
  ])("%s keeps %s:1 on the page, surface, and soft fill", (foreground, minimum) => {
    for (const background of surfaces) expect(contrast(token(foreground), token(background)), `${foreground} on ${background}`).toBeGreaterThanOrEqual(minimum);
  });

  it("gives form fields a 3:1 border on the page and on cards, where fields sit", () => {
    for (const background of ["--color-page", "--color-surface"]) expect(contrast(token("--color-input-border"), token(background))).toBeGreaterThanOrEqual(3);
  });

  it("keeps white text readable on the primary button in every state", () => {
    for (const state of ["--color-brand", "--color-brand-hover", "--color-brand-pressed"]) expect(contrast("#ffffff", token(state))).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps notices readable on their own surfaces", () => {
    expect(contrast(token("--color-error"), token("--color-error-surface"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("--color-warning"), token("--color-warning-surface"))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("ADR-0080 and ADR-0081 band tokens", () => {
  it("defines the shared band tokens once, with the approved values", () => {
    expect({
      base: token("--color-band-base"), ink: token("--color-band-ink"), lime: token("--color-accent-lime"),
      errorOnDark: token("--color-error-on-dark"), doneInk: token("--color-done-ink"), dash: token("--color-neutral-dash"),
    }).toEqual({ base: "#14281d", ink: "#0e1d14", lime: "#d6ff5c", errorOnDark: "#ffc9c2", doneInk: "#6b6b6f", dash: "#bdbdba" });
    for (const name of ["--color-band-base", "--color-accent-lime", "--color-done-ink"]) expect(css.match(new RegExp(`${name}:`, "g")), name).toHaveLength(1);
  });

  it("keeps struck-through titles, band text, and the dark-band error readable", () => {
    expect(contrast(token("--color-done-ink"), token("--color-surface"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#ffffff", token("--color-band-base"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("--color-band-ink"), "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("--color-error-on-dark"), token("--color-band-base"))).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the Care type icons on the glass card visible (ADR-0080)", () => {
    expect({ watering: token("--color-care-watering-on-dark"), fertilizing: token("--color-care-fertilizing-on-dark") }).toEqual({ watering: "#b4e1ee", fertilizing: "#edd08f" });
    for (const name of ["--color-care-watering-on-dark", "--color-care-fertilizing-on-dark"]) expect(contrast(token(name), token("--color-band-base"))).toBeGreaterThanOrEqual(3);
  });
});
