import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { resetTestRouter } from "@/test/router";
import { testLayout } from "@/test/layout";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GrowingAreaLayoutEditor } from "@/components/GrowingAreaLayoutEditor";
import { GardenWorkspace } from "@/test/WorkspaceHarness";
import { fitCanvas, metresToCanvas } from "@/lib/canvasViewport";
import { areaLocalToPlan } from "@/lib/planGeometry";
import { isCareNoteLiveEntryBuild } from "@/components/AiGardenNote";
import {
  areaFocusViewport,
  createDemoGardenWorkspace,
  createGarden,
  createGardenWorkspace,
  GARDEN_WORKSPACE_STORAGE_KEY,
  readGardenWorkspace,
  todayDate,
} from "@/lib/gardenWorkspace";
import { SERVER_WORKSPACE_STORAGE_KEY } from "@/test/WorkspaceHarness";

function openGardenDetails() {
  const edit = screen.queryByRole("button", { name: "Edit garden details" });
  if (edit) fireEvent.click(edit);
}

async function loadDemo(user: ReturnType<typeof userEvent.setup>) {
  render(<GardenWorkspace />);
  await user.click(await screen.findByRole("button", { name: "Load demo garden" }));
}

async function openPlantingArea(user: ReturnType<typeof userEvent.setup>, name: string) {
  await openSelectedGarden();
  await user.click(screen.getByLabelText(`Open ${name} on Garden Plan`));
  await screen.findByRole("heading", { name: "Edit planting area" });
}

function areaInspectorForm() {
  const form = screen.getByLabelText("Rotation (degrees)").closest("form");
  if (!form) throw new Error("Planting-area inspector form was not found");
  return within(form);
}

async function openSelectedGarden() {
  fireEvent.click(await screen.findByRole("link", { name: "Open Demo Garden" }));
  await screen.findByRole("heading", { name: "Garden Plan" });
}

async function openCare(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("link", { name: "Care" }));
  const gardenCard = screen.getByRole("heading", { name: "Demo Garden", level: 3 }).closest("article");
  if (!gardenCard) throw new Error("Demo Garden care card was not found");
  await user.click(within(gardenCard).getByRole("link", { name: "Open care" }));
}

async function confirmDialog(user: ReturnType<typeof userEvent.setup>, message?: string) {
  if (message) expect(screen.getByRole("alertdialog")).toHaveTextContent(message);
  await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: /^(Delete|Remove|Replace|Discard)/ }));
}

async function cancelDialog(user: ReturnType<typeof userEvent.setup>, message?: string) {
  if (message) expect(screen.getByRole("alertdialog")).toHaveTextContent(message);
  await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel" }));
}

describe("GardenWorkspace", () => {
  // Area journeys here use the side-column layout; the overlay and phone layouts have their own tests.
  beforeEach(() => { testLayout.width = 1280; });
  it("opens the Garden Plan directly from a garden thumbnail", async () => {
    const user = userEvent.setup();

    await loadDemo(user);
    await user.click(screen.getByRole("link", { name: "Open Demo Garden" }));
    expect(await screen.findByRole("heading", { name: "Demo Garden", level: 1 })).toHaveFocus();
    expect(screen.getByRole("navigation", { name: "Workspace sections" })).toBeInTheDocument();
  });

  it("places the Overview note action next to care tasks and keeps navigation in the header", async () => {
    const user = userEvent.setup();
    await loadDemo(user);

    const gallery = screen.getByRole("region", { name: /Your gardens/ });
    const tasks = screen.getByRole("complementary", { name: "Care tasks" });
    expect(within(gallery).getByRole("link", { name: "Open Demo Garden" })).toHaveAccessibleDescription(expect.stringContaining("Growing now:"));
    const card = screen.getByRole("region", { name: "AI Garden Notes" });
    const note = within(card).getByRole("button", { name: "Open note editor" });
    expect(note).toHaveAttribute("aria-haspopup", "dialog");
    expect(card.nextElementSibling).toBe(tasks);
    expect(within(gallery).getByRole("heading", { name: /Your gardens/ }).nextElementSibling).toBe(within(gallery).getByRole("link", { name: "Add garden" }));
    expect(within(screen.getByRole("banner")).queryByText("Record Garden Note")).not.toBeInTheDocument();
    const gardenTools = screen.getByRole("navigation", { name: "Workspace sections" });
    for (const name of ["Plant Doctor", "Plant Guide", "Next Season"]) {
      expect(within(gardenTools).getByRole("link", { name })).toBeInTheDocument();
    }
  });

  it("shows local AI feature previews in the public portfolio demo", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/runtime-config")) {
        return { ok: true, json: async () => ({ portfolioDemo: true }) };
      }
      return { ok: false, json: async () => ({}) };
    }));

    await loadDemo(user);
    await user.click(screen.getByRole("button", { name: "Open note editor" }));
    expect(await screen.findByRole("heading", { name: "AI Garden Note runs in the local app" })).toBeInTheDocument();
    expect(screen.getByText("Completed care note")).toBeInTheDocument();
    expect(screen.getByText(/This is a read-only example/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(within(screen.getByRole("navigation", { name: "Workspace sections" })).getByRole("link", { name: "Plant Doctor" }));
    expect(await screen.findByRole("heading", { name: "Plant Doctor runs in the local app" })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Back to gardens" }));
    await user.click(within(screen.getByRole("navigation", { name: "Workspace sections" })).getByRole("link", { name: "Plant Guide" }));
    expect(await screen.findByRole("heading", { name: "Plant Guide runs in the local app" })).toBeInTheDocument();
    expect(screen.queryByText("Import gardens to PostgreSQL first")).not.toBeInTheDocument();
  });

  it("syncs browser gardens to PostgreSQL automatically, reloads from PostgreSQL, and saves a later edit", async () => {
    const user = userEvent.setup();
    const workspace = createDemoGardenWorkspace();
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => ({
      ok: true,
      json: async () => JSON.parse(String(init?.body ?? JSON.stringify({ workspaceId: "server-workspace", ...workspace }))),
    }));
    vi.stubGlobal("fetch", fetch);
    window.localStorage.setItem(GARDEN_WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));

    const firstRender = render(<GardenWorkspace />);
    await openSelectedGarden();
    await waitFor(() => expect(window.localStorage.getItem(SERVER_WORKSPACE_STORAGE_KEY)).not.toBeNull());
    const importCall = fetch.mock.calls.find(([url]) => /\/import$/.test(url))!;
    const importedPayload = JSON.parse(String(importCall[1]?.body));
    expect(importCall[0]).toMatch(/\/import$/);
    const savedBrowserWorkspace = JSON.parse(window.localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY)!);
    expect(savedBrowserWorkspace.gardens[0].growingAreas[0].layout.allocations[0].plantingRecordId).toBe("demo-planting-tomatoes");
    expect(window.localStorage.getItem(SERVER_WORKSPACE_STORAGE_KEY)).toBe(importedPayload.workspaceId);

    await user.click(screen.getByLabelText("Open Sample raised bed on Garden Plan"));
    await user.clear(screen.getByLabelText("Rotation (degrees)"));
    await user.type(screen.getByLabelText("Rotation (degrees)"), "45");
    await user.click(areaInspectorForm().getByRole("button", { name: "Save" }));
    await waitFor(() => expect(fetch.mock.calls).toContainEqual([
      expect.stringMatching(/\/workspaces\/local-/),
      expect.objectContaining({ method: "PUT" }),
    ]));

    firstRender.unmount();
    resetTestRouter();
    fetch.mockClear();
    render(<GardenWorkspace />);
    await screen.findByRole("link", { name: "Next Season" });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/workspaces\/local-/),
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it("keeps an edit made while the first PostgreSQL import is still in flight", async () => {
    const user = userEvent.setup();
    const workspace = createDemoGardenWorkspace();
    let finishImport: (() => void) | undefined;
    const importFinished = new Promise<void>((resolve) => {
      finishImport = resolve;
    });
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (/\/import$/.test(url)) await importFinished;
      return {
        ok: true,
        json: async () => JSON.parse(String(init?.body)),
      };
    });
    vi.stubGlobal("fetch", fetch);
    window.localStorage.setItem(GARDEN_WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));

    render(<GardenWorkspace />);
    await openSelectedGarden();
    await waitFor(() => expect(fetch.mock.calls.some(([url]) => /\/import$/.test(url))).toBe(true));

    // The import is still pending; the gardener renames the garden meanwhile.
    openGardenDetails();
    fireEvent.change(screen.getByLabelText("Garden name"), { target: { value: "Renamed while syncing" } });
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY) ?? "{}").gardens[0].name).toBe("Renamed while syncing"));

    finishImport?.();
    await waitFor(() => expect(window.localStorage.getItem(SERVER_WORKSPACE_STORAGE_KEY)).not.toBeNull());

    // The stale import response must not win over the newer edit...
    openGardenDetails();
    expect(screen.getByLabelText("Garden name")).toHaveValue("Renamed while syncing");
    // ...and the newer edit must reach PostgreSQL.
    await waitFor(() => {
      const put = fetch.mock.calls.find(([url, init]) => init?.method === "PUT" && !/\/import$/.test(url));
      expect(put).toBeDefined();
      expect(JSON.parse(String(put?.[1]?.body)).gardens[0].name).toBe("Renamed while syncing");
    });
  });

  it("surfaces a save conflict from another tab and lets the gardener reload the newer copy", async () => {
    const user = userEvent.setup();
    const workspace = createDemoGardenWorkspace();
    const otherTabCopy = { ...workspace, gardens: [{ ...workspace.gardens[0], name: "Renamed in another tab" }] };
    let serverCopy = { workspaceId: "server-workspace", revision: 0, ...workspace };
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        // Another tab has already moved the server on to revision 3.
        serverCopy = { workspaceId: "server-workspace", revision: 3, ...otherTabCopy };
        return { ok: false, status: 409, json: async () => ({ detail: { message: "stale", currentRevision: 3 } }) };
      }
      return { ok: true, status: 200, json: async () => serverCopy };
    });
    vi.stubGlobal("fetch", fetch);
    window.localStorage.setItem(SERVER_WORKSPACE_STORAGE_KEY, "server-workspace");

    render(<GardenWorkspace />);
    await openSelectedGarden();
    openGardenDetails();
    fireEvent.change(screen.getByLabelText("Garden name"), { target: { value: "Renamed here" } });
    await user.click(screen.getByRole("button", { name: "Save" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("changed in another tab");
    // Local edits stay on screen until the gardener decides.
    openGardenDetails();
    expect(screen.getByLabelText("Garden name")).toHaveValue("Renamed here");

    await user.click(screen.getByRole("button", { name: "Reload latest" }));
    await user.click(screen.getByRole("button", { name: "Discard unsynced changes and reload" }));
    openGardenDetails();
    await waitFor(() => expect(screen.getByLabelText("Garden name")).toHaveValue("Renamed in another tab"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("lets the gardener keep local changes after a save conflict by saving over the newer revision", async () => {
    const user = userEvent.setup();
    const workspace = createDemoGardenWorkspace();
    let currentRevision = 0;
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        const sent = JSON.parse(String(init.body));
        if (sent.revision !== currentRevision)
          return { ok: false, status: 409, json: async () => ({ detail: { message: "stale", currentRevision } }) };
        currentRevision += 1;
        return { ok: true, status: 200, json: async () => ({ ...sent, revision: currentRevision }) };
      }
      return { ok: true, status: 200, json: async () => ({ workspaceId: "server-workspace", revision: 0, ...workspace }) };
    });
    vi.stubGlobal("fetch", fetch);
    window.localStorage.setItem(SERVER_WORKSPACE_STORAGE_KEY, "server-workspace");

    render(<GardenWorkspace />);
    await openSelectedGarden();
    // Another tab saved first: the server is now at revision 1 while this tab still holds 0.
    currentRevision = 1;
    openGardenDetails();
    fireEvent.change(screen.getByLabelText("Garden name"), { target: { value: "Renamed here" } });
    await user.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "Keep my changes" }));
    await user.click(screen.getByRole("button", { name: "Replace server version" }));

    await waitFor(() => {
      const accepted = fetch.mock.calls.filter(([, init]) => init?.method === "PUT").map(([, init]) => JSON.parse(String(init?.body)));
      expect(accepted.at(-1)?.revision).toBe(1);
      expect(accepted.at(-1)?.gardens[0].name).toBe("Renamed here");
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await screen.findByText("All changes saved");
  });

  function queuedSaveHarness() {
    const workspace = createDemoGardenWorkspace();
    const chosenServerCopy = { ...workspace, gardens: [{ ...workspace.gardens[0], name: "Chosen server copy" }] };
    let serverRevision = 0;
    let serverCopy = workspace;
    const pendingPuts: Array<{ sent: { revision: number; gardens: Array<{ name: string }> }; resolve: (response: unknown) => void }> = [];
    const acceptedPuts: Array<{ revision: number; gardens: Array<{ name: string }> }> = [];
    const fetch = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        const sent = JSON.parse(String(init.body));
        return new Promise((resolve) => pendingPuts.push({ sent, resolve }));
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ workspaceId: "server-workspace", revision: serverRevision, ...serverCopy }) });
    });
    vi.stubGlobal("fetch", fetch);
    window.localStorage.setItem(SERVER_WORKSPACE_STORAGE_KEY, "server-workspace");

    return {
      pendingPuts,
      acceptedPuts,
      /** Another tab saves: the server moves on and now holds "Chosen server copy". */
      otherTabSaves() {
        serverRevision = 5;
        serverCopy = chosenServerCopy;
      },
      /** Answer the oldest pending PUT the way the real server would. */
      answerOldestPut() {
        const put = pendingPuts.shift();
        if (!put) throw new Error("no pending PUT");
        if (put.sent.revision !== serverRevision) {
          put.resolve({ ok: false, status: 409, json: async () => ({ detail: { message: "stale", currentRevision: serverRevision } }) });
          return "409";
        }
        serverRevision += 1;
        acceptedPuts.push(put.sent);
        put.resolve({ ok: true, status: 200, json: async () => ({ ...put.sent, revision: serverRevision }) });
        return "200";
      },
    };
  }

  async function saveGardenField(user: ReturnType<typeof userEvent.setup>, label: string, value: string) {
    openGardenDetails();
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
    await user.click(screen.getByRole("button", { name: "Save" }));
  }

  it("drops queued and in-flight saves once the gardener reloads the server copy after a conflict", async () => {
    const user = userEvent.setup();
    const harness = queuedSaveHarness();

    render(<GardenWorkspace />);
    await openSelectedGarden();
    harness.otherTabSaves();

    // Three quick edits: A is sent, B and C wait behind it in the queue.
    await saveGardenField(user, "Garden name", "Local edit A");
    await waitFor(() => expect(harness.pendingPuts).toHaveLength(1));
    await saveGardenField(user, "Garden name", "Local edit B");
    await saveGardenField(user, "Garden name", "Local edit C");

    expect(harness.answerOldestPut()).toBe("409");
    await screen.findByRole("alert");
    // B and C were queued behind A. Once A conflicts they are stale and must not be sent.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(harness.pendingPuts).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Reload latest" }));
    await user.click(screen.getByRole("button", { name: "Discard unsynced changes and reload" }));
    openGardenDetails();
    await waitFor(() => expect(screen.getByLabelText("Garden name")).toHaveValue("Chosen server copy"));

    // Nothing may overwrite the copy the gardener just chose.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(harness.pendingPuts).toHaveLength(0);
    expect(harness.acceptedPuts).toEqual([]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    openGardenDetails();
    expect(screen.getByLabelText("Garden name")).toHaveValue("Chosen server copy");
  });

  it("sends only the current local copy when the gardener keeps their changes after a conflict", async () => {
    const user = userEvent.setup();
    const harness = queuedSaveHarness();

    render(<GardenWorkspace />);
    await openSelectedGarden();
    harness.otherTabSaves();

    await saveGardenField(user, "Garden name", "Local edit A");
    await waitFor(() => expect(harness.pendingPuts).toHaveLength(1));
    await saveGardenField(user, "Garden name", "Local edit B");
    await saveGardenField(user, "Garden name", "Local edit C");

    expect(harness.answerOldestPut()).toBe("409");
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "Keep my changes" }));
    await user.click(screen.getByRole("button", { name: "Replace server version" }));

    // Whatever is still queued from before the choice is answered; only the
    // save made for the gardener's choice may be accepted.
    await waitFor(() => expect(harness.pendingPuts.length).toBeGreaterThan(0));
    while (harness.pendingPuts.length) {
      harness.answerOldestPut();
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(harness.acceptedPuts.map((put) => put.gardens[0].name)).toEqual(["Local edit C"]);
    expect(harness.acceptedPuts[0].revision).toBe(5);
    await screen.findByText("All changes saved");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps browser gardens active and usable when PostgreSQL is unreachable", async () => {
    const workspace = createDemoGardenWorkspace();
    const fetch = vi.fn(async () => ({ ok: false, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetch);
    window.localStorage.setItem(GARDEN_WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));

    render(<GardenWorkspace />);
    await openSelectedGarden();
    await waitFor(() => expect(fetch).toHaveBeenCalled());

    expect(window.localStorage.getItem(SERVER_WORKSPACE_STORAGE_KEY)).toBeNull();
    expect(screen.getByText("Saved on this device")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Garden Plan" })).toBeInTheDocument();
  });

  it("reports a PostgreSQL save failure without returning to browser storage", async () => {
    const user = userEvent.setup();
    const workspace = createDemoGardenWorkspace();
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => ({
      ok: !init?.method,
      json: async () => ({ workspaceId: "server-workspace", ...workspace }),
    }));
    vi.stubGlobal("fetch", fetch);
    window.localStorage.setItem(GARDEN_WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));
    window.localStorage.setItem(SERVER_WORKSPACE_STORAGE_KEY, "server-workspace");

    render(<GardenWorkspace />);
    await openSelectedGarden();
    await user.click(screen.getByLabelText("Open Sample raised bed on Garden Plan"));
    await user.clear(screen.getByLabelText("Rotation (degrees)"));
    await user.type(screen.getByLabelText("Rotation (degrees)"), "45");
    await user.click(areaInspectorForm().getByRole("button", { name: "Save" }));

    await screen.findByText("Changes not synced");
    expect(window.localStorage.getItem(SERVER_WORKSPACE_STORAGE_KEY)).toBe("server-workspace");
    expect(window.localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY)).toBe(JSON.stringify(workspace));
  });

  const fertilizingDraft = {
    kind: "completed",
    type: "fertilizing",
    date: "2026-08-31",
    note: "昨天施了 10 mL 鱼肥。",
    targetScope: "planting-area",
    growingAreaId: "demo-raised-bed",
    growingAreaName: "Sample raised bed",
    plantingRecordId: null,
    plantingRecordName: null,
    fertilizerProduct: "Fish fertilizer",
    fertilizerAmount: 10,
    fertilizerUnit: "mL",
    reviewNotes: [],
  };

  function emptyDraft(overrides: Record<string, unknown>) {
    return {
      ...fertilizingDraft,
      type: null,
      date: null,
      targetScope: null,
      growingAreaId: null,
      growingAreaName: null,
      fertilizerProduct: null,
      fertilizerAmount: null,
      fertilizerUnit: null,
      ...overrides,
    };
  }

  /** Opens AI Garden Note on a server-backed demo workspace whose draft endpoint returns `draft`. */
  async function openAiGardenNote(
    user: ReturnType<typeof userEvent.setup>,
    draft: () => Promise<unknown>,
    options: {
      runtimeConfig?: Record<string, boolean>;
      /** Replaces the runtime-config response entirely, e.g. to hang or fail. */
      runtimeConfigResponse?: () => Promise<unknown>;
      workspace?: ReturnType<typeof createDemoGardenWorkspace>;
      draftHeaders?: Record<string, string>;
      /** Builds the frontend with NEXT_PUBLIC_CARE_NOTE_LIVE_ENTRY="true". */
      liveEntry?: boolean;
    } = {},
  ) {
    if (options.liveEntry) vi.stubEnv("NEXT_PUBLIC_CARE_NOTE_LIVE_ENTRY", "true");
    const workspace = options.workspace ?? createDemoGardenWorkspace();
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/ai/care-note-draft")) return { ok: true, headers: new Headers(options.draftHeaders), json: async () => draft() };
      if (url.includes("/runtime-config") && options.runtimeConfigResponse) return options.runtimeConfigResponse();
      if (url.includes("/runtime-config") && options.runtimeConfig) return { ok: true, json: async () => options.runtimeConfig };
      return {
        ok: true,
        json: async () => init?.method ? JSON.parse(String(init.body)) : { workspaceId: "server-workspace", ...workspace },
      };
    });
    vi.stubGlobal("fetch", fetch);
    window.localStorage.setItem(SERVER_WORKSPACE_STORAGE_KEY, "server-workspace");
    resetTestRouter("/notes");
    render(<GardenWorkspace />);
    if (!options.runtimeConfigResponse && !options.runtimeConfig?.portfolioDemo) {
      await user.selectOptions(await screen.findByLabelText("Garden", { selector: "select" }), workspace.gardens[0].id);
    }
    const draftRequests = () => fetch.mock.calls.filter(([url]) => String(url).includes("/ai/care-note-draft"));
    return { draftRequests };
  }

  it("reviews an AI garden note before saving it to Care History", async () => {
    const user = userEvent.setup();
    const { draftRequests } = await openAiGardenNote(user, async () => fertilizingDraft);

    await user.type(screen.getByLabelText("Care note"), "昨天施了 10 mL 鱼肥。");
    await user.click(screen.getByRole("button", { name: "Create draft" }));
    expect(await screen.findByRole("heading", { name: "AI extracted draft" })).toBeInTheDocument();
    expect(screen.getByLabelText("Fertilizer product (optional)")).toHaveValue("Fish fertilizer");
    expect(screen.queryByText("AI care draft saved to Care History.")).not.toBeInTheDocument();
    // "Today" is the gardener's local date, sent with the note (ADR-0058).
    expect(JSON.parse(String(draftRequests()[0][1]?.body))).toEqual({ note: "昨天施了 10 mL 鱼肥。", today: todayDate() });

    await user.click(screen.getByRole("button", { name: "Save to Care History" }));
    expect(screen.getByRole("heading", { name: "History" })).toBeInTheDocument();
    expect(screen.getByText(/Fish fertilizer/)).toBeInTheDocument();
  });

  const publicDemo = { portfolioDemo: true, careNotePublicAvailable: true };

  it("runs live AI Garden Note drafts in the public demo when the server allows them", async () => {
    const user = userEvent.setup();
    await openAiGardenNote(user, async () => fertilizingDraft, { runtimeConfig: publicDemo, liveEntry: true });

    expect(await screen.findByText(/Demo drafts use the example Demo Garden/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Care note"), "昨天施了 10 mL 鱼肥。");
    await user.click(screen.getByRole("button", { name: "Create draft" }));
    await screen.findByRole("heading", { name: "AI extracted draft" });
    expect(screen.queryByRole("option", { name: "All gardens" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save to Care History" }));
    expect(screen.getByText(/Fish fertilizer/)).toBeInTheDocument();
  });

  it.each([
    { liveEntry: false, serverAvailable: false, live: false },
    { liveEntry: true, serverAvailable: false, live: false },
    { liveEntry: false, serverAvailable: true, live: false },
    { liveEntry: true, serverAvailable: true, live: true },
  ])(
    "public demo with live-entry build $liveEntry and server availability $serverAvailable shows the live form: $live",
    async ({ liveEntry, serverAvailable, live }) => {
      const user = userEvent.setup();
      await openAiGardenNote(user, async () => fertilizingDraft, {
        runtimeConfig: { portfolioDemo: true, careNotePublicAvailable: serverAvailable },
        liveEntry,
      });

      if (live) {
        expect(await screen.findByLabelText("Care note")).toBeInTheDocument();
      } else {
        expect(await screen.findByText("Sample review state")).toBeInTheDocument();
        expect(screen.queryByLabelText("Care note")).not.toBeInTheDocument();
      }
    },
  );

  it("generates in the local app whatever the live-entry build switch says", async () => {
    const user = userEvent.setup();
    vi.stubEnv("NEXT_PUBLIC_CARE_NOTE_LIVE_ENTRY", "false");
    await openAiGardenNote(user, async () => fertilizingDraft, { runtimeConfig: { portfolioDemo: false, careNotePublicAvailable: false } });

    await user.type(await screen.findByLabelText("Care note"), "昨天施了 10 mL 鱼肥。");
    await user.click(screen.getByRole("button", { name: "Create draft" }));
    expect(await screen.findByRole("heading", { name: "AI extracted draft" })).toBeInTheDocument();
  });

  it("opens the live entry only for the exact string true", async () => {
    for (const value of ["TRUE", "1", "yes", " true", ""]) {
      vi.stubEnv("NEXT_PUBLIC_CARE_NOTE_LIVE_ENTRY", value);
      expect(isCareNoteLiveEntryBuild()).toBe(false);
    }
    vi.stubEnv("NEXT_PUBLIC_CARE_NOTE_LIVE_ENTRY", "true");
    expect(isCareNoteLiveEntryBuild()).toBe(true);
  });

  it("shows the public request ID so a check can be matched to its log line", async () => {
    const user = userEvent.setup();
    await openAiGardenNote(user, async () => fertilizingDraft, {
      runtimeConfig: publicDemo,
      liveEntry: true,
      draftHeaders: { "X-Care-Note-Request": "a1b2c3d4e5f6" },
    });

    await user.type(await screen.findByLabelText("Care note"), "昨天施了 10 mL 鱼肥。");
    await user.click(screen.getByRole("button", { name: "Create draft" }));

    expect(await screen.findByText("Request ID: a1b2c3d4e5f6")).toBeInTheDocument();
  });

  it("shows the preview in the public demo when live drafts are closed", async () => {
    const user = userEvent.setup();
    await openAiGardenNote(user, async () => fertilizingDraft, { runtimeConfig: { portfolioDemo: true, careNotePublicAvailable: false } });

    expect(await screen.findByText("Sample review state")).toBeInTheDocument();
    expect(screen.queryByLabelText("Care note")).not.toBeInTheDocument();
  });

  it("does not save a demo draft whose proposed area was renamed in the visitor's garden", async () => {
    const user = userEvent.setup();
    const workspace = createDemoGardenWorkspace();
    workspace.gardens[0].growingAreas[0] = { ...workspace.gardens[0].growingAreas[0], name: "Herb bed" };
    await openAiGardenNote(user, async () => fertilizingDraft, { runtimeConfig: publicDemo, workspace, liveEntry: true });

    await user.type(await screen.findByLabelText("Care note"), "昨天施了 10 mL 鱼肥。");
    await user.click(screen.getByRole("button", { name: "Create draft" }));
    await screen.findByRole("heading", { name: "AI extracted draft" });
    await user.click(screen.getByRole("button", { name: "Save to Care History" }));

    expect(screen.getByRole("alert")).toHaveTextContent("The example garden has changed since this draft was made.");
    expect(screen.getByLabelText("Target")).toHaveValue("");

    // A target the visitor picks themselves is their own choice.
    await user.selectOptions(screen.getByLabelText("Target"), "Herb bed");
    await user.click(screen.getByRole("button", { name: "Save to Care History" }));
    expect(screen.getByRole("heading", { name: "History" })).toBeInTheDocument();
  });

  it("does not save a demo draft whose proposed plant group moved to another area", async () => {
    const user = userEvent.setup();
    const workspace = createDemoGardenWorkspace();
    const tomatoes = workspace.gardens[0].plantings.findIndex((planting) => planting.id === "demo-planting-tomatoes");
    workspace.gardens[0].plantings[tomatoes] = { ...workspace.gardens[0].plantings[tomatoes], growingAreaId: "demo-in-ground-area" };
    const tomatoDraft = {
      ...fertilizingDraft,
      targetScope: "plant-group",
      growingAreaId: null,
      growingAreaName: null,
      plantingRecordId: "demo-planting-tomatoes",
      plantingRecordName: "Tomatoes · Sample raised bed",
    };
    await openAiGardenNote(user, async () => tomatoDraft, { runtimeConfig: publicDemo, workspace, liveEntry: true });

    await user.type(await screen.findByLabelText("Care note"), "昨天给番茄施了 10 mL 鱼肥。");
    await user.click(screen.getByRole("button", { name: "Create draft" }));
    await screen.findByRole("heading", { name: "AI extracted draft" });
    await user.click(screen.getByRole("button", { name: "Save to Care History" }));

    expect(screen.getByRole("alert")).toHaveTextContent("The example garden has changed since this draft was made.");
    expect(screen.queryByRole("heading", { name: "History" })).not.toBeInTheDocument();
  });

  it("offers no generation while the runtime settings are still loading", async () => {
    const user = userEvent.setup();
    await openAiGardenNote(user, async () => fertilizingDraft, { runtimeConfigResponse: () => new Promise(() => undefined) });

    expect(await screen.findByRole("heading", { name: "Loading AI Garden Note" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Care note")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create draft" })).not.toBeInTheDocument();
  });

  it("offers no generation when the runtime settings fail to load, and retries on request", async () => {
    const user = userEvent.setup();
    let settingsAvailable = false;
    await openAiGardenNote(user, async () => fertilizingDraft, {
      runtimeConfigResponse: async () => (!settingsAvailable ? { ok: false, json: async () => ({}) } : { ok: true, json: async () => publicDemo }),
      liveEntry: true,
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("The garden server did not answer.");
    expect(screen.queryByLabelText("Care note")).not.toBeInTheDocument();

    settingsAvailable = true;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByLabelText("Care note")).toBeInTheDocument();
    expect(screen.getByText(/Demo drafts use the example Demo Garden/)).toBeInTheDocument();
  });

  it("saves one care event when Save to Care History is double-clicked", async () => {
    const user = userEvent.setup();
    await openAiGardenNote(user, async () => fertilizingDraft);

    await user.type(screen.getByLabelText("Care note"), "昨天施了 10 mL 鱼肥。");
    await user.click(screen.getByRole("button", { name: "Create draft" }));
    await user.dblClick(await screen.findByRole("button", { name: "Save to Care History" }));

    expect(screen.getAllByText(/Fish fertilizer/)).toHaveLength(1);
  });

  it("sends one draft request when Create draft is double-clicked", async () => {
    const user = userEvent.setup();
    let finish: (value: unknown) => void = () => undefined;
    const { draftRequests } = await openAiGardenNote(user, () => new Promise((resolve) => { finish = resolve; }));

    await user.type(screen.getByLabelText("Care note"), "昨天施了 10 mL 鱼肥。");
    await user.dblClick(screen.getByRole("button", { name: "Create draft" }));
    finish(fertilizingDraft);

    expect(await screen.findByRole("heading", { name: "AI extracted draft" })).toBeInTheDocument();
    expect(draftRequests()).toHaveLength(1);
  });

  it("shows why a negated note has no draft and offers manual entry", async () => {
    const user = userEvent.setup();
    await openAiGardenNote(user, async () => emptyDraft({
      kind: "negated",
      note: "今天没给番茄浇水",
      reviewNotes: ["This note says the care did not happen, so there is nothing to record."],
    }));

    await user.type(screen.getByLabelText("Care note"), "今天没给番茄浇水");
    await user.click(screen.getByRole("button", { name: "Create draft" }));

    expect(await screen.findByText("This note says the care did not happen, so there is nothing to record.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "AI extracted draft" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Care note")).toHaveValue("今天没给番茄浇水");

    await user.click(screen.getByRole("button", { name: "Fill in the record manually" }));
    expect(screen.getByRole("heading", { name: "Manual care record" })).toBeInTheDocument();
    expect(screen.getByLabelText("Care type")).toHaveValue("");
    expect(screen.getByLabelText("Target")).toHaveValue("");
  });

  it("requires a target before saving a draft whose note named none", async () => {
    const user = userEvent.setup();
    await openAiGardenNote(user, async () => emptyDraft({
      type: "watering",
      date: "2026-08-31",
      note: "今天浇了水。",
      reviewNotes: ["Choose a target before saving."],
    }));

    await user.type(screen.getByLabelText("Care note"), "今天浇了水。");
    await user.click(screen.getByRole("button", { name: "Create draft" }));
    expect(await screen.findByLabelText("Target")).toHaveValue("");

    await user.click(screen.getByRole("button", { name: "Save to Care History" }));
    expect(screen.getByLabelText("Target")).toHaveAccessibleDescription("Choose a target before saving.");
    expect(screen.getByLabelText("Target")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Target")).toHaveFocus();
    expect(screen.getByRole("heading", { name: "AI extracted draft" })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Target"), "Sample raised bed");
    await user.click(screen.getByRole("button", { name: "Save to Care History" }));
    expect(screen.getByRole("heading", { name: "History" })).toBeInTheDocument();
  });

  it("discards a draft when the note changes", async () => {
    const user = userEvent.setup();
    await openAiGardenNote(user, async () => fertilizingDraft);

    await user.type(screen.getByLabelText("Care note"), "昨天施了 10 mL 鱼肥。");
    await user.click(screen.getByRole("button", { name: "Create draft" }));
    await screen.findByRole("heading", { name: "AI extracted draft" });
    await user.type(screen.getByLabelText("Care note"), "!");

    expect(screen.queryByRole("heading", { name: "AI extracted draft" })).not.toBeInTheDocument();
  });

  it("blocks a note longer than 500 characters before sending it", async () => {
    const user = userEvent.setup();
    const { draftRequests } = await openAiGardenNote(user, async () => fertilizingDraft);

    fireEvent.change(screen.getByLabelText("Care note"), { target: { value: "浇".repeat(500) } });
    expect(screen.getByRole("button", { name: "Create draft" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Care note"), { target: { value: "浇".repeat(501) } });
    expect(screen.getByText("Shorten the note to 500 characters or fewer (501 now).")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create draft" })).toBeDisabled();
    expect(draftRequests()).toHaveLength(0);
  });

  it("reviews an AI plant-health assessment before saving it to health history", async () => {
    const user = userEvent.setup();
    const workspace = createDemoGardenWorkspace();
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/ai/plant-health-assessment")) {
        return {
          ok: true,
          json: async () => ({
            summary: "White coating needs a closer look.",
            possibleIssues: ["Powdery mildew"],
            nextSteps: ["Check nearby leaves tomorrow."],
            followUpQuestions: ["Does it wipe away?"],
            confidence: "low",
          }),
        };
      }
      return {
        ok: true,
        json: async () => init?.method ? JSON.parse(String(init.body)) : { workspaceId: "server-workspace", ...workspace },
      };
    });
    vi.stubGlobal("fetch", fetch);
    window.localStorage.setItem(SERVER_WORKSPACE_STORAGE_KEY, "server-workspace");

    render(<GardenWorkspace />);
    await user.click(await screen.findByRole("link", { name: "Plant Doctor" }));
    await user.selectOptions(await screen.findByLabelText("Choose a garden for this record"), workspace.gardens[0].id);
    await user.type(screen.getByLabelText("What do you observe?"), "White coating on the lower leaves.");
    await user.click(screen.getByRole("button", { name: "Create AI assessment" }));
    expect(await screen.findByRole("heading", { name: "Review assessment" })).toBeInTheDocument();
    expect(screen.getByLabelText("Summary")).toHaveValue("White coating needs a closer look.");

    await user.click(screen.getByRole("button", { name: "Save health record" }));
    const history = screen.getByRole("heading", { name: "Health history" }).closest("section");
    if (!history) throw new Error("Plant health history was not found");
    expect(within(history).getByText("White coating on the lower leaves.")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/workspaces\/server-workspace$/),
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("answers a Plant Knowledge question with visible source citations", async () => {
    const user = userEvent.setup();
    const workspace = createDemoGardenWorkspace();
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/plant-knowledge/answer")) {
        return {
          ok: true,
          json: async () => ({
            answer: "Observe the coating and improve airflow while you gather more detail.",
            confidence: "low",
            followUpQuestions: ["Does the coating wipe away?"],
            citations: [{
              sourceKey: "umn-preventing-plant-diseases",
              title: "Preventing plant diseases in the garden",
              publisher: "University of Minnesota Extension",
              sourceUrl: "https://extension.umn.edu/example",
              reviewedOn: "2026-09-01",
              excerpt: "Garden disease prevention includes sanitation and airflow.",
            }],
          }),
        };
      }
      return {
        ok: true,
        json: async () => init?.method ? JSON.parse(String(init.body)) : { workspaceId: "server-workspace", ...workspace },
      };
    });
    vi.stubGlobal("fetch", fetch);
    window.localStorage.setItem(SERVER_WORKSPACE_STORAGE_KEY, "server-workspace");

    render(<GardenWorkspace />);
    await user.click(await screen.findByRole("link", { name: "Plant Guide" }));
    await user.type(screen.getByLabelText("Question"), "My tomato has a white coating.");
    await user.click(screen.getByRole("button", { name: "Ask Plant Guide" }));

    expect(await screen.findByRole("heading", { name: "Answer" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Preventing plant diseases in the garden" })).toHaveAttribute("href", "https://extension.umn.edu/example");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/plant-knowledge\/answer$/),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("separates all-garden care from care for one named location", async () => {
    const user = userEvent.setup();
    await loadDemo(user);

    await user.click(screen.getByRole("link", { name: "Care" }));
    const allGardensCard = screen.getByRole("heading", { name: "All gardens", level: 3 }).closest("article");
    const demoGardenCard = screen.getByRole("heading", { name: "Demo Garden", level: 3 }).closest("article");
    if (!allGardensCard || !demoGardenCard) throw new Error("Care cards were not found");

    await user.click(within(allGardensCard).getByRole("link", { name: "Open care" }));
    expect(screen.getByRole("heading", { name: "All gardens", level: 3 })).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "History" }));
    await user.click(screen.getByRole("button", { name: "Add care event" }));
    expect(screen.getByLabelText("Target")).toHaveValue("all-gardens");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("link", { name: "Back to gardens" }));

    await user.click(screen.getByRole("link", { name: "Care" }));
    const refreshedDemoGardenCard = screen.getByRole("heading", { name: "Demo Garden", level: 3 }).closest("article");
    if (!refreshedDemoGardenCard) throw new Error("Demo Garden care card was not found");
    await user.click(within(refreshedDemoGardenCard).getByRole("link", { name: "Open care" }));
    await user.click(screen.getByRole("link", { name: "History" }));
    await user.click(screen.getByRole("button", { name: "Add care event" }));
    expect(screen.getByLabelText("Target")).toHaveValue("garden");
    expect(within(screen.getByLabelText("Target")).getByRole("option", { name: "Demo Garden" })).toBeInTheDocument();
  });

  it("opens editing directly from a garden thumbnail", async () => {
    const user = userEvent.setup();
    await loadDemo(user);

    expect(screen.queryByRole("button", { name: "Edit garden" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Open Demo Garden" }));
    expect(screen.getByRole("heading", { name: "Demo Garden", level: 1 })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Delete garden" })).toBeInTheDocument();
    openGardenDetails();
    expect(screen.getByLabelText("Garden width (m)")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Garden properties" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Planting areas" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Planting records" })).not.toBeInTheDocument();
  });

  it("opens the garden that was clicked when several gardens exist", async () => {
    const user = userEvent.setup();
    const workspace = createDemoGardenWorkspace();
    window.localStorage.setItem(
      GARDEN_WORKSPACE_STORAGE_KEY,
      JSON.stringify({
        ...workspace,
        gardens: [
          workspace.gardens[0],
          { ...workspace.gardens[0], id: "community-garden", name: "Community plot" },
        ],
      }),
    );
    render(<GardenWorkspace />);

    await user.click(await screen.findByRole("link", { name: "Open Community plot" }));
    expect(screen.getByRole("button", { name: "Delete garden" })).toBeInTheDocument();
    openGardenDetails();
    expect(screen.getByLabelText("Garden name")).toHaveValue("Community plot");
    expect(screen.getByRole("link", { name: "Back to gardens" })).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Back to gardens" }));
    expect(screen.getByRole("link", { name: "Open Community plot" })).toBeInTheDocument();
  });

  it("adds a standard planting area beside Garden Plan in one click, then restores it", async () => {
    const user = userEvent.setup();
    const firstRender = render(<GardenWorkspace />);
    await user.click(await screen.findByRole("button", { name: "Load demo garden" }));
    await user.click(screen.getByRole("link", { name: "Add garden" }));
    expect(screen.getByRole("heading", { name: "Add garden", level: 1 })).toBeInTheDocument();
    openGardenDetails();
    await user.type(screen.getByLabelText("Garden name"), "Community plot");
    await user.click(screen.getByRole("button", { name: "Continue setup" }));
    expect(screen.getByRole("heading", { name: "Garden setup" })).toBeInTheDocument();

    openGardenDetails();
    fireEvent.change(screen.getByLabelText("Garden width (m)"), { target: { value: "4" } });
    openGardenDetails();
    fireEvent.change(screen.getByLabelText("Garden length (m)"), { target: { value: "2" } });
    await user.click(screen.getByRole("button", { name: "Save" }));
    // One click drops a standard raised bed; this 2 m long garden shrinks it to fit (ADR-0072, G4).
    expect(screen.queryByRole("button", { name: "Add planting area" })).not.toBeInTheDocument();
    await user.click(within(screen.getByRole("group", { name: "Add a planting area" })).getByRole("button", { name: "Add Raised bed, 1.2 × 2.4 m" }));
    expect(screen.getByText("Raised bed 1 added at 0.5, 0.0 m (shrunk to 1.2 × 2 m to fit the garden). Drag it to move it, or drag its corner to resize it.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Whole garden" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Edit planting area" })).toBeInTheDocument();
    const name = screen.getByLabelText("Planting-area name");
    await user.clear(name);
    await user.type(name, "North bed");
    await user.clear(screen.getByLabelText("Rotation (degrees)"));
    await user.type(screen.getByLabelText("Rotation (degrees)"), "90");
    await user.click(areaInspectorForm().getByRole("button", { name: "Save" }));
    await user.click(screen.getByRole("button", { name: "Add plant" }));
    const plantForm = screen.getByRole("heading", { name: "Add plant" }).closest("form")!;
    await user.type(within(plantForm).getByLabelText("Plant type"), "Kale");
    await user.click(within(plantForm).getByRole("button", { name: "Add" }));
    expect(screen.getAllByText("Kale").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Finish setup" }));
    expect(screen.getByRole("link", { name: "Open Community plot" })).toBeInTheDocument();
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY) ?? "{}"))
      .toMatchObject({ gardens: expect.arrayContaining([expect.objectContaining({ name: "Community plot", plan: { widthMeters: 4, depthMeters: 2 }, growingAreas: expect.arrayContaining([expect.objectContaining({ name: "North bed", kind: "raised-bed", layout: expect.objectContaining({ widthMeters: 1.2, depthMeters: 2 }), planPlacement: { x: 0.5, y: 0, rotationDegrees: 90 } })]), plantings: expect.arrayContaining([expect.objectContaining({ commonName: "Kale" })]) })]) }));

    firstRender.unmount();
    resetTestRouter();
    render(<GardenWorkspace />);
    await screen.findByRole("link", { name: "Open Community plot" });
    await user.click(screen.getByRole("link", { name: "Open Community plot" }));
    await user.click(screen.getByLabelText("Open North bed on Garden Plan"));
    expect(screen.getAllByText("Kale").length).toBeGreaterThan(0);
  });

  it("adds numbered areas in the next free spots, and the type buttons replace the add form", async () => {
    const user = userEvent.setup();
    await loadDemo(user);
    await openSelectedGarden();
    const add = within(screen.getByRole("group", { name: "Add a planting area" }));
    expect(add.getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([
      "Add Raised bed, 1.2 × 2.4 m", "Add In-ground bed, 2 × 3 m", "Add Container, 0.6 × 0.6 m", "Add Greenhouse, 2.5 × 3 m",
    ]);
    await user.click(add.getByRole("button", { name: "Add Container, 0.6 × 0.6 m" }));
    expect(screen.getByText("Container 1 added at 7.0, 0.5 m. Drag it to move it, or drag its corner to resize it.")).toBeInTheDocument();
    await user.click(within(screen.getByRole("group", { name: "Add a planting area" })).getByRole("button", { name: "Add Container, 0.6 × 0.6 m" }));
    const stored = () => JSON.parse(window.localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY) ?? "{}").gardens?.[0]?.growingAreas ?? [];
    await waitFor(() => expect(stored().filter((area: { kind: string }) => area.kind === "container").slice(1)).toEqual([
      expect.objectContaining({ name: "Container 1", layout: expect.objectContaining({ widthMeters: 0.6, depthMeters: 0.6 }), planPlacement: { x: 7, y: 0.5, rotationDegrees: 0 } }),
      expect.objectContaining({ name: "Container 2", planPlacement: { x: 8, y: 0.5, rotationDegrees: 0 } }),
    ]));
    // The newest area is zoomed: the URL names it and the side panel edits it.
    const newest = stored().at(-1);
    expect(location.search).toBe(`?area=${newest.id}`);
    expect(screen.getByLabelText("Planting-area name")).toHaveValue("Container 2");
  });

  it("puts an old area without a size on the plan only when the user asks", async () => {
    const workspace = createDemoGardenWorkspace();
    workspace.gardens[0].growingAreas.push({ id: "old-greenhouse", name: "Old greenhouse", kind: "greenhouse", planPlacement: { x: 0, y: 0, rotationDegrees: 0 } });
    window.localStorage.setItem(GARDEN_WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));
    resetTestRouter("/gardens/demo-garden/plan");
    const user = userEvent.setup();
    render(<GardenWorkspace />);
    const needsSize = await screen.findByRole("region", { name: "Needs a size" });
    expect(screen.queryByLabelText("Open Old greenhouse on Garden Plan")).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY)!).gardens[0].growingAreas.at(-1).layout).toBeUndefined();
    await user.click(within(needsSize).getByRole("button", { name: "Place Old greenhouse on plan" }));
    expect(screen.getByText(/^Old greenhouse placed at \d+\.\d, \d+\.\d m as 2\.5 × 3 m/)).toBeInTheDocument();
    expect(screen.getByLabelText("Open Old greenhouse on Garden Plan")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Needs a size" })).not.toBeInTheDocument();
    expect(location.search).toBe("?area=old-greenhouse");
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY)!).gardens[0].growingAreas.at(-1).layout)
      .toMatchObject({ widthMeters: 2.5, depthMeters: 3 }));
  });

  it("keeps one side panel for area details and current layout plants", async () => {
    const user = userEvent.setup();
    await loadDemo(user);
    await openPlantingArea(user, "Sample raised bed");
    const inspector = screen.getByRole("region", { name: "Edit planting area" });
    expect(within(inspector).getByRole("region", { name: "Plant layout" })).toBeInTheDocument();
    expect(within(inspector).getByRole("button", { name: "Add plant" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Planting records/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit planting" })).not.toBeInTheDocument();

    const name = screen.getByLabelText("Planting-area name");
    await user.clear(name);
    await user.type(name, "Kitchen bed");
    await user.clear(screen.getByLabelText("Width (m)"));
    await user.type(screen.getByLabelText("Width (m)"), "2.5");
    await user.clear(screen.getByLabelText("Rotation (degrees)"));
    await user.type(screen.getByLabelText("Rotation (degrees)"), "45");
    await user.click(areaInspectorForm().getByRole("button", { name: "Save" }));
    expect(screen.getByRole("heading", { name: "Edit planting area" })).toBeInTheDocument();
    expect(screen.getByLabelText("Width (m)")).toHaveValue(2.5);
    expect(screen.getByLabelText("Rotation (degrees)")).toHaveValue(45);

    await user.click(screen.getByRole("button", { name: "Add plant" }));
    const plantForm = screen.getByRole("heading", { name: "Add plant" }).closest("form")!;
    await user.type(within(plantForm).getByLabelText("Plant type"), "Basil");
    await user.click(within(plantForm).getByRole("button", { name: "Add" }));
    expect(screen.getByLabelText("Basil plant on Garden Plan")).toBeInTheDocument();
  });

  it("saves all planting-area properties through one action", async () => {
    const user = userEvent.setup();
    const onSaveArea = vi.fn();
    render(<GrowingAreaLayoutEditor area={{ id: "area-1", name: "North bed", kind: "raised-bed", planPlacement: { x: 0.5, y: 0.5, rotationDegrees: 0 }, layout: { widthMeters: 2, depthMeters: 1, boundary: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 0, y: 1 }], allocations: [] } }} onArchivePlantingRecord={vi.fn()} onChange={vi.fn()} onSaveArea={onSaveArea} />);

    await user.clear(screen.getByLabelText("Planting-area name"));
    await user.type(screen.getByLabelText("Planting-area name"), "Kitchen bed");
    await user.selectOptions(screen.getByLabelText("Planting-area type"), "container");
    await user.clear(screen.getByLabelText("Width (m)"));
    await user.type(screen.getByLabelText("Width (m)"), "1.5");
    await user.clear(screen.getByLabelText("Length (m)"));
    await user.type(screen.getByLabelText("Length (m)"), "0.8");
    await user.clear(screen.getByLabelText("Rotation (degrees)"));
    await user.type(screen.getByLabelText("Rotation (degrees)"), "45");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSaveArea).toHaveBeenCalledWith(
      "Kitchen bed",
      "container",
      45,
      expect.objectContaining({ widthMeters: 1.5, depthMeters: 0.8 }),
    );
  });

  it("keeps a removed layout plant available to Care History", async () => {
    const user = userEvent.setup();
    await loadDemo(user);
    await openCare(user);
    await user.click(screen.getByRole("link", { name: "History" }));
    await user.click(screen.getByRole("button", { name: "Add care event" }));
    const form = screen.getByRole("heading", { name: "Add care event" }).closest("form")!;
    fireEvent.change(within(form).getByLabelText("Date"), { target: { value: "2026-06-05" } });
    await user.selectOptions(within(form).getByLabelText("Target"), "plant-group:demo-planting-tomatoes");
    await user.click(within(form).getByRole("button", { name: "Add care event" }));
    await user.click(screen.getByRole("link", { name: "Back to gardens" }));
    await openPlantingArea(user, "Sample raised bed");
    await user.click(screen.getByLabelText("Tomato plant on Garden Plan"));
    await user.click(screen.getByRole("button", { name: "Remove plant" }));
    await confirmDialog(user);
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("link", { name: "Back to gardens" }));
    await openCare(user);
    await user.click(screen.getByRole("link", { name: "History" }));
    expect(screen.getByText("Demo Garden / Sample raised bed / Tomato · Sun Gold")).toBeInTheDocument();
  });

  it("keeps gardens and planting areas when deletion is cancelled", async () => {
    const user = userEvent.setup();
    await loadDemo(user);
    await openPlantingArea(user, "Sample raised bed");
    await user.click(screen.getByRole("button", { name: "Delete area" }));
    await cancelDialog(user, "Delete “Sample raised bed”? This removes 1 layout plant, 1 planting record, and 0 future plan items.");
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByLabelText("Open Sample raised bed on Garden Plan")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete garden" }));
    await cancelDialog(user, "Delete “Demo Garden”? This removes 3 planting areas, 2 planting records");
    expect(screen.getByRole("button", { name: "Delete garden" })).toBeInTheDocument();
  });

  it("deletes a planting area together with its next-season plan entries, then restores cleanly", async () => {
    const user = userEvent.setup();
    const workspace = createDemoGardenWorkspace();
    const [garden] = workspace.gardens;
    window.localStorage.setItem(
      GARDEN_WORKSPACE_STORAGE_KEY,
      JSON.stringify({
        ...workspace,
        gardens: [{
          ...garden,
          seasonPlans: [{
            id: "plan-next",
            seasonYear: new Date().getFullYear() + 1,
            plantings: [
              { id: "planned-kale", commonName: "Kale", cropFamily: "brassica", growingAreaId: "demo-raised-bed" },
              { id: "planned-bean", commonName: "Bean", cropFamily: "legume", growingAreaId: garden.growingAreas[1].id },
            ],
          }],
        }],
      }),
    );

    const firstRender = render(<GardenWorkspace />);
    await openPlantingArea(user, "Sample raised bed");
    await user.click(screen.getByRole("button", { name: "Delete area" }));
    await confirmDialog(user, "1 future plan item");

    const saved = window.localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY);
    const restored = readGardenWorkspace(saved);
    expect(restored).not.toBeUndefined();
    expect(restored?.gardens[0].seasonPlans?.[0].plantings.map((planting) => planting.id)).toEqual(["planned-bean"]);

    firstRender.unmount();
    resetTestRouter();
    render(<GardenWorkspace />);
    expect(await screen.findByText("Saved on this device")).toBeInTheDocument();
  });

  it("removes Demo Garden from a multi-garden browser workspace", async () => {
    const user = userEvent.setup();
    const workspace = createDemoGardenWorkspace();
    const personalGarden = createGarden("Back garden");
    window.localStorage.setItem(
      GARDEN_WORKSPACE_STORAGE_KEY,
      JSON.stringify({ ...workspace, gardens: [...workspace.gardens, personalGarden] }),
    );

    render(<GardenWorkspace />);
    await user.click(await screen.findByRole("button", { name: "Demo garden" }));
    await user.click(screen.getByRole("button", { name: "Delete garden" }));
    await confirmDialog(user);

    await user.click(screen.getByRole("link", { name: "Open Back garden" }));
    openGardenDetails();
    expect(screen.getByLabelText("Garden name")).toHaveValue("Back garden");
    expect(JSON.parse(window.localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY) ?? "{}")).toMatchObject({
      selectedGardenId: personalGarden.id,
      gardens: [expect.objectContaining({ id: personalGarden.id, name: "Back garden" })],
    });
    await user.click(screen.getByRole("link", { name: "Back to gardens" }));
    expect(screen.getByRole("link", { name: "Open Back garden" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Demo garden" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open Demo Garden" })).not.toBeInTheDocument();
  });

  it("opens Demo Garden from a compact reference action when a personal garden exists", async () => {
    const user = userEvent.setup();
    const workspace = createGardenWorkspace("Back garden");
    window.localStorage.setItem(GARDEN_WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));

    render(<GardenWorkspace />);
    expect(screen.queryByRole("link", { name: "Open Demo Garden" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Demo garden" }));

    expect(screen.getByRole("heading", { name: "Garden Plan" })).toBeInTheDocument();
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY) ?? "{}")).toMatchObject({
      selectedGardenId: "demo-garden",
      gardens: expect.arrayContaining([
        expect.objectContaining({ id: workspace.gardens[0].id, name: "Back garden" }),
        expect.objectContaining({ id: "demo-garden", name: "Demo Garden" }),
      ]),
    }));
    await user.click(screen.getByRole("link", { name: "Back to gardens" }));
    expect(screen.getByRole("link", { name: "Open Back garden" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open Demo Garden" })).not.toBeInTheDocument();
  });

  it("saves Demo Garden removal from a multi-garden PostgreSQL workspace", async () => {
    const user = userEvent.setup();
    const workspace = createDemoGardenWorkspace();
    const personalGarden = createGarden("Back garden");
    const serverWorkspace = { ...workspace, gardens: [...workspace.gardens, personalGarden] };
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => ({
      ok: true,
      json: async () => JSON.parse(String(init?.body ?? JSON.stringify({ workspaceId: "server-workspace", ...serverWorkspace }))),
    }));
    vi.stubGlobal("fetch", fetch);
    window.localStorage.setItem(SERVER_WORKSPACE_STORAGE_KEY, "server-workspace");

    render(<GardenWorkspace />);
    await user.click(await screen.findByRole("button", { name: "Demo garden" }));
    await user.click(screen.getByRole("button", { name: "Delete garden" }));
    await confirmDialog(user);

    await waitFor(() => expect(fetch.mock.calls).toContainEqual([
      expect.stringMatching(/\/workspaces\/server-workspace$/),
      expect.objectContaining({ method: "PUT" }),
    ]));
    const savedPayload = JSON.parse(String(fetch.mock.calls.at(-1)?.[1]?.body));
    expect(savedPayload.gardens).toEqual([expect.objectContaining({ id: personalGarden.id })]);
  });

  it("keeps Tasks open-only and advances repeating care after completion", async () => {
    const user = userEvent.setup();
    const firstRender = render(<GardenWorkspace />);
    await user.click(await screen.findByRole("button", { name: "Load demo garden" }));
    await openCare(user);
    expect(screen.getByRole("heading", { name: "Tasks" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add task" }));
    const form = screen.getByRole("heading", { name: "Add care task" }).closest("form")!;
    await user.selectOptions(within(form).getByLabelText("Care type"), "fertilizing");
    fireEvent.change(within(form).getByLabelText("Due date"), { target: { value: "2026-09-02" } });
    await user.selectOptions(within(form).getByLabelText("Target"), "planting-area:demo-raised-bed");
    await user.type(within(form).getByLabelText("Repeat every whole days (optional)"), "3");
    await user.type(within(form).getByLabelText("Note (optional)"), "Feed tomatoes");
    await user.click(within(form).getByRole("button", { name: "Add care task" }));
    const taskItem = screen.getByText("Fertilizing").closest("li")!;
    expect(within(taskItem).getByText("Demo Garden / Sample raised bed")).toBeInTheDocument();
    expect(within(taskItem).getByText("Due 2026-09-02 · Repeats every 3 days")).toBeInTheDocument();
    expect(within(taskItem).getByText("Feed tomatoes")).toBeInTheDocument();
    await user.click(within(taskItem).getByRole("button", { name: "Edit" }));
    const editForm = screen.getByRole("heading", { name: "Edit care task" }).closest("form")!;
    await user.clear(within(editForm).getByLabelText("Note (optional)"));
    await user.type(within(editForm).getByLabelText("Note (optional)"), "Feed the bed");
    await user.click(within(editForm).getByRole("button", { name: "Save care task" }));
    await user.click(within(screen.getByText("Fertilizing").closest("li")!).getByRole("button", { name: "Complete" }));
    const completionForm = screen.getByRole("heading", { name: "Complete fertilizing task" }).closest("form")!;
    fireEvent.change(within(completionForm).getByLabelText("Completion date"), { target: { value: "2026-09-04" } });
    await user.click(within(completionForm).getByRole("button", { name: "Complete task" }));
    expect(screen.queryByRole("heading", { name: "Completed" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Completed 2026-09-04 · Sample raised bed/)).not.toBeInTheDocument();
    expect(screen.getByText(/Due 2026-09-07/)).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "History" }));
    expect(screen.getByText("2026-09-04").closest("li")).toHaveTextContent("Demo Garden / Sample raised bed");
    expect(screen.getByText("2026-09-04").closest("li")).toHaveTextContent("Feed the bed");
    firstRender.unmount();
    resetTestRouter();
    render(<GardenWorkspace />);
    await openCare(user);
    expect(screen.getByText(/Due 2026-09-07/)).toBeInTheDocument();
  });

  it("marks deleted task targets as former and lets gardeners remove them", async () => {
    const user = userEvent.setup();
    await loadDemo(user);
    await openCare(user);
    await user.click(screen.getByRole("button", { name: "Add task" }));
    const form = screen.getByRole("heading", { name: "Add care task" }).closest("form")!;
    fireEvent.change(within(form).getByLabelText("Due date"), { target: { value: "2026-09-02" } });
    await user.selectOptions(within(form).getByLabelText("Target"), "planting-area:demo-raised-bed");
    await user.click(within(form).getByRole("button", { name: "Add care task" }));
    await user.click(screen.getByRole("link", { name: "Back to gardens" }));
    await openPlantingArea(user, "Sample raised bed");
    await user.click(screen.getByRole("button", { name: "Delete area" }));
    await confirmDialog(user);
    await user.click(screen.getByRole("link", { name: "Back to gardens" }));
    await openCare(user);
    const taskItem = screen.getByText(/Former planting area: Sample raised bed/).closest("li")!;
    await user.click(within(taskItem).getByRole("button", { name: "Delete" }));
    await confirmDialog(user);
    expect(screen.queryByText(/Former planting area: Sample raised bed/)).not.toBeInTheDocument();
  });

  it("moves a one-time completed task into History", async () => {
    const user = userEvent.setup();
    await loadDemo(user);
    await openCare(user);
    await user.click(screen.getByRole("button", { name: "Add task" }));
    const form = screen.getByRole("heading", { name: "Add care task" }).closest("form")!;
    fireEvent.change(within(form).getByLabelText("Due date"), { target: { value: "2026-09-02" } });
    await user.type(within(form).getByLabelText("Note (optional)"), "Water containers");
    await user.click(within(form).getByRole("button", { name: "Add care task" }));
    const taskItem = screen.getByText("Watering").closest("li")!;
    await user.click(within(taskItem).getByRole("button", { name: "Complete" }));
    await user.click(screen.getByRole("button", { name: "Complete task" }));

    expect(screen.queryByText("Water containers")).not.toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "History" }));
    expect(screen.getByText(/Water containers/)).toBeInTheDocument();
  });

  it("records, edits, deletes, and persists Care Log events", async () => {
    const user = userEvent.setup();
    const firstRender = render(<GardenWorkspace />);
    await user.click(await screen.findByRole("button", { name: "Load demo garden" }));
    await openCare(user);
    await user.click(screen.getByRole("link", { name: "History" }));
    await user.click(screen.getByRole("button", { name: "Add care event" }));
    const wateringForm = screen.getByRole("heading", { name: "Add care event" }).closest("form")!;
    fireEvent.change(within(wateringForm).getByLabelText("Date"), { target: { value: "2026-06-01" } });
    await user.click(within(wateringForm).getByRole("button", { name: "Add care event" }));
    await user.click(screen.getByRole("button", { name: "Add care event" }));
    const fertilizerForm = screen.getByRole("heading", { name: "Add care event" }).closest("form")!;
    await user.selectOptions(within(fertilizerForm).getByLabelText("Care type"), "fertilizing");
    fireEvent.change(within(fertilizerForm).getByLabelText("Date"), { target: { value: "2026-06-02" } });
    await user.selectOptions(within(fertilizerForm).getByLabelText("Target"), "planting-area:demo-raised-bed");
    await user.click(within(fertilizerForm).getByRole("button", { name: "Add care event" }));
    const fertilizerItem = screen.getByText("Fertilizing").closest("li")!;
    await user.click(within(fertilizerItem).getByRole("button", { name: "Correct record" }));
    const editForm = screen.getByRole("heading", { name: "Edit care event" }).closest("form")!;
    await user.type(within(editForm).getByLabelText("Fertilizer product (optional)"), "Kelp meal");
    await user.click(within(editForm).getByRole("button", { name: "Save care event" }));
    await user.click(screen.getByRole("link", { name: "Back to gardens" }));
    await openCare(user);
    await user.click(screen.getByRole("link", { name: "History" }));
    expect(screen.getByRole("list")).toHaveTextContent("Sample raised bed");
    firstRender.unmount();
    resetTestRouter();
    render(<GardenWorkspace />);
    await openCare(user);
    await user.click(screen.getByRole("link", { name: "History" }));
    expect(screen.getByText(/Kelp meal/)).toBeInTheDocument();
    await user.click(within(screen.getByText("Fertilizing").closest("li")!).getByRole("button", { name: "Delete record" }));
    await confirmDialog(user);
    expect(screen.queryByText(/Kelp meal/)).not.toBeInTheDocument();
  });

  it("keeps targeted care history with its former planting-area name", async () => {
    const user = userEvent.setup();
    await loadDemo(user);
    await openCare(user);
    await user.click(screen.getByRole("link", { name: "History" }));
    await user.click(screen.getByRole("button", { name: "Add care event" }));
    const form = screen.getByRole("heading", { name: "Add care event" }).closest("form")!;
    fireEvent.change(within(form).getByLabelText("Date"), { target: { value: "2026-06-04" } });
    await user.selectOptions(within(form).getByLabelText("Target"), "planting-area:demo-raised-bed");
    await user.click(within(form).getByRole("button", { name: "Add care event" }));
    await user.click(screen.getByRole("link", { name: "Back to gardens" }));
    await openPlantingArea(user, "Sample raised bed");
    await user.click(screen.getByRole("button", { name: "Delete area" }));
    await confirmDialog(user);
    await user.click(screen.getByRole("link", { name: "Back to gardens" }));
    await openCare(user);
    await user.click(screen.getByRole("link", { name: "History" }));
    expect(screen.getByText("2026-06-04").closest("li")).toHaveTextContent("Former planting area: Sample raised bed");
    expect(JSON.parse(window.localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY) ?? "{}").gardens[0].careEvents[0]).toMatchObject({ growingAreaName: "Sample raised bed", targetAreaDeleted: true });
  });

  it("keeps the dashboard compact and opens a planting area from Garden Plan", async () => {
    const user = userEvent.setup();
    await loadDemo(user);
    expect(screen.getByRole("link", { name: "Add garden" })).toBeInTheDocument();
    await openSelectedGarden();
    expect(screen.queryByText("Garden properties")).not.toBeInTheDocument();
    expect(screen.getByText("Planting areas")).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Edit Sample raised bed" }));
    expect(screen.getByRole("heading", { name: "Edit planting area" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByLabelText("Open Sample raised bed on Garden Plan"));
    expect(screen.getByRole("heading", { name: "Edit planting area" })).toBeInTheDocument();
  });

  it("saves the garden name with its Garden Plan properties", async () => {
    const user = userEvent.setup();
    await loadDemo(user);
    await openSelectedGarden();

    openGardenDetails();
    fireEvent.change(screen.getByLabelText("Garden name"), { target: { value: "Kitchen garden" } });
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY) ?? "{}").gardens[0].name).toBe("Kitchen garden"));
  });

  it("shows save actions only after an existing garden or planting area changes", async () => {
    const user = userEvent.setup();
    await loadDemo(user);
    await openSelectedGarden();

    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    openGardenDetails();
    await user.clear(screen.getByLabelText("Garden name"));
    openGardenDetails();
    await user.type(screen.getByLabelText("Garden name"), "Kitchen garden");
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();

    await user.click(screen.getByLabelText("Open Sample raised bed on Garden Plan"));
    expect(areaInspectorForm().queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText("Rotation (degrees)"));
    await user.type(screen.getByLabelText("Rotation (degrees)"), "45");
    expect(areaInspectorForm().getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("zooms Garden Plan into an opened area, persists a selected plant color, and returns to the whole garden", async () => {
    const user = userEvent.setup();
    await loadDemo(user);
    await openSelectedGarden();
    expect(screen.queryByRole("button", { name: "Whole garden" })).not.toBeInTheDocument();
    expect(screen.getByText("Tomato")).toBeInTheDocument();
    const areaLabel = screen.getByTestId("area-label-demo-raised-bed");
    expect(areaLabel).toHaveAttribute("align", "center");
    expect(Number(areaLabel.getAttribute("y"))).toBeGreaterThan(0);
    await user.click(screen.getByLabelText("Open Sample raised bed on Garden Plan"));
    expect(window.location.search).toBe("?area=demo-raised-bed");
    expect(screen.getByRole("button", { name: "Whole garden" })).toBeInTheDocument();
    expect(screen.getByLabelText("Open Sample raised bed on Garden Plan")).toHaveAttribute("opacity", "1");
    expect(screen.getByLabelText("Open Sample in-ground area on Garden Plan")).toHaveAttribute("opacity", "0.35");
    expect(screen.queryByTestId("area-label-demo-in-ground-area")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Tomato plant on Garden Plan"));
    fireEvent.change(screen.getByLabelText("Plant color"), { target: { value: "#1f77b4" } });
    await user.click(screen.getByRole("button", { name: "Save plant" }));
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY) ?? "{}").gardens[0].growingAreas[0].layout.allocations[0].color).toBe("#1f77b4"));
    await user.click(screen.getByRole("button", { name: "Whole garden" }));
    expect(window.location.search).toBe("");
    expect(screen.queryByRole("button", { name: "Whole garden" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Open Sample in-ground area on Garden Plan")).toHaveAttribute("opacity", "1");
    await waitFor(() => expect(document.activeElement).toHaveAttribute("id", "area-link-demo-raised-bed"));
  });

  it("asks before Whole garden discards unsaved planting-area edits", async () => {
    const user = userEvent.setup();
    await loadDemo(user);
    await openPlantingArea(user, "Sample raised bed");
    await user.clear(screen.getByLabelText("Rotation (degrees)"));
    await user.type(screen.getByLabelText("Rotation (degrees)"), "45");
    await user.click(screen.getByRole("button", { name: "Whole garden" }));
    expect(await screen.findByText("Your changes have not been submitted. Discard them or keep editing.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(window.location.search).toBe("?area=demo-raised-bed");
    expect(screen.getByLabelText("Rotation (degrees)")).toHaveValue(45);
    await user.click(screen.getByRole("button", { name: "Whole garden" }));
    await user.click(await screen.findByRole("button", { name: "Discard changes" }));
    expect(window.location.search).toBe("");
    await user.click(screen.getByLabelText("Open Sample raised bed on Garden Plan"));
    expect(screen.getByLabelText("Rotation (degrees)")).toHaveValue(0);
  });

  it("places plants on the main canvas, moves one, and stops placing on Escape", async () => {
    // Reduced motion puts the zoomed frame in place at once, so pointer maths use the final frame.
    vi.stubGlobal("matchMedia", (media: string) => ({ media, matches: media.includes("reduced-motion"), addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const user = userEvent.setup();
    await loadDemo(user);
    await openPlantingArea(user, "Sample raised bed");
    const area = createDemoGardenWorkspace().gardens[0].growingAreas[0];
    const transform = fitCanvas(areaFocusViewport(area)!, 1280, 640)!;
    const pixel = (x: number, y: number) => metresToCanvas(areaLocalToPlan(area, { x, y }), transform);
    const stored = () => JSON.parse(window.localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY) ?? "{}").gardens[0].growingAreas[0].layout.allocations;
    await user.click(screen.getByRole("button", { name: "Add plant" }));
    await user.type(screen.getByLabelText("Plant type"), "Pepper");
    expect(screen.getByLabelText("Plant spacing (m)")).toHaveValue(0.5);
    const layer = screen.getByLabelText("Place Pepper on Sample raised bed");
    for (const [x, y] of [[2.02, 0.4], [2.61, 0.83]]) {
      Object.assign(layer, { getStage: () => ({ getPointerPosition: () => pixel(x, y) }) });
      fireEvent.click(layer);
    }
    await waitFor(() => expect(stored().filter((plant: { plantType?: string }) => plant.plantType === "Pepper").map(({ x, y }: { x: number; y: number }) => [x, y])).toEqual([[2, 0.4], [2.6, 0.8]]));
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByLabelText("Place Pepper on Sample raised bed")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Plant type")).not.toBeInTheDocument();
    expect(window.location.search).toBe("?area=demo-raised-bed");
    const tomato = screen.getByLabelText("Tomato plant on Garden Plan");
    fireEvent.dragStart(tomato);
    Object.assign(tomato, { x: () => 1.24 * transform.scale, y: () => 0.62 * transform.scale });
    fireEvent.pointerUp(tomato);
    await waitFor(() => expect(stored().find((plant: { id: string }) => plant.id === "demo-tomato")).toMatchObject({ x: 1.2, y: 0.6 }));
    expect(screen.getByRole("region", { name: "Plant groups" })).toHaveTextContent("Pepper × 2");
  });

  it("saves planting-area rotation with its other properties", async () => {
    const user = userEvent.setup();
    await loadDemo(user);
    await openPlantingArea(user, "Sample raised bed");
    const rotation = screen.getByLabelText("Rotation (degrees)");
    await user.clear(rotation);
    await user.type(rotation, "450");
    await user.click(areaInspectorForm().getByRole("button", { name: "Save" }));
    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY) ?? "{}").gardens[0].growingAreas[0].planPlacement.rotationDegrees).toBe(90));
  });

  it("saves next-season choices separately from current plant records and shows pairing notes", async () => {
    const user = userEvent.setup();
    const workspace = createDemoGardenWorkspace();
    workspace.gardens[0].plantings[0].plantingDate = "2024-05-18";
    window.localStorage.setItem(SERVER_WORKSPACE_STORAGE_KEY, "server-workspace");
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("rotation-guidance")) {
        const request = JSON.parse(String(init?.body));
        const selectedNightshade = request.cropFamily === "nightshade";
        return {
          ok: true,
          json: async () => ({
            growingAreaId: request.growingAreaId,
            growingAreaKind: "raised-bed",
            season: 2026,
            history: [{ plantingId: "demo-planting-tomatoes", commonName: "Tomatoes", cropFamily: "nightshade", plantingDate: "2024-05-18", season: 2024 }],
            warning: selectedNightshade ? { cropFamily: "nightshade", plantings: [] } : null,
            automatedWarningSupported: true,
            hasAutomaticCompatibilityConclusion: selectedNightshade,
            rotationFriendlyCropFamilies: ["brassica", "cucurbit", "legume", "allium", "root", "leafy"],
          }),
        };
      }
      return { ok: true, json: async () => ({ workspaceId: "server-workspace", ...workspace }) };
    }));

    render(<GardenWorkspace />);
    await screen.findByRole("link", { name: "Next Season" });
    await user.click(screen.getByRole("link", { name: "Next Season" }));
    await screen.findByRole("heading", { name: /Next Season ·/ });
    await user.click(screen.getByText("Plan preview · Demo Garden", { selector: "summary" }));
    expect(screen.getByRole("button", { name: "Planting areas" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Full garden" }));
    expect(screen.getByRole("button", { name: "Full garden" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const raisedBed = screen.getByRole("heading", { name: "Sample raised bed" }).closest("article")!;
    expect(within(raisedBed).getByText("Last season")).toBeInTheDocument();
    await user.click(within(raisedBed).getByText("Rotation details", { selector: "summary" }));
    expect(within(raisedBed).getByText("Avoid if possible")).toBeInTheDocument();
    expect(within(raisedBed).getByText("Good rotation fit")).toBeInTheDocument();
    await user.click(within(raisedBed).getByRole("button", { name: "Choose a plant" }));
    await user.type(within(raisedBed).getByLabelText("Plant type"), "Tomato");
    expect(within(raisedBed).getByText(/Crop family:/)).toHaveTextContent("Nightshade");
    expect(within(raisedBed).getByText(/automatic/)).toBeInTheDocument();
    await user.click(within(raisedBed).getByRole("button", { name: `Add to ${new Date().getFullYear() + 1} plan` }));

    const updatedRaisedBed = screen.getByRole("heading", { name: "Sample raised bed" }).closest("article")!;
    expect(within(updatedRaisedBed).getByText(`${new Date().getFullYear() + 1} plan`)).toBeInTheDocument();
    expect(within(updatedRaisedBed).getByText("Tomato")).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: `${new Date().getFullYear() + 1} plan preview for Demo Garden`,
      }),
    ).toBeInTheDocument();
    const areaLabel = screen.getByTestId("season-area-label-demo-raised-bed");
    expect(Number(areaLabel.getAttribute("y"))).toBeLessThan(1);
    expect(screen.queryByRole("heading", { name: "Add plant" })).not.toBeInTheDocument();
    await user.click(within(updatedRaisedBed).getByRole("button", { name: "Add a plant" }));
    await user.type(within(updatedRaisedBed).getByLabelText("Plant type"), "Basil");
    await user.click(within(updatedRaisedBed).getByRole("button", { name: `Add to ${new Date().getFullYear() + 1} plan` }));

    const pairedRaisedBed = (await screen.findByRole("heading", { name: "Sample raised bed" })).closest("article")!;
    expect(within(pairedRaisedBed).getByText(/Tomato \+ basil/)).toBeInTheDocument();
  });

  it("uses current layout plants as last-season history without waiting for a server request", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      GARDEN_WORKSPACE_STORAGE_KEY,
      JSON.stringify(createDemoGardenWorkspace()),
    );

    render(<GardenWorkspace />);
    await user.click(await screen.findByRole("link", { name: "Next Season" }));

    const raisedBed = screen.getByRole("heading", { name: "Sample raised bed" }).closest("article")!;
    expect(within(raisedBed).getByText("Tomato · Sun Gold")).toBeInTheDocument();
    expect(within(raisedBed).getByText("Nightshade (tomato, pepper, eggplant)")).toBeInTheDocument();
  });

  it("collapses repeated historical aliases into clear last-season labels", async () => {
    const user = userEvent.setup();
    const workspace = createDemoGardenWorkspace();
    const garden = workspace.gardens[0];
    const tomato = garden.plantings[0];
    garden.plantings = [
      tomato,
      { ...tomato, id: "old-sungold", commonName: "sungold", plantType: "sungold", variety: undefined },
      { ...tomato, id: "old-sungold-tomato", commonName: "sungoldtomato", plantType: "sungoldtomato", variety: undefined },
      { ...tomato, id: "old-basil", commonName: "九层塔", plantType: "九层塔", variety: undefined, cropFamily: "other" },
    ];
    window.localStorage.setItem(GARDEN_WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));

    render(<GardenWorkspace />);
    await user.click(await screen.findByRole("link", { name: "Next Season" }));

    const raisedBed = screen.getByRole("heading", { name: "Sample raised bed" }).closest("article")!;
    expect(within(raisedBed).getByText("Tomato · Sun Gold · Basil")).toBeInTheDocument();
    expect(within(raisedBed).getByText(/sungoldtomato/i)).not.toBeVisible();
  });

  it("supports direct plant selection, editing, duplication, and confirmed panel removal", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<GrowingAreaLayoutEditor area={{ id: "area-1", name: "North bed", kind: "raised-bed", planPlacement: { x: 0.5, y: 0.5, rotationDegrees: 0 }, layout: { widthMeters: 2, depthMeters: 1, boundary: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 0, y: 1 }], allocations: [{ id: "plant-1", label: "Tomato", x: 1, y: 0.5, diameterMeters: 0.6 }] } }} onArchivePlantingRecord={vi.fn()} onChange={onChange} onSaveArea={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Edit Tomato" }));
    await user.click(screen.getByRole("button", { name: "Duplicate plant" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ allocations: expect.arrayContaining([expect.objectContaining({ id: "plant-1" }), expect.objectContaining({ label: "Tomato", x: 1.6, y: 0.5 })]) }));
    await user.click(screen.getByRole("button", { name: "Edit Tomato" }));
    await user.click(screen.getByRole("button", { name: "Remove plant" }));
    await confirmDialog(user);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ allocations: [] }));
  });

  it("adds a duplicate from the plant form for batch placement", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<GrowingAreaLayoutEditor area={{ id: "area-1", name: "North bed", kind: "raised-bed", planPlacement: { x: 0.5, y: 0.5, rotationDegrees: 0 }, layout: { widthMeters: 2, depthMeters: 1, boundary: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 0, y: 1 }], allocations: [] } }} onArchivePlantingRecord={vi.fn()} onChange={onChange} onSaveArea={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Add plant" }));
    const form = screen.getByRole("heading", { name: "Add plant" }).closest("form")!;
    await user.type(within(form).getByLabelText("Plant type"), "Basil");
    await user.click(within(form).getByRole("button", { name: "Add & duplicate" }));

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      allocations: [
        expect.objectContaining({ label: "Basil" }),
        expect.objectContaining({ label: "Basil" }),
      ],
    }));
  });
});
