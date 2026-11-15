"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useWorkspace } from "./WorkspaceProvider";
import { SyncStatus } from "./SyncStatus";
import { gardenPath, routeFromPath, workspaceHomePath } from "@/lib/workspaceRoutes";
import { nextSeasonYear } from "@/lib/seasonAllocation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { GardenNoteDialog } from "@/components/notes/GardenNoteDialog";
import { OverviewGardenNote } from "./OverviewGardenNote";
import styles from "./AppShell.module.css";

const links = [[workspaceHomePath, "Overview"], ["/care", "Care"], ["/season", "Next Season"], ["/doctor", "Plant Doctor"], ["/guide", "Plant Guide"]];
const OverviewNoteEntryContext = createContext<ReactNode>(null);
type OpenGardenNote = (opener: HTMLButtonElement | null, options: { batchAvailable: boolean; gardenId?: string }) => void;
const OpenGardenNoteContext = createContext<OpenGardenNote | null>(null);

export function OverviewNoteEntry() {
  return useContext(OverviewNoteEntryContext);
}

/** Opens the Garden Note dialog, the same session as Overview's, from any page (the guided setup's Ready step). */
export function useOpenGardenNote() {
  return useContext(OpenGardenNoteContext);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const { workspace, isLoaded } = useWorkspace();
  const route = routeFromPath(pathname);
  const garden = workspace?.gardens.find((item) => item.id === route.gardenId);
  const [menuOpen, setMenuOpen] = useState(false);
  const [noteMode, setNoteMode] = useState<"batch" | "default" | null>(null);
  const [noteGardenId, setNoteGardenId] = useState<string>();
  const noteButton = useRef<HTMLButtonElement>(null);
  const noteOpener = useRef<HTMLButtonElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const navigation = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const title = {
    home: "Overview", new: "Add garden", plan: garden?.name ?? "Garden Plan", care: "Care",
    season: `Next Season · ${nextSeasonYear()}`, notes: "AI Garden Note", guide: "Plant Guide", doctor: "Plant Doctor",
  }[route.module];
  const description = route.module === "doctor" ? "Record what you observe and review an assessment before saving it to health history."
    : route.module === "guide" ? "Ask a gardening question and see the reviewed sources behind the answer." : undefined;
  useEffect(() => { if (isLoaded) heading.current?.focus(); }, [pathname, isLoaded]);
  useEffect(() => { if (menuOpen) navigation.current?.querySelector("a")?.focus(); }, [menuOpen]);
  // Moving to another page closes the dialog; the note session itself stays in the provider.
  const notePath = useRef(pathname);
  useEffect(() => { if (notePath.current !== pathname) { notePath.current = pathname; setNoteMode(null); } }, [pathname]);
  const closeMenu = () => { setMenuOpen(false); if (menuOpen) menuButton.current?.focus(); };
  const showNote = noteMode !== null;
  const openNote: OpenGardenNote = (opener, { batchAvailable, gardenId }) => {
    noteOpener.current = opener;
    setMenuOpen(false);
    setNoteGardenId(gardenId);
    setNoteMode(batchAvailable ? "batch" : "default");
  };
  return <>
    <div className="operations-shell operations-app-shell" inert={showNote} aria-hidden={showNote || undefined}>
    <a className={styles.skip} href="#workspace-content">Skip to content</a>
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link className={styles.brand} href={workspaceHomePath} onClick={closeMenu}>Garden Manager</Link>
        <nav ref={navigation} id="workspace-navigation" aria-label="Workspace sections" className={`${styles.navigation} ${menuOpen ? styles.open : ""}`} onKeyDown={(event) => { if (menuOpen && event.key === "Escape") closeMenu(); }}>
          {links.map(([href, label]) => <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} onClick={closeMenu}>{label}</Link>)}
        </nav>
        <Button className={styles.toggle} ref={menuButton} aria-expanded={menuOpen} aria-controls="workspace-navigation" onClick={() => { if (menuOpen) closeMenu(); else setMenuOpen(true); }}>Menu</Button>
        <SyncStatus />
      </div>
    </header>
    <main id="workspace-content">
      <div className={styles.context}>
        {pathname !== workspaceHomePath && <Link href={workspaceHomePath}>Back to gardens</Link>}
        <PageHeader title={title} description={description} headingRef={heading} />
        {garden && <>
          <label htmlFor="workspace-garden">Garden</label>{" "}
          <select id="workspace-garden" value={garden.id} onChange={(event) => {
            const next = gardenPath(event.target.value, route.module as "plan" | "care" | "season");
            router.push(route.module === "care" && search.has("view") ? `${next}?view=${search.get("view") === "history" ? "history" : "tasks"}` : next);
          }}>{workspace?.gardens.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <nav className={styles.gardenNav} aria-label="Garden sections">
            {([['plan', 'Garden Plan'], ['care', 'Care'], ['season', 'Next Season']] as const).map(([module, label]) => <Link key={module} href={gardenPath(garden.id, module)} aria-current={route.module === module ? "page" : undefined}>{label}</Link>)}
          </nav>
        </>}
      </div>
      <OpenGardenNoteContext.Provider value={openNote}>
      {route.module === "home" ? <OverviewNoteEntryContext.Provider value={
        <OverviewGardenNote primaryButton={noteButton} expanded={showNote} onOpen={(opener, batchAvailable) => openNote(opener, { batchAvailable })} />
      }>{children}</OverviewNoteEntryContext.Provider> : children}
      </OpenGardenNoteContext.Provider>
    </main>
    </div>
    {showNote && <GardenNoteDialog opener={noteOpener} fallbackOpener={noteButton} batchAvailable={noteMode === "batch"} initialGardenId={noteGardenId} onClose={() => setNoteMode(null)} />}
  </>;
}
