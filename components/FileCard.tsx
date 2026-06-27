"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatBytes, relativeTime } from "@/lib/format";
import type { StorageItem } from "@/lib/types";
import { Icon } from "./Icons";
import { MediaThumb } from "./MediaThumb";

export type CardAction =
  | "open"
  | "favorite"
  | "download"
  | "rename"
  | "move"
  | "delete"
  | "lock"
  | "unlock"
  | "removeLock"
  | "tags";

type MenuEntry = {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  hidden?: boolean;
};

function CardMenu({
  items,
  align = "end",
}: {
  items: MenuEntry[];
  align?: "start" | "end";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] text-muted-foreground transition-colors duration-150 hover:border-[var(--border-hover)] hover:bg-[#222222] hover:text-[var(--foreground)]"
            aria-label="More actions"
            onClick={(e) => e.stopPropagation()}
          >
            <Icon.Dots size={16} />
          </button>
        }
      />
      <DropdownMenuContent align={align} className="min-w-[180px]" onClick={(e) => e.stopPropagation()}>
        {items
          .filter((i) => !i.hidden)
          .map((item) => (
            <DropdownMenuItem
              key={item.label}
              variant={item.danger ? "destructive" : "default"}
              onClick={item.onClick}
            >
              {item.icon && <span className="shrink-0 opacity-80">{item.icon}</span>}
              {item.label}
            </DropdownMenuItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function FileCard({
  item,
  view,
  onAction,
  variant = "personal",
  shareId,
}: {
  item: StorageItem;
  view: "grid" | "list";
  onAction: (action: CardAction, item: StorageItem) => void;
  variant?: "personal" | "shared";
  shareId?: string;
}) {
  const isShared = variant === "shared";
  const isFolder = item.type === "folder";
  const isMedia = item.type === "image" || item.type === "video" || item.type === "audio";

  const menu: MenuEntry[] = isShared
    ? isFolder
      ? [
          { label: "Open", icon: <Icon.Folder size={16} />, onClick: () => onAction("open", item) },
          { label: "Delete", icon: <Icon.Trash size={16} />, onClick: () => onAction("delete", item), danger: true },
        ]
      : [
          { label: "Open", icon: <Icon.Play size={14} />, onClick: () => onAction("open", item), hidden: !isMedia },
          { label: "Download", icon: <Icon.Download size={16} />, onClick: () => onAction("download", item) },
          { label: "Delete", icon: <Icon.Trash size={16} />, onClick: () => onAction("delete", item), danger: true },
        ]
    : isFolder
    ? [
        { label: "Open", icon: <Icon.Folder size={16} />, onClick: () => onAction("open", item) },
        { label: "Rename", icon: <Icon.Edit size={16} />, onClick: () => onAction("rename", item) },
        { label: "Move", icon: <Icon.Move size={16} />, onClick: () => onAction("move", item) },
        {
          label: item.locked ? "Change / remove password" : "Protect with password",
          icon: item.locked ? <Icon.Unlock size={16} /> : <Icon.Lock size={16} />,
          onClick: () => onAction(item.locked ? "removeLock" : "lock", item),
        },
        { label: "Delete", icon: <Icon.Trash size={16} />, onClick: () => onAction("delete", item), danger: true },
      ]
    : [
        { label: "Open", icon: <Icon.Play size={14} />, onClick: () => onAction("open", item), hidden: !isMedia },
        { label: "Download", icon: <Icon.Download size={16} />, onClick: () => onAction("download", item) },
        {
          label: item.favorite ? "Unfavorite" : "Favorite",
          icon: <Icon.Star size={16} />,
          onClick: () => onAction("favorite", item),
        },
        { label: "Edit tags", icon: <Icon.Tag size={16} />, onClick: () => onAction("tags", item) },
        { label: "Rename", icon: <Icon.Edit size={16} />, onClick: () => onAction("rename", item) },
        { label: "Move", icon: <Icon.Move size={16} />, onClick: () => onAction("move", item) },
        { label: "Delete", icon: <Icon.Trash size={16} />, onClick: () => onAction("delete", item), danger: true },
      ];

  // --------------------------------- list --------------------------------- //
  if (view === "list") {
    return (
      <div
        className="interactive group flex cursor-pointer items-center gap-3 rounded-xl border border-transparent px-2.5 py-2 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-[var(--border)] hover:bg-[var(--surface)]"
        onClick={() => onAction("open", item)}
      >
        <div className="h-11 w-11 shrink-0">
          {isFolder ? (
            <div className="flex h-full w-full items-center justify-center rounded-lg bg-[var(--surface-raised)] text-[var(--foreground)]">
              <Icon.Folder size={22} />
            </div>
          ) : (
            <MediaThumb itemKey={item.key} type={item.type} shareId={shareId} className="h-full w-full" rounded="rounded-lg" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-medium text-[var(--foreground)]">{item.name}</p>
            {item.locked && <Icon.Lock size={13} className="shrink-0 text-muted-foreground" />}
            {item.favorite && <Icon.StarFill size={12} className="shrink-0 text-[var(--warn)]" />}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {isFolder ? "Folder" : `${item.type} · ${formatBytes(item.size)}`}
            {item.last_modified ? ` · ${relativeTime(item.last_modified)}` : ""}
          </p>
        </div>
        <div className="opacity-0 transition-opacity group-hover:opacity-100">
          <CardMenu items={menu} />
        </div>
      </div>
    );
  }

  // --------------------------------- grid --------------------------------- //
  return (
    <div
      className="glow-card interactive group relative cursor-pointer overflow-hidden transition-[transform,border-color] duration-200 ease-out hover:-translate-y-1 hover:border-[var(--border-hover)]"
      onClick={() => onAction("open", item)}
    >
      <div className="absolute right-2 top-2 z-10 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <div className="rounded-lg bg-[var(--surface)]/80 backdrop-blur-sm">
          <CardMenu items={menu} />
        </div>
      </div>

      {!isFolder && !isShared && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAction("favorite", item);
          }}
          className="absolute left-2 top-2 z-10 rounded-lg p-1.5 text-white transition-transform hover:scale-110"
          style={{ background: "rgba(0,0,0,0.32)", backdropFilter: "blur(4px)" }}
          aria-label="Favorite"
        >
          {item.favorite ? (
            <Icon.StarFill size={15} className="text-[var(--warn)]" />
          ) : (
            <Icon.Star size={15} />
          )}
        </button>
      )}

      <div className="aspect-square w-full">
        {isFolder ? (
          <div
            className="flex h-full w-full flex-col items-center justify-center gap-2"
            style={{ background: "var(--surface-raised)" }}
          >
            <span className="text-[var(--foreground)] transition-transform duration-300 group-hover:scale-110">
              <Icon.Folder size={48} />
            </span>
            {item.locked && (
              <span className="chip" style={{ background: "var(--surface)", color: "var(--muted-foreground)" }}>
                <Icon.Lock size={12} /> Protected
              </span>
            )}
          </div>
        ) : (
          <MediaThumb itemKey={item.key} type={item.type} shareId={shareId} className="h-full w-full" rounded="rounded-none" />
        )}
      </div>

      <div className="flex items-center gap-1.5 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--foreground)]">{item.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {isFolder ? "Folder" : `${formatBytes(item.size)}`}
          </p>
        </div>
        {item.locked && <Icon.Lock size={13} className="shrink-0 text-muted-foreground" />}
      </div>
    </div>
  );
}
