"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { StorageItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Modal } from "./Modal";
import { Icon } from "./Icons";
import { toast } from "@/lib/toast";

export function ImportToSharedModal({
  open,
  shareId,
  destinationPrefix,
  onClose,
  onDone,
}: {
  open: boolean;
  shareId: string;
  destinationPrefix: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [browsePrefix, setBrowsePrefix] = useState("");
  const [folders, setFolders] = useState<StorageItem[]>([]);
  const [files, setFiles] = useState<StorageItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.list(browsePrefix);
      setFolders(res.folders);
      setFiles(res.files);
    } catch {
      toast("Failed to load library", "error");
    } finally {
      setLoading(false);
    }
  }, [browsePrefix]);

  useEffect(() => {
    if (open) {
      setBrowsePrefix("");
      setSelected(new Set());
      load();
    }
  }, [open, load]);

  useEffect(() => {
    if (open) load();
  }, [browsePrefix, open, load]);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectFolder = (folderKey: string) => {
    setSelected((prev) => new Set(prev).add(folderKey.endsWith("/") ? folderKey : `${folderKey}/`));
  };

  const importSelected = async () => {
    if (selected.size === 0) return;
    setImporting(true);
    try {
      const res = await api.sharedImport(shareId, [...selected], destinationPrefix);
      toast(`Imported ${res.imported.length} item(s)`, "success");
      onDone();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Import failed", "error");
    } finally {
      setImporting(false);
    }
  };

  const crumbs = browsePrefix
    ? browsePrefix.replace(/\/$/, "").split("/")
    : [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import from your library"
      width="max-w-lg"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={importSelected}
            disabled={importing || selected.size === 0}
          >
            {importing ? <span className="spinner h-4 w-4" /> : `Import ${selected.size || ""} selected`}
          </button>
        </>
      }
    >
      <p className="mb-3 text-xs text-muted-foreground">
        Copies are made into the shared folder. Your originals stay in your library.
      </p>
      <div className="mb-2 flex flex-wrap items-center gap-1 text-xs">
        <button
          onClick={() => setBrowsePrefix("")}
          className={cn("rounded px-1.5 py-0.5", !browsePrefix && "bg-[var(--surface-raised)]")}
        >
          Home
        </button>
        {crumbs.map((c, i) => {
          const p = crumbs.slice(0, i + 1).join("/") + "/";
          return (
            <span key={p} className="flex items-center gap-1">
              <Icon.ChevronRight size={12} className="text-muted-foreground" />
              <button
                onClick={() => setBrowsePrefix(p)}
                className={cn("rounded px-1.5 py-0.5", browsePrefix === p && "bg-[var(--surface-raised)]")}
              >
                {c}
              </button>
            </span>
          );
        })}
      </div>
      <div className="max-h-72 overflow-y-auto rounded-lg border border-[var(--border)] p-1">
        {loading ? (
          <p className="p-4 text-center text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            {folders.map((f) => (
              <div key={f.key} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[var(--surface-raised)]">
                <input
                  type="checkbox"
                  checked={selected.has(f.key.endsWith("/") ? f.key : `${f.key}/`)}
                  onChange={() => selectFolder(f.key)}
                  className="shrink-0"
                />
                <button
                  onClick={() => setBrowsePrefix(f.key.endsWith("/") ? f.key : `${f.key}/`)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
                >
                  <Icon.Folder size={16} />
                  <span className="truncate">{f.name}</span>
                </button>
                <button
                  onClick={() => selectFolder(f.key)}
                  className="btn-ghost shrink-0 rounded px-2 py-0.5 text-[10px]"
                >
                  Import folder
                </button>
              </div>
            ))}
            {files.map((f) => (
              <label
                key={f.key}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[var(--surface-raised)]"
              >
                <input type="checkbox" checked={selected.has(f.key)} onChange={() => toggle(f.key)} />
                <Icon.File size={16} />
                <span className="truncate text-sm">{f.name}</span>
              </label>
            ))}
            {!loading && folders.length === 0 && files.length === 0 && (
              <p className="p-4 text-center text-sm text-muted-foreground">This folder is empty.</p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
