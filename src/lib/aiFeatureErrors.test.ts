import { describe, expect, it, vi } from "vitest";
import { askPlantKnowledge, createAiCareNoteDraft, createPlantHealthAssessment, createSeasonAllocation, uploadPlantHealthPhoto } from "./gardenWorkspaceApi";

const requests = [
  ["guide", () => askPlantKnowledge("workspace", { question: "Why?" })],
  ["doctor", () => createPlantHealthAssessment("workspace", "garden", { symptoms: "Yellow leaves", severity: "low", photoCount: 0 })],
  ["note", () => createAiCareNoteDraft("workspace", "garden", "Watered today", "2026-11-11")],
  ["allocation", () => createSeasonAllocation("workspace", "garden", { crops: ["tomato"], preference: "" })],
  ["photo", () => uploadPlantHealthPhoto("workspace", "garden", new File(["photo"], "photo.png"))],
] as const;

describe("AI request error boundary", () => {
  it.each(requests)("does not expose a server detail for %s", async (_name, request) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: "provider at internal-host:1234, secret configuration" }), { status: 503 })));
    await expect(request()).rejects.toThrow(/(Try again|try again)/);
    await expect(request()).rejects.not.toThrow(/internal-host|secret configuration/);
  });

  it("preserves a recognized demo quota explanation and the request ID", async () => {
    const detail = "Today's AI drafts for the demo are used up. Try again tomorrow, or fill in the record manually.";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail }), { status: 429, headers: { "X-Care-Note-Request": "request-123" } })));
    await expect(createAiCareNoteDraft("w", "g", "Watered", "2026-11-11")).rejects.toMatchObject({ message: detail, requestId: "request-123" });
  });

  it.each([[413, "10 MB"], [415, "JPEG, PNG, or WebP"]])("explains how to correct an upload rejected with %s", async (status, message) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not json", { status })));
    await expect(uploadPlantHealthPhoto("w", "g", new File(["x"], "x.png"))).rejects.toThrow(message);
  });
});
