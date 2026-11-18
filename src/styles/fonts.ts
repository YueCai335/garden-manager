import { Bricolage_Grotesque } from "next/font/google";

/**
 * The display font (ADR-0073) for the landing page's large headings and the few
 * display places in the app (ADR-0080, ADR-0081). next/font serves it from this site.
 * Layouts put `displayFont.variable` on a wrapper so CSS can read `--font-bricolage`.
 */
export const displayFont = Bricolage_Grotesque({ subsets: ["latin"], display: "swap", variable: "--font-bricolage" });
