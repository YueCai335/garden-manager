/**
 * The width every element reports in jsdom (getBoundingClientRect), and the
 * viewport width that the matchMedia stub in setup.ts compares width queries
 * against. The default 800 px viewport puts the Garden Plan editor in its overlay
 * layout; tests of the wide layout (900 px and up) set 1280 px for both. Reset
 * before each test in setup.ts.
 */
export const testLayout = { width: 1000, viewportWidth: 800 };

/** Evaluates `(min-width: Npx)`, `(max-width: Npx)`, and `(width < Npx)` against the test viewport; other queries do not match. */
export function testMediaMatches(query: string) {
  const viewport = testLayout.viewportWidth;
  const min = /^\(min-width:\s*(\d+)px\)$/.exec(query);
  if (min) return viewport >= Number(min[1]);
  const max = /^\(max-width:\s*(\d+)px\)$/.exec(query);
  if (max) return viewport <= Number(max[1]);
  const below = /^\(width\s*<\s*(\d+)px\)$/.exec(query);
  if (below) return viewport < Number(below[1]);
  return false;
}
