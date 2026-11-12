"use client";

import { useRouter } from "next/navigation";
import { AiGardenNote } from "@/components/AiGardenNote";
import { BatchGardenNote } from "./BatchGardenNote";
import { Button, ButtonLink } from "@/components/ui/Button";
import { useWorkspace, useWorkspaceRequestRef } from "@/components/workspace/WorkspaceProvider";
import { applyCareDraftBatch, newCareDraft } from "@/lib/careNoteBatch";
import type { AiCareNoteDraft } from "@/lib/gardenWorkspaceApi";
import { gardenPath } from "@/lib/workspaceRoutes";
import styles from "./GardenNoteDialog.module.css";

export function WorkspaceGardenNote({ onClose, batchAvailable = false }: { onClose?: () => void; batchAvailable?: boolean }) {
  const router = useRouter();
  const sync = useWorkspace();
  const receipt = sync.singleNoteReceipt;
  const submittedDraft = useWorkspaceRequestRef<AiCareNoteDraft | undefined>("note:submittedDraft", undefined);

  const save = (gardenId: string, draft: AiCareNoteDraft) => {
    const workspace = sync.getLatestWorkspace();
    if (!workspace?.gardens.some((garden) => garden.id === gardenId) || submittedDraft.current === draft) return false;
    const row = { ...newCareDraft({ ...draft, gardenId, sourceText: sync.careNoteBatch.note }), note: draft.note };
    const result = applyCareDraftBatch(workspace, [row]);
    if (!result.added) return false;
    const href = `${draft.targetScope === "all-gardens" ? "/care" : gardenPath(gardenId, "care")}?view=history`;
    submittedDraft.current = draft;
    if (onClose) sync.setSingleNoteReceipt({ row, draft, note: sync.careNoteBatch.note, href, saved: false });
    sync.setWorkspace({ ...result.workspace, selectedGardenId: gardenId });
    if (!onClose) {
      sync.setMessage("Care record added to History.");
      router.push(href);
    }
    return true;
  };

  if (receipt) return <section className="operations-content" aria-label="Note result">
    <h3>{receipt.saved ? "Saved 1 record" : "Added 1 record to this workspace"}</h3>
    <p role="status">{receipt.saved ? "Your reviewed record is saved." : "Waiting for workspace sync. If saving fails, use the retry controls here."}</p>
    {receipt.saved && <div className={onClose ? styles.footer : "form-actions"}>
      <ButtonLink href={receipt.href}>View records</ButtonLink>
      <Button onClick={() => sync.setSingleNoteReceipt(undefined)}>Record more</Button>
      {onClose && <Button variant="primary" onClick={() => { sync.setSingleNoteReceipt(undefined); onClose(); }}>Done and close</Button>}
    </div>}
  </section>;

  if (batchAvailable) return <BatchGardenNote onClose={onClose} />;
  return <AiGardenNote gardens={sync.workspace?.gardens ?? []} initialGardenId="" isServerBacked={sync.storageSource === "server"}
    onSave={save} workspaceId={sync.serverWorkspaceId} onClose={onClose} />;
}
