import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { repositoryUrl } from "@/components/marketing/landingFeatures";
import { GardenWorkspace } from "@/test/WorkspaceHarness";
import { resetTestRouter } from "@/test/router";

/** Every app page ends with the compact footer (ADR-0083); the modules stay in the header only. */
describe("AppFooter", () => {
  it.each(["/gardens", "/care", "/notes"])("closes %s with the project links and the photo credit", async (path) => {
    resetTestRouter(path);
    render(<GardenWorkspace />);
    const footer = await screen.findByRole("contentinfo");
    const links = within(within(footer).getByRole("navigation", { name: "Project" }));
    expect(links.getByRole("link", { name: "GitHub" })).toHaveAttribute("href", repositoryUrl);
    expect(links.getByRole("link", { name: "Architecture" })).toHaveAttribute("href", `${repositoryUrl}#readme`);
    expect(links.getByRole("link", { name: "Decision records" })).toHaveAttribute("href", `${repositoryUrl}/tree/main/docs/decisions`);
    expect(footer).toHaveTextContent("Photos by Victoria Knyshova and Amel Uzunovic on Pexels");
    expect(within(footer).queryByRole("link", { name: "Care" })).not.toBeInTheDocument();
  });
});
