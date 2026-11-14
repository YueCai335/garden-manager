import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PlantHealth } from "./PlantHealth";
import { PlantKnowledge } from "./PlantKnowledge";
import { createDemoGardenWorkspace } from "@/lib/gardenWorkspace";
import { useRuntimeConfig } from "./PortfolioFeaturePreview";

const garden = createDemoGardenWorkspace().gardens[0];
const props = { gardens: [garden], initialGardenId: garden.id, isServerBacked: true, workspaceId: "workspace" };

function BatchCapability() {
  const { config } = useRuntimeConfig();
  return <p>{config ? (config.careNoteBatchAvailable ? "Batch supported" : "Batch unsupported") : "Loading"}</p>;
}

describe("AI feature availability and recovery", () => {
  it.each([
    [{ portfolioDemo: false, careNoteBatchAvailable: true }, "Batch supported"],
    [{ portfolioDemo: false }, "Batch unsupported"],
    [{ portfolioDemo: true, careNoteBatchAvailable: true }, "Batch unsupported"],
  ])("requires an explicit local batch capability: %j", async (config, expected) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(config))));
    render(<BatchCapability />);
    expect(await screen.findByText(expected)).toBeVisible();
  });
  it.each(["Plant Doctor", "Plant Guide"])("keeps %s unavailable until settings load and supports an explicit retry", async (name) => {
    const user = userEvent.setup();
    let respond!: (response: Response) => void;
    const fetch = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { respond = resolve; }))
      .mockResolvedValue(new Response(JSON.stringify({ portfolioDemo: true })));
    vi.stubGlobal("fetch", fetch);
    render(name === "Plant Doctor" ? <PlantHealth {...props} onSave={vi.fn()} /> : <PlantKnowledge {...props} />);
    expect(screen.getByRole("heading", { name: `Loading ${name}` })).toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    respond(new Response("failed", { status: 503 }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Check your connection and try again");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: `${name} runs in the local app` })).toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each(["Plant Doctor", "Plant Guide"])("explains that %s needs a synced workspace", async (name) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ portfolioDemo: false }))));
    render(name === "Plant Doctor" ? <PlantHealth {...props} isServerBacked={false} onSave={vi.fn()} /> : <PlantKnowledge {...props} isServerBacked={false} />);
    expect(await screen.findByRole("heading", { name: "Sync your workspace" })).toBeVisible();
    expect(screen.getByText(`Your workspace needs to sync before ${name} is available. Check the save status and retry syncing.`)).toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("reports a photo upload separately and waits for an explicit assessment request", async () => {
    const user = userEvent.setup();
    let finishUpload!: (response: Response) => void;
    const fetch = vi.fn(async (url: string) => {
      if (url.endsWith("/runtime-config")) return new Response(JSON.stringify({ portfolioDemo: false }));
      if (url.endsWith("/plant-health/photos")) return new Promise<Response>((resolve) => { finishUpload = resolve; });
      throw new Error(`Unexpected request to ${url}`);
    });
    vi.stubGlobal("fetch", fetch);
    render(<PlantHealth {...props} onSave={vi.fn()} />);
    const input = await screen.findByLabelText("Photos (optional, up to 3)");
    await user.upload(input, new File(["photo"], "leaf.png", { type: "image/png" }));
    expect(screen.getByRole("status")).toHaveTextContent("Uploading photos…");
    expect(screen.getByRole("button", { name: "Create AI assessment" })).toBeDisabled();
    finishUpload(new Response(JSON.stringify({ path: "/uploads/leaf.png" })));
    expect(await screen.findByRole("button", { name: "Remove photo" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Create AI assessment" })).toBeEnabled();
    expect(fetch.mock.calls.some(([url]) => url.includes("/ai/plant-health-assessment"))).toBe(false);
  });

  it("keeps a failed question for retry and shows the successful answer's sources", async () => {
    const user = userEvent.setup();
    let attempt = 0;
    const fetch = vi.fn(async (url: string) => {
      if (url.endsWith("runtime-config")) return new Response(JSON.stringify({ portfolioDemo: false }));
      if (++attempt === 1) return new Response(JSON.stringify({ detail: "internal provider configuration" }), { status: 503 });
      return new Response(JSON.stringify({ answer: "Observe the leaves.", confidence: "low", followUpQuestions: [], citations: [{ sourceKey: "extension", title: "Leaf observations", publisher: "Extension", sourceUrl: "https://example.com/source", reviewedOn: "2026-09-01", excerpt: "Check both sides." }] }));
    });
    vi.stubGlobal("fetch", fetch);
    render(<PlantKnowledge {...props} />);
    fireEvent.change(await screen.findByLabelText("Question"), { target: { value: "Why are leaves yellow?" } });
    await user.click(screen.getByRole("button", { name: "Ask Plant Guide" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your input is kept");
    expect(screen.queryByText(/internal provider/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Question")).toHaveValue("Why are leaves yellow?");
    await user.click(screen.getByRole("button", { name: "Ask Plant Guide" }));
    expect(await screen.findByRole("link", { name: "Leaf observations" })).toHaveAttribute("href", "https://example.com/source");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await waitFor(() => expect(attempt).toBe(2));
  });
});
