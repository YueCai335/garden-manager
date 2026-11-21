import { describe, expect, it, vi } from "vitest";
import { createAiCareNoteBatch } from "./gardenWorkspaceApi";

describe("workspace care-note batch API", () => {
  it("sends one workspace-scoped note without any client target directory", async () => {
    const result = { drafts: [], notices: [{ sourceText: "明天浇水", reason: "planned", message: "Not completed." }] };
    const fetch = vi.fn(async () => new Response(JSON.stringify(result)));
    vi.stubGlobal("fetch", fetch);
    expect(await createAiCareNoteBatch("workspace/name", "明天浇水", "2026-11-11")).toEqual(result);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/workspaces/workspace%2Fname/ai/care-note-drafts"), expect.objectContaining({
      method: "POST", body: JSON.stringify({ note: "明天浇水", today: "2026-11-11" }),
    }));
  });

  it.each([
    [422, "This note has too many events. Split it into notes with at most 12 completed care records.", "at most 12"],
    [422, "internal provider configuration", "Check your note and device date"],
    [413, "internal context directory", "workspace is too large"],
    [403, "public batch closed", "unavailable in this demo"],
    [503, "internal provider configuration", "unavailable right now"],
  ])("explains a batch failure (%s) without trusting arbitrary server text", async (status, detail, expected) => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ detail }), { status }));
    vi.stubGlobal("fetch", fetch);
    await expect(createAiCareNoteBatch("w", "note", "2026-11-11")).rejects.toThrow(expected);
    expect(fetch).toHaveBeenCalledOnce();
  });
});
