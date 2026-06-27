"use client";

import { useSession } from "next-auth/react";
import { formatBytes } from "@/lib/format";
import type { DragItemPayload, DropDestination } from "@/lib/dnd";
import { canDropItem, getDropLabel } from "@/lib/dnd";
import type { IndexSummary, SharedFolderInfo } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DropTarget } from "./DropTarget";
import { Icon } from "./Icons";
import { NavTab } from "./NavTab";

export type NavKey = "library" | "image" | "video" | "audio" | "favorites";

const NAV: { key: NavKey; label: string; icon: React.ReactNode }[] = [
  { key: "library", label: "Library", icon: <Icon.Folder size={18} /> },
  { key: "image", label: "Photos", icon: <Icon.Image size={18} /> },
  { key: "video", label: "Videos", icon: <Icon.Video size={18} /> },
  { key: "audio", label: "Audio", icon: <Icon.Audio size={18} /> },
  { key: "favorites", label: "Favorites", icon: <Icon.Star size={18} /> },
];

export function Sidebar({
  active,
  onNavigate,
  summary,
  sharedFolders,
  activeShareId,
  onOpenShare,
  onCreateShare,
  onJoinShare,
  onManageShare,
  onOpenChat,
  onLogout,
  onClose,
  draggingItem,
  onDropOnFolder,
}: {
  active: NavKey;
  onNavigate: (key: NavKey) => void;
  summary: IndexSummary | null;
  sharedFolders: SharedFolderInfo[];
  activeShareId: string | null;
  onOpenShare: (share: SharedFolderInfo) => void;
  onCreateShare: () => void;
  onJoinShare: () => void;
  onManageShare: (share: SharedFolderInfo) => void;
  onOpenChat: () => void;
  onLogout: () => void;
  onClose?: () => void;
  draggingItem?: DragItemPayload | null;
  onDropOnFolder?: (dest: DropDestination) => void;
}) {
  const { data: session } = useSession();
  const userName = session?.user?.name?.trim() || "GigaChad";
  const userEmail = session?.user?.email?.trim();
  const userImage = session?.user?.image;
  const initial = (userName[0] || userEmail?.[0] || "G").toUpperCase();

  return (
    <div className="flex h-full w-[260px] flex-col border-r border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-8 flex items-center justify-between px-1">
        <div className="flex min-w-0 items-center gap-3">
          {userImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={userImage}
              alt={userName}
              referrerPolicy="no-referrer"
              className="h-9 w-9 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-raised)] text-sm font-semibold text-[var(--foreground)]">
              {initial}
            </span>
          )}
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold uppercase tracking-[0.12em] text-[var(--foreground)]">
              {userName}
            </p>
            <p className="label-caps mt-0.5 truncate text-[10px] text-muted-foreground">Cloud</p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="btn-ghost p-1.5 lg:hidden" aria-label="Close menu">
            <Icon.X size={18} />
          </button>
        )}
      </div>

      <p className="label-caps mb-2 px-3 text-[10px] text-muted-foreground">Browse</p>
      <nav className="flex flex-col gap-0.5">
        {NAV.map((n, i) => (
          <NavTab
            key={n.key}
            active={!activeShareId && active === n.key}
            label={n.label}
            icon={n.icon}
            index={i}
            onClick={() => onNavigate(n.key)}
          />
        ))}
      </nav>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between px-3">
          <p className="label-caps text-[10px] text-muted-foreground">Shared</p>
          <div className="flex gap-0.5">
            <button
              onClick={onJoinShare}
              className="btn-ghost rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              title="Join with code"
            >
              Join
            </button>
            <button onClick={onCreateShare} className="btn-ghost rounded-md p-1" title="Host folder" aria-label="Host">
              <Icon.Plus size={14} />
            </button>
          </div>
        </div>
        <nav className="flex max-h-36 flex-col gap-0.5 overflow-y-auto">
          {sharedFolders.length === 0 && (
            <p className="px-3 py-2 text-[10px] text-muted-foreground">No shared folders yet</p>
          )}
          {sharedFolders.map((s) => {
            const dest: DropDestination = { prefix: "", scope: "shared", shareId: s.id };
            const canDrop = draggingItem ? canDropItem(draggingItem, dest) : false;
            const dropLabel = draggingItem ? getDropLabel(draggingItem, dest) : "";

            const row = (
              <div
                className={cn(
                  "flex items-center gap-0.5",
                  activeShareId === s.id && "nav-tab--active rounded-[var(--radius)]",
                )}
              >
                <button
                  onClick={() => onOpenShare(s)}
                  className={cn(
                    "nav-tab flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm",
                    activeShareId === s.id
                      ? "text-[var(--foreground)]"
                      : "text-muted-foreground hover:text-[var(--foreground)]",
                  )}
                >
                  <Icon.Folder size={16} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  {s.is_owner && (
                    <span className="label-caps shrink-0 rounded border border-[var(--border)] bg-[var(--surface-raised)] px-1.5 py-0.5 text-[9px] text-muted-foreground">
                      Host
                    </span>
                  )}
                </button>
                {s.is_owner && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onManageShare(s);
                    }}
                    className="btn-ghost mr-1 shrink-0 rounded-md border border-[var(--border)] bg-[var(--surface-raised)] p-1.5 text-muted-foreground transition-all duration-150 hover:border-[var(--border-hover)] hover:text-[var(--foreground)]"
                    aria-label="Manage"
                  >
                    <Icon.Dots size={14} />
                  </button>
                )}
              </div>
            );

            if (!draggingItem || !onDropOnFolder) return <div key={s.id}>{row}</div>;

            return (
              <DropTarget
                key={s.id}
                label={dropLabel}
                disabled={!canDrop}
                onDrop={() => onDropOnFolder(dest)}
                className="rounded-[var(--radius)]"
              >
                {row}
              </DropTarget>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto pt-6">
        {summary && (
          <div className="glow-card mb-4 p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="label-caps text-[10px] text-muted-foreground">Storage</p>
              <span className="label-caps text-[10px] text-muted-foreground">{summary.total_items} items</span>
            </div>
            <p className="text-xl font-bold tracking-tight text-[var(--foreground)]">
              {formatBytes(summary.total_bytes)}
            </p>
            <div className="mt-3 flex h-px overflow-hidden bg-[var(--border)]">
              {(["image", "video", "audio"] as const).map((t, i) => {
                const bytes = summary.by_type[t]?.bytes ?? 0;
                const pct = summary.total_bytes ? (bytes / summary.total_bytes) * 100 : 0;
                const colors = ["#6b6b75", "#a8a8b0", "#f4f4f5"];
                return pct > 0 ? (
                  <div key={t} style={{ width: `${pct}%`, background: colors[i] }} />
                ) : null;
              })}
            </div>
          </div>
        )}

        <button
          onClick={onOpenChat}
          className="glow-btn-secondary mb-2 flex w-full items-center justify-start gap-2 px-3 py-2.5"
        >
          <Icon.Sparkles size={17} />
          <span className="label-caps text-[11px]">Assistant</span>
        </button>
        <button
          onClick={onLogout}
          className="glow-btn-secondary flex w-full items-center justify-center gap-2 px-3 py-2.5"
          title="Sign out"
        >
          <Icon.Logout size={17} />
          <span className="label-caps text-[11px]">Sign out</span>
        </button>
      </div>
    </div>
  );
}
