import { workspaceHomePath } from "@/lib/workspaceRoutes";

export const repositoryUrl = "https://github.com/YueCai335/garden-manager";

export type LandingFeature = {
  id: string;
  /** The header link and the section's kicker. */
  label: string;
  title: string;
  links: { label: string; href: string }[];
} & (
  | { text: string; points: string[] }
  /** A section with a guided showcase: numbered steps beside an animation, then one summary line. */
  | { showcase: "garden-plan" | "ai-note"; steps: { title: string; text: string }[]; summary: string }
);

/**
 * The landing sections in the order of a growing season: plan the garden, log the work,
 * then plan the next season (ADR-0073, ADR-0087). The header links follow this order.
 */
export const landingFeatures: LandingFeature[] = [
  {
    id: "garden-plan",
    label: "Garden Plan",
    title: "Draw your garden to scale",
    showcase: "garden-plan",
    // The three steps match the showcase's three layers and the plan's three levels (ADR-0084, ADR-0075).
    steps: [
      { title: "Draw your garden", text: "Trace your real plot. This one is a 10 × 6 m backyard." },
      { title: "Add planting areas", text: "Raised beds, pots, and in-ground beds, where they really stand." },
      { title: "Plant at real spacing", text: "Each circle is the room a plant needs." },
    ],
    summary: "One plan, from the whole garden down to every plant.",
    links: [{ label: "Try it", href: workspaceHomePath }],
  },
  {
    id: "ai-note",
    label: "AI Note",
    title: "Write one note, get reviewed records",
    showcase: "ai-note",
    // The three steps match the showcase's sequence: type, split, review and save (ADR-0088, ADR-0085).
    steps: [
      { title: "Write it your way", text: "One note about what you did, across all your gardens." },
      { title: "AI splits it into records", text: "Each job is matched to a garden, an area, and a plant." },
      { title: "You review, then save", text: "Nothing saves until you check it." },
    ],
    summary: "Records land in Care and tick off due tasks.",
    links: [{ label: "Try it", href: "/notes" }],
  },
  {
    id: "season-planner",
    label: "Season Planner",
    title: "Plan next season around crop rotation",
    text: "See where each crop can go next year, with the rotation rules applied to your own planting history.",
    points: [
      "Flags a crop family that returns to the same area too soon",
      "An AI assistant drafts where each crop can go, and you approve the plan",
    ],
    links: [{ label: "Try it", href: "/season" }],
  },
];
