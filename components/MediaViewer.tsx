"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { resolveMediaUrl, useMediaUrl } from "@/lib/mediaUrl";
import { formatBytes, formatDate } from "@/lib/format";
import type { StorageItem } from "@/lib/types";
import { toast } from "@/lib/toast";
import { Icon } from "./Icons";

export function MediaViewer({
  items,
  index,
  onClose,
  onIndexChange,
  onFavorite,
  onDelete,
  aiEnabled,
  shareId,
}: {
  items: StorageItem[];
  index: number;
  onClose: () => void;
  onIndexChange: (i: number) => void;
  onFavorite: (item: StorageItem) => void;
  onDelete: (item: StorageItem) => void;
  aiEnabled: boolean;
  shareId?: string;
}) {
  const item = items[index];
  const { url, error } = useMediaUrl(item?.key ?? null, true, shareId);
  const [tagging, setTagging] = useState(false);
  const [tags, setTags] = useState<string[]>(item?.tags ?? []);

  useEffect(() => setTags(item?.tags ?? []), [item?.key, item?.tags]);

  const go = useCallback(
    (delta: number) => {
      const next = index + delta;
      if (next >= 0 && next < items.length) onIndexChange(next);
    },
    [index, items.length, onIndexChange],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  if (!item) return null;

  const download = async () => {
    try {
      const u = await resolveMediaUrl(item.key, true, shareId);
      const a = document.createElement("a");
      a.href = u;
      a.download = item.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      toast("Download failed", "error");
    }
  };

  const suggest = async () => {
    setTagging(true);
    try {
      const res = await api.suggestTags(item.key);
      if (res.message) toast(res.message, "info");
      else {
        setTags(res.tags);
        toast(`Tagged: ${res.tags.join(", ") || "no tags"}`, "success");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Tagging failed", "error");
    } finally {
      setTagging(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[95] flex flex-col bg-black/90 animate-fade-in backdrop-blur-sm">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-2 p-3 text-white safe-pt">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{item.name}</p>
          <p className="text-xs text-white/60">
            {item.type} · {formatBytes(item.size)} · {formatDate(item.last_modified)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => onFavorite(item)} className="rounded-lg p-2 hover:bg-white/10" title="Favorite">
            {item.favorite ? <Icon.StarFill size={20} className="text-[var(--warn)]" /> : <Icon.Star size={20} />}
          </button>
          {aiEnabled && item.type === "image" && (
            <button onClick={suggest} disabled={tagging} className="rounded-lg p-2 hover:bg-white/10" title="Auto-tag with AI">
              {tagging ? <span className="spinner h-5 w-5" /> : <Icon.Sparkles size={20} />}
            </button>
          )}
          <button onClick={download} className="rounded-lg p-2 hover:bg-white/10" title="Download">
            <Icon.Download size={20} />
          </button>
          <button
            onClick={() => onDelete(item)}
            className="rounded-lg p-2 text-[var(--danger)] hover:bg-white/10"
            title="Delete"
          >
            <Icon.Trash size={20} />
          </button>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-white/10" title="Close">
            <Icon.X size={22} />
          </button>
        </div>
      </div>

      {/* Stage */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-2">
        {index > 0 && (
          <button
            onClick={() => go(-1)}
            className="absolute left-2 z-10 rounded-full bg-white/10 p-2.5 text-white transition hover:bg-white/20 hover:scale-105"
            aria-label="Previous"
          >
            <Icon.ChevronLeft size={24} />
          </button>
        )}

        <div className="flex h-full max-h-full w-full max-w-5xl items-center justify-center">
          {!url && !error && <span className="spinner h-9 w-9 border-white/30 border-t-white" />}
          {error && <p className="text-white/70">Couldn&apos;t load this file.</p>}
          {url && item.type === "image" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={item.name} className="max-h-[78vh] max-w-full rounded-xl object-contain animate-pop-in" />
          )}
          {url && item.type === "video" && (
            <video src={url} controls autoPlay playsInline className="max-h-[78vh] max-w-full rounded-xl animate-pop-in" />
          )}
          {url && item.type === "audio" && (
            <div className="card w-full max-w-md p-6 text-center animate-pop-in">
              <div
                className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-2xl text-white"
                style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }}
              >
                <Icon.Audio size={44} />
              </div>
              <p className="mb-4 truncate font-medium">{item.name}</p>
              <audio src={url} controls autoPlay className="w-full" />
            </div>
          )}
        </div>

        {index < items.length - 1 && (
          <button
            onClick={() => go(1)}
            className="absolute right-2 z-10 rounded-full bg-white/10 p-2.5 text-white transition hover:bg-white/20 hover:scale-105"
            aria-label="Next"
          >
            <Icon.ChevronRight size={24} />
          </button>
        )}
      </div>

      {/* Footer: tags + counter */}
      <div className="flex items-center justify-between gap-3 p-3 text-white/70 safe-pb">
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.map((t) => (
            <span key={t} className="chip" style={{ background: "rgba(255,255,255,0.12)", color: "white" }}>
              {t}
            </span>
          ))}
        </div>
        <span className="shrink-0 text-xs">
          {index + 1} / {items.length}
        </span>
      </div>
    </div>
  );
}
