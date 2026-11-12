"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { useWorkspace } from "./WorkspaceProvider";
import styles from "./AppShell.module.css";

export function ServerWorkspaceUnavailable() {
  const router = useRouter();
  const { missingWorkspace, recoverMissingWorkspace } = useWorkspace();
  const [confirming, setConfirming] = useState(false);
  const raw = missingWorkspace?.raw;
  const hasBackup = Boolean(missingWorkspace?.backup);
  const canDownload = typeof raw === "string";
  const action = hasBackup ? "Restore browser copy" : "Start a new workspace";

  const download = () => {
    if (typeof raw !== "string") return;
    const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "garden-workspace-backup.json";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <section className="garden-onboarding" aria-labelledby="server-workspace-heading">
    <h2 id="server-workspace-heading">{missingWorkspace ? "Workspace not found" : "Your workspace is unavailable"}</h2>
    {missingWorkspace ? <>
      <p>The connected server could not find this browser’s saved workspace. You can retry the connection above.</p>
      <p>{hasBackup ? "A copy is available in this browser. It may be older than the workspace you last used."
        : raw === undefined ? "This browser’s saved copy could not be checked. Check browser storage and retry."
        : canDownload ? "This browser has saved data that the app cannot read. You can download it before starting fresh."
        : "There is no saved copy in this browser. You can start with an empty workspace."}</p>
      {raw !== undefined && <div className={styles.recoveryActions}>
        <Button variant="primary" onClick={() => setConfirming(true)}>{action}</Button>
        {canDownload && <Button onClick={download}>Download browser copy</Button>}
      </div>}
      {confirming && <ConfirmDialog
        title={`${action}?`}
        message={hasBackup
          ? "This opens the browser copy as a new workspace. Changes made only on the previous server may be missing. The old reference and original copy are kept on this device."
          : "This opens an empty workspace on this device. The old reference is kept, and any unreadable browser data is archived."}
        confirmLabel={action}
        onCancel={() => setConfirming(false)}
        onConfirm={() => { recoverMissingWorkspace(); setConfirming(false); router.replace("/"); }}
      />}
    </> : <p>Your saved workspace is still linked to this browser. Use Retry in the saving status above to load it again.</p>}
  </section>;
}
