"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { useWorkspace } from "./WorkspaceProvider";
import styles from "./AppShell.module.css";

export function SyncStatus({ recoveryOnly = false }: { recoveryOnly?: boolean }) {
  const { syncState, syncError, isBusy, isSlow, isOnline, isImporting, importFailed, retrySync, reloadFromServer, keepLocalChanges } = useWorkspace();
  const [confirmation, setConfirmation] = useState<"reload" | "keep">();
  const labels = {
    loading: "Loading…", "load-error": "Workspace could not be loaded", "workspace-missing": "Workspace unavailable",
    empty: "Ready to start", local: isImporting ? "Connecting…" : "Saved on this device",
    "local-error": "Changes could not be saved on this device", saving: "Saving…",
    saved: "All changes saved", error: "Changes not synced", conflict: "A newer version is available",
  };
  const failed = syncState === "load-error" || syncState === "workspace-missing" || syncState === "local-error" || syncState === "error" || syncState === "conflict";
  const canRetry = (failed && syncState !== "conflict") || (syncState === "local" && importFailed);
  const retryingSave = syncState === "saving" && Boolean(syncError);
  const detail = syncState === "saved" ? "Submitted changes are saved. Submit your form drafts to save them."
    : syncState === "local" && !isImporting ? "Your workspace is stored in this browser." : "";
  return <>
    {!recoveryOnly && <div className={styles.sync}>
      {detail ? <details className={styles.syncDetails}>
        <summary><span role="status">{labels[syncState]}</span></summary>
        <p>{detail}</p>
      </details> : <span role="status">{failed ? "Sync needs attention" : labels[syncState]}</span>}
    </div>}
    {(failed || retryingSave || importFailed || !isOnline || isSlow) && <section aria-label="Workspace saving" className={styles.recovery}>
      <div role={failed ? "alert" : "status"}>
        {failed && <strong>{labels[syncState]}</strong>}
        {syncState === "conflict" && <p>This workspace changed in another tab. Your latest edits here still need to be saved.</p>}
        {syncError && <p>{syncError}</p>}
        {syncState === "local" && importFailed && <p>Your changes are stored on this device. Retry to save them online.</p>}
        {!isOnline && <p>You appear to be offline. Keep this page open and retry after reconnecting.</p>}
        {isSlow && <p>This is taking longer than usual. Your changes are still here. You can retry if the connection times out.</p>}
      </div>
      {canRetry || retryingSave ? <Button disabled={isBusy} onClick={retrySync}>Retry</Button> : null}
      {syncState === "conflict" && <div className={styles.recoveryActions}>
        <Button disabled={isBusy} onClick={() => setConfirmation("reload")}>Reload latest</Button>
        <Button variant="primary" disabled={isBusy} onClick={() => setConfirmation("keep")}>Keep my changes</Button>
      </div>}
      {confirmation && syncState === "conflict" && <ConfirmDialog
        message={confirmation === "reload" ? "Reload the server version? This discards this tab's unsynced workspace changes. Unsubmitted form drafts stay available for review." : "Keep this tab's changes? This replaces the newer server workspace with the current contents of this tab, including all gardens and records."}
        confirmLabel={confirmation === "reload" ? "Discard unsynced changes and reload" : "Replace server version"}
        tone="danger"
        onCancel={() => setConfirmation(undefined)}
        onConfirm={() => { const choice = confirmation; setConfirmation(undefined); if (choice === "reload") void reloadFromServer(); else keepLocalChanges(); }}
      />}
    </section>}
  </>;
}
