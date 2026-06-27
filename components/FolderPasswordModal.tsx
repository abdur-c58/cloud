"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Modal } from "./Modal";
import { Icon } from "./Icons";

export type LockMode = "set" | "unlock" | "remove";

export function FolderPasswordModal({
  open,
  mode,
  folder,
  onClose,
  onDone,
}: {
  open: boolean;
  mode: LockMode;
  folder: string;
  onClose: () => void;
  onDone: (mode: LockMode) => void;
}) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setPassword("");
      setError("");
    }
  }, [open, mode, folder]);

  const folderName = folder.replace(/\/$/, "").split("/").pop() || folder;

  const titles: Record<LockMode, string> = {
    set: "Protect folder",
    unlock: "Unlock folder",
    remove: "Remove protection",
  };
  const descriptions: Record<LockMode, string> = {
    set: `Set a password for “${folderName}”. You'll need it to open this folder.`,
    unlock: `“${folderName}” is password protected. Enter its password to continue.`,
    remove: `Enter the current password for “${folderName}” to remove its protection.`,
  };
  const confirmLabels: Record<LockMode, string> = {
    set: "Protect",
    unlock: "Unlock",
    remove: "Remove",
  };

  const submit = async () => {
    if (!password.trim()) return;
    setLoading(true);
    setError("");
    try {
      if (mode === "set") await api.lockFolder(folder, password);
      else if (mode === "unlock") await api.unlockFolder(folder, password);
      else await api.removeLock(folder, password);
      onDone(mode);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={titles[mode]}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className={`btn ${mode === "remove" ? "btn-danger" : "btn-primary"}`}
            onClick={submit}
            disabled={loading || !password.trim()}
          >
            {loading ? <span className="spinner h-4 w-4" /> : confirmLabels[mode]}
          </button>
        </>
      }
    >
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">{descriptions[mode]}</p>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground">
          <Icon.Lock size={17} />
        </span>
        <Input
          autoFocus
          type="password"
          className="pl-10"
          placeholder="Folder password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      </div>
      {error && (
        <p className="mt-3 rounded-lg bg-[rgba(239, 68, 68, 0.12)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p>
      )}
    </Modal>
  );
}
