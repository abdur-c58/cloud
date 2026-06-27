"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { SharedFolderInfo, SharedJoinCodeInfo, SharedMemberInfo } from "@/lib/types";
import { ConfirmDialog } from "./ConfirmDialog";
import { Modal } from "./Modal";
import { Icon } from "./Icons";
import { toast } from "@/lib/toast";

export function SharedManageModal({
  open,
  share,
  onClose,
  onDeleted,
}: {
  open: boolean;
  share: SharedFolderInfo | null;
  onClose: () => void;
  onDeleted?: (shareId: string) => void;
}) {
  const [members, setMembers] = useState<SharedMemberInfo[]>([]);
  const [codes, setCodes] = useState<SharedJoinCodeInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!share) return;
    setLoading(true);
    try {
      const [m, c] = await Promise.all([api.sharedMembers(share.id), api.sharedCodes(share.id)]);
      setMembers(m.members);
      setCodes(c.codes);
    } catch {
      toast("Failed to load shared folder details", "error");
    } finally {
      setLoading(false);
    }
  }, [share]);

  useEffect(() => {
    if (open && share) load();
  }, [open, share, load]);

  useEffect(() => {
    if (!open) setDeleteOpen(false);
  }, [open]);

  const createCode = async () => {
    if (!share) return;
    try {
      const { code } = await api.sharedCreateCode(share.id);
      toast(`New code: ${code}`, "success");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to create code", "error");
    }
  };

  const revokeCode = async (code: string) => {
    if (!share) return;
    try {
      await api.sharedRevokeCode(share.id, code);
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to revoke code", "error");
    }
  };

  const kick = async (userId: string) => {
    if (!share) return;
    try {
      await api.sharedKick(share.id, userId);
      toast("Member removed", "success");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to remove member", "error");
    }
  };

  const deleteFolder = async () => {
    if (!share) return;
    setDeleting(true);
    try {
      await api.sharedDeleteFolder(share.id);
      setDeleteOpen(false);
      onClose();
      onDeleted?.(share.id);
      toast(`Deleted “${share.name}”`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to delete shared folder", "error");
    } finally {
      setDeleting(false);
    }
  };

  if (!share) return null;

  return (
    <>
      <Modal open={open} onClose={onClose} title={`Manage “${share.name}”`} width="max-w-lg">
        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-6">
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Join codes</h3>
                {share.is_owner && (
                  <button onClick={createCode} className="btn btn-surface !py-1.5 text-xs transition-opacity hover:opacity-90">
                    <Icon.Plus size={14} /> New code
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                {codes.length === 0 && (
                  <p className="text-xs text-muted-foreground">No join codes yet.</p>
                )}
                {codes.map((c) => (
                  <div
                    key={c.code}
                    className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2 transition-colors hover:border-[var(--border-hover)]"
                  >
                    <div>
                      <span className="font-mono text-sm tracking-wider">{c.code}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {c.revoked ? "Revoked" : `${c.use_count} uses`}
                      </span>
                    </div>
                    {share.is_owner && !c.revoked && (
                      <button
                        onClick={() => revokeCode(c.code)}
                        className="btn-ghost rounded-md p-1 text-xs text-[var(--danger)] transition-opacity hover:opacity-80"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold">Members ({members.length})</h3>
              <div className="space-y-1.5">
                {members.map((m) => (
                  <div
                    key={m.user_id}
                    className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2 transition-colors hover:border-[var(--border-hover)]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{m.name || m.email || m.user_id}</p>
                      <p className="text-xs capitalize text-muted-foreground">{m.role}</p>
                    </div>
                    {share.is_owner && m.role !== "owner" && (
                      <button
                        onClick={() => kick(m.user_id)}
                        className="btn-ghost rounded-md p-1.5 text-[var(--danger)] transition-opacity hover:opacity-80"
                        aria-label="Remove member"
                      >
                        <Icon.X size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {share.is_owner && (
              <section className="border-t border-[var(--border)] pt-4">
                <h3 className="mb-1 text-sm font-semibold text-[var(--danger)]">Danger zone</h3>
                <p className="mb-3 text-xs text-muted-foreground">
                  Permanently deletes this shared folder, all copies inside it, and removes every member. Personal
                  library originals imported from are not affected.
                </p>
                <button
                  onClick={() => setDeleteOpen(true)}
                  className="btn btn-danger w-full transition-opacity hover:opacity-90"
                  disabled={deleting}
                >
                  <Icon.Trash size={15} /> Delete shared folder
                </button>
              </section>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete shared folder?"
        message={`“${share.name}” and all media inside it will be permanently deleted for every member. This cannot be undone.`}
        confirmLabel={deleting ? "Deleting…" : "Delete folder"}
        onCancel={() => !deleting && setDeleteOpen(false)}
        onConfirm={deleteFolder}
      />
    </>
  );
}
