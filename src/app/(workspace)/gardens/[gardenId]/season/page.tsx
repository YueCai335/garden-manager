import type { Metadata } from "next";
import { GardenWorkspace } from "@/components/GardenWorkspace";
export const metadata: Metadata = { title: "Next Season · Garden Manager" };
export default async function Page({ params }: { params: Promise<{ gardenId: string }> }) {
  const { gardenId } = await params;
  return <GardenWorkspace key={gardenId} route={{ module: "season", gardenId }} />;
}
