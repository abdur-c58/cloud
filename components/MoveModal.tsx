"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { breadcrumbs } from "@/lib/format";
import type { StorageItem } from "@/lib/types";
import { Modal } from "./Modal";
import { Icon } from "./Icons";

export function MoveModal({
  open,
  item,
  onClose,
  onMove,
}: {
  open: boolean;
  item: StorageItem | null;
  onClose: () => void;
  onMove: (destinationPrefix: string) => void;
}) {
  const [prefix, setPrefix] = useState("");
  const [folders, setFolders] = useState<StorageItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (p: string) => {
    setLoading(true);
    try {
      const res = await api.list(p);
      setFolders(res.folders);
    } catch {
      setFolders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setPrefix("");
      load("");
    }
  }, [open, load]);

  if (!item) return null;

  const crumbs = breadcrumbs(prefix);
  const sourceParent = item.key.endsWith("/")
    ? item.key.replace(/[^/]+\/$/, "")
    : item.key.replace(/[^/]+$/, "");
  const isSameLocation = prefix === sourceParent;
  // Prevent moving a folder into itself / its descendants.
  const isInvalid = item.key.endsWith("/") && (prefix === item.key || prefix.startsWith(item.key));

  const go = (p: string) => {
    setPrefix(p);
    load(p);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Move “${item.name}”`}
      width="max-w-lg"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={isSameLocation || isInvalid}
            onClick={() => onMove(prefix)}
          >
            Move here
          </button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-1 text-sm">
        <button
          onClick={() => go("")}
          className="btn-ghost flex items-center gap-1 rounded-lg px-2 py-1 text-muted-foreground"
        >
          <Icon.Home size={15} /> Home
        </button>
        {crumbs.map((c) => (
          <span key={c.prefix} className="flex items-center gap-1">
            <Icon.ChevronRight size={14} className="text-muted-foreground" />
            <button
              onClick={() => go(c.prefix)}
              className="btn-ghost rounded-lg px-2 py-1 text-muted-foreground"
            >
              {c.name}
            </button>
          </span>
        ))}
      </div>

      <div className="max-h-72 min-h-[8rem] overflow-y-auto rounded-xl border border-[var(--border)] p-1.5">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <span className="spinner h-6 w-6" />
          </div>
        ) : folders.length === 0 ? (
          <p className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            No subfolders here
          </p>
        ) : (
          folders.map((f) => (
            <button
              key={f.key}
              onClick={() => go(f.key)}
              disabled={f.key === item.key}
              className="interactive flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-[var(--surface-raised)] disabled:opacity-40"
            >
              <Icon.Folder size={18} className="text-[var(--accent)]" />
              <span className="flex-1 truncate">{f.name}</span>
              {f.locked && <Icon.Lock size={14} className="text-muted-foreground" />}
              <Icon.ChevronRight size={16} className="text-muted-foreground" />
            </button>
          ))
        )}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Destination: <span className="font-medium text-foreground">/{prefix || "Home"}</span>
        {isInvalid && <span className="ml-2 text-[var(--danger)]">Can&apos;t move into itself.</span>}
        {isSameLocation && !isInvalid && <span className="ml-2">Already here.</span>}
      </p>
    </Modal>
  );
}
