/**
 * The width every element reports in jsdom (getBoundingClientRect). The
 * default 1000 px puts the Garden Plan editor in its overlay layout; tests of
 * the side-column layout set 1280 px. Reset before each test in setup.ts.
 */
export const testLayout = { width: 1000 };
