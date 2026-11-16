import { workspaceHomePath } from "@/lib/workspaceRoutes";

export const repositoryUrl = "https://github.com/YueCai335/garden-manager";

export type LandingFeature = {
  id: string;
  /** The header link and the section's kicker. */
  label: string;
  title: string;
  text: string;
  points: string[];
  links: { label: string; href: string }[];
};

/**
 * The landing sections in the order of a growing season: plan the garden, log the work,
 * ask about a problem, then plan the next season (ADR-0073). The header links follow this order.
 */
export const landingFeatures: LandingFeature[] = [
  {
    id: "garden-plan",
    label: "Garden Plan",
    title: "Draw your garden to scale",
    text: "Lay out the whole garden on a metric plan, then zoom into one planting area to fill it with plants.",
    points: [
      "Raised beds, in-ground beds, and containers at their real size",
      "Plants placed at their real spacing",
      "One canvas from the whole garden down to a single bed",
    ],
    links: [{ label: "Try it", href: workspaceHomePath }],
  },
  {
    id: "ai-note",
    label: "AI Note",
    title: "Write one note, get reviewed records",
    text: "Describe what you did in the garden in your own words. The AI Note splits it into care records you review before saving.",
    points: [
      "One sentence becomes watering, feeding, and pruning records",
      "Nothing saves until you review it",
      "Care keeps every record and the tasks still due",
    ],
    links: [{ label: "Try it", href: "/notes" }],
  },
  {
    id: "plant-ai",
    label: "Plant AI",
    title: "Ask about a sick plant or a growing question",
    text: "Two assistants that show their work: one assesses what you see on a plant, the other answers from reviewed sources.",
    points: [
      "Plant Doctor turns your observations into an assessment you review before it joins the plant's health history",
      "Plant Guide answers gardening questions and cites the sources behind each answer",
    ],
    links: [{ label: "Try Plant Doctor", href: "/doctor" }, { label: "Try Plant Guide", href: "/guide" }],
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
