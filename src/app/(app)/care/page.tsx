import type { Metadata } from "next";
import { GardenWorkspace } from "@/components/GardenWorkspace";
export const metadata: Metadata = { title: "Care · Garden Manager" };
export default function Page() { return <GardenWorkspace route={{ module: "care" }} />; }
