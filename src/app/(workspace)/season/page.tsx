import type { Metadata } from "next";
import { GardenWorkspace } from "@/components/GardenWorkspace";
export const metadata: Metadata = { title: "Next Season · Garden Manager" };
export default function Page() { return <GardenWorkspace route={{ module: "season" }} />; }
