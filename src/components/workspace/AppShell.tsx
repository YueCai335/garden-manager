"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, Fragment, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useWorkspace } from "./WorkspaceProvider";
import { SyncStatus } from "./SyncStatus";
import { gardenPath, routeFromPath, workspaceHomePath } from "@/lib/workspaceRoutes";
import { nextSeasonYear } from "@/lib/seasonAllocation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { GardenNoteDialog } from "@/components/notes/GardenNoteDialog";
import { useRuntimeConfig } from "@/components/PortfolioFeaturePreview";
import { OverviewGardenNote } from "./OverviewGardenNote";
import styles from "./AppShell.module.css";

// The L1 modules (ADR-0073): the garden modules, a divider, then the AI helpers.
const moduleGroups = [
  [[workspaceHomePath, "Gardens"], ["/care", "Care"], ["/season", "Next Season"]],
  [["/doctor", "Plant Doctor"], ["/guide", "Plant Guide"]],
] as const;
const OverviewNoteEntryContext = createContext<ReactNode>(null);
type OpenGardenNote = (opener: HTMLButtonElement | null, options: { batchAvailable: boolean; gardenId?: string }) => void;
const OpenGardenNoteContext = createContext<OpenGardenNote | null>(null);

export function OverviewNoteEntry() {
  return useContext(OverviewNoteEntryContext);
}

/** Opens the Garden Note dialog, the same session as the header's "+ Note", from any page (the guided setup's Ready step). */
export function useOpenGardenNote() {
  return useContext(OpenGardenNoteContext);
}

/** The header's current module: a module's own page is the page; a garden below Gardens marks Gardens as its section. */
function currentFor(href: string, pathname: string) {
  if (pathname === href) return "page" as const;
  if (href === workspaceHomePath && pathname.startsWith(`${workspaceHomePath}/`)) return "true" as const;
  return undefined;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const { workspace, isLoaded } = useWorkspace();
  const { config } = useRuntimeConfig();
  const route = routeFromPath(pathname);
  const garden = workspace?.gardens.find((item) => item.id === route.gardenId);
  const area = route.module === "plan" ? garden?.growingAreas.find((item) => item.id === search.get("area")) : undefined;
  const [menuOpen, setMenuOpen] = useState(false);
  const [noteMode, setNoteMode] = useState<"batch" | "default" | null>(null);
  const [noteGardenId, setNoteGardenId] = useState<string>();
  const noteButton = useRef<HTMLButtonElement>(null);
  const headerNoteButton = useRef<HTMLButtonElement>(null);
  const noteOpener = useRef<HTMLButtonElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const navigation = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const header = useRef<HTMLElement>(null);
  // The header is sticky; its height (which grows with the open menu or a saving warning) offsets other sticky parts and scroll-into-view.
  useEffect(() => {
    const node = header.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => root.style.setProperty("--app-header-height", `${node.offsetHeight}px`));
    observer.observe(node);
    return () => { observer.disconnect(); root.style.removeProperty("--app-header-height"); };
  }, []);
  const title = {
    home: "Gardens", new: "Add garden", plan: garden?.name ?? "Garden Plan", care: "Care",
    season: `Next Season · ${nextSeasonYear()}`, notes: "AI Garden Note", guide: "Plant Guide", doctor: "Plant Doctor",
  }[route.module];
  const description = route.module === "doctor" ? "Record what you observe and review an assessment before saving it to health history."
    : route.module === "guide" ? "Ask a gardening question and see the reviewed sources behind the answer." : undefined;
  // L2 and L3 pages sit below the header modules: one garden, one area, or a new garden.
  // A garden's care and season plan are filtered L1 modules, so they have no crumbs (ADR-0073, phase S3).
  const crumbs: { label: string; href?: string }[] | null = route.module === "new" ? [{ label: "Add garden" }]
    : route.gardenId === undefined ? null : [
      ...(garden ? [{ label: garden.name, href: area ? gardenPath(garden.id) : undefined }] : []),
      ...(area ? [{ label: area.name }] : []),
    ];
  useEffect(() => { if (isLoaded) heading.current?.focus(); }, [pathname, isLoaded]);
  useEffect(() => { if (menuOpen) navigation.current?.querySelector("a")?.focus(); }, [menuOpen]);
  // Moving to another page closes the dialog; the note session itself stays in the provider.
  const notePath = useRef(pathname);
  useEffect(() => { if (notePath.current !== pathname) { notePath.current = pathname; setNoteMode(null); } }, [pathname]);
  const closeMenu = () => { setMenuOpen(false); if (menuOpen) menuButton.current?.focus(); };
  const showNote = noteMode !== null;
  const batchAvailable = config?.careNoteBatchAvailable === true;
  const openNote: OpenGardenNote = (opener, { batchAvailable, gardenId }) => {
    noteOpener.current = opener;
    setMenuOpen(false);
    setNoteGardenId(gardenId);
    setNoteMode(batchAvailable ? "batch" : "default");
  };
  return <>
    <div className="operations-shell operations-app-shell" inert={showNote} aria-hidden={showNote || undefined}>
    <a className={styles.skip} href="#workspace-content">Skip to content</a>
    <header ref={header} className={styles.header}>
      <div className={styles.headerInner}>
        {/* The brand names the whole site, so it always returns to the landing page; Gardens is the app's home (ADR-0073). */}
        <Link className={styles.brand} href="/" onClick={closeMenu}>
          <svg viewBox="0 0 26 26" aria-hidden="true"><path d="M13 23C6 19 4 12 6 4c6 1 11 5 12 12 0 3-2 5-5 7Z" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
          Garden Manager
        </Link>
        <nav ref={navigation} id="workspace-navigation" aria-label="Workspace sections" className={`${styles.navigation} ${menuOpen ? styles.open : ""}`} onKeyDown={(event) => {
          // The menu claims this Escape, so the plan's zoom does not also leave its area.
          if (menuOpen && event.key === "Escape") { event.preventDefault(); closeMenu(); }
        }}>
          {moduleGroups.map((group, index) => <Fragment key={group[0][0]}>
            {index > 0 && <span className={styles.divider} aria-hidden="true" />}
            {group.map(([href, label]) => <Link key={href} href={href} aria-current={currentFor(href, pathname)} onClick={closeMenu}>{label}</Link>)}
          </Fragment>)}
        </nav>
        <Button className={styles.toggle} ref={menuButton} aria-expanded={menuOpen} aria-controls="workspace-navigation" onClick={() => { if (menuOpen) closeMenu(); else setMenuOpen(true); }}>Menu</Button>
        <button ref={headerNoteButton} type="button" className={styles.note} aria-haspopup="dialog" aria-expanded={showNote}
          onClick={(event) => openNote(event.currentTarget, { batchAvailable, gardenId: garden?.id })}>
          <span aria-hidden="true">+ </span>Note
        </button>
        <SyncStatus />
      </div>
    </header>
    <main id="workspace-content">
      <div className={styles.context}>
        {crumbs && <div className={styles.crumbs}>
          <ButtonLink href={workspaceHomePath} shape="pill" className={styles.allGardens}><span aria-hidden="true">←</span>All gardens</ButtonLink>
          <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
            <ol>
              <li><Link href={workspaceHomePath}>Gardens</Link></li>
              {crumbs.map((crumb, index) => <li key={`${index}-${crumb.label}`}>
                {crumb.href ? <Link href={crumb.href}>{crumb.label}</Link>
                  : <span aria-current={index === crumbs.length - 1 ? "page" : undefined}>{crumb.label}</span>}
              </li>)}
            </ol>
          </nav>
          {garden && <div className={styles.switcher}>
            <label htmlFor="workspace-garden">Garden</label>
            <select id="workspace-garden" value={garden.id} onChange={(event) => router.push(gardenPath(event.target.value))}>{workspace?.gardens.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          </div>}
        </div>}
        <PageHeader title={title} description={description} headingRef={heading} />
      </div>
      <OpenGardenNoteContext.Provider value={openNote}>
      {route.module === "home" ? <OverviewNoteEntryContext.Provider value={
        <OverviewGardenNote primaryButton={noteButton} expanded={showNote} onOpen={(opener, batchAvailable) => openNote(opener, { batchAvailable })} />
      }>{children}</OverviewNoteEntryContext.Provider> : children}
      </OpenGardenNoteContext.Provider>
    </main>
    </div>
    {showNote && <GardenNoteDialog opener={noteOpener} fallbackOpener={route.module === "home" ? noteButton : headerNoteButton} batchAvailable={noteMode === "batch"} initialGardenId={noteGardenId} onClose={() => setNoteMode(null)} />}
  </>;
}
