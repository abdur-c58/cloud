"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { formatBytes, relativeTime } from "@/lib/format";
import type { DragItemPayload } from "@/lib/dnd";
import { DND_MIME } from "@/lib/dnd";
import type { StorageItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DropTarget } from "./DropTarget";
import { Icon } from "./Icons";
import { MediaThumb } from "./MediaThumb";

export type CardAction =
  | "open"
  | "favorite"
  | "download"
  | "rename"
  | "move"
  | "copy"
  | "duplicate"
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
  disabled?: boolean;
  separatorBefore?: boolean;
};

function buildMenu(
  item: StorageItem,
  isShared: boolean,
  isFolder: boolean,
  isMedia: boolean,
  onAction: (action: CardAction, item: StorageItem) => void,
): MenuEntry[] {
  if (isShared) {
    return isFolder
      ? [
          { label: "Open", icon: <Icon.Folder size={16} />, onClick: () => onAction("open", item) },
          { label: "Duplicate", icon: <Icon.Copy size={16} />, onClick: () => onAction("duplicate", item) },
          { label: "Copy", icon: <Icon.Copy size={16} />, onClick: () => onAction("copy", item) },
          {
            label: "Delete",
            icon: <Icon.Trash size={16} />,
            onClick: () => onAction("delete", item),
            danger: true,
            separatorBefore: true,
          },
        ]
      : [
          { label: "Open", icon: <Icon.Play size={14} />, onClick: () => onAction("open", item), hidden: !isMedia },
          { label: "Download", icon: <Icon.Download size={16} />, onClick: () => onAction("download", item) },
          { label: "Duplicate", icon: <Icon.Copy size={16} />, onClick: () => onAction("duplicate", item) },
          { label: "Copy", icon: <Icon.Copy size={16} />, onClick: () => onAction("copy", item) },
          {
            label: "Delete",
            icon: <Icon.Trash size={16} />,
            onClick: () => onAction("delete", item),
            danger: true,
            separatorBefore: true,
          },
        ];
  }

  if (isFolder) {
    return [
      { label: "Open", icon: <Icon.Folder size={16} />, onClick: () => onAction("open", item) },
      { label: "Duplicate", icon: <Icon.Copy size={16} />, onClick: () => onAction("duplicate", item) },
      { label: "Copy", icon: <Icon.Copy size={16} />, onClick: () => onAction("copy", item) },
      { label: "Rename", icon: <Icon.Edit size={16} />, onClick: () => onAction("rename", item) },
      { label: "Move", icon: <Icon.Move size={16} />, onClick: () => onAction("move", item) },
      {
        label: item.locked ? "Change / remove password" : "Protect with password",
        icon: item.locked ? <Icon.Unlock size={16} /> : <Icon.Lock size={16} />,
        onClick: () => onAction(item.locked ? "removeLock" : "lock", item),
      },
      {
        label: "Delete",
        icon: <Icon.Trash size={16} />,
        onClick: () => onAction("delete", item),
        danger: true,
        separatorBefore: true,
      },
    ];
  }

  return [
    { label: "Open", icon: <Icon.Play size={14} />, onClick: () => onAction("open", item), hidden: !isMedia },
    { label: "Download", icon: <Icon.Download size={16} />, onClick: () => onAction("download", item) },
    {
      label: item.favorite ? "Unfavorite" : "Favorite",
      icon: <Icon.Star size={16} />,
      onClick: () => onAction("favorite", item),
    },
    { label: "Edit tags", icon: <Icon.Tag size={16} />, onClick: () => onAction("tags", item) },
    { label: "Duplicate", icon: <Icon.Copy size={16} />, onClick: () => onAction("duplicate", item) },
    { label: "Copy", icon: <Icon.Copy size={16} />, onClick: () => onAction("copy", item) },
    { label: "Rename", icon: <Icon.Edit size={16} />, onClick: () => onAction("rename", item) },
    { label: "Move", icon: <Icon.Move size={16} />, onClick: () => onAction("move", item) },
    {
      label: "Delete",
      icon: <Icon.Trash size={16} />,
      onClick: () => onAction("delete", item),
      danger: true,
      separatorBefore: true,
    },
  ];
}

const ctxItemClass =
  "relative flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-hidden select-none transition-colors duration-150 ease-out hover:bg-[#222222] hover:text-[var(--foreground)] focus:bg-[#222222] focus:text-[var(--foreground)] data-highlighted:bg-[#222222] data-highlighted:text-[var(--foreground)] data-disabled:pointer-events-none data-disabled:cursor-not-allowed data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

function MenuItems({
  items,
  variant,
}: {
  items: MenuEntry[];
  variant: "dropdown" | "context";
}) {
  const visible = items.filter((i) => !i.hidden);
  const Item = variant === "dropdown" ? DropdownMenuItem : ContextMenuItem;
  const Separator = variant === "dropdown" ? DropdownMenuSeparator : ContextMenuSeparator;

  return visible.map((item) => (
    <span key={item.label} className="contents">
      {item.separatorBefore && <Separator className="my-1 bg-[var(--border)]" />}
      <Item
        variant={item.danger ? "destructive" : "default"}
        disabled={item.disabled}
        onClick={item.onClick}
        className={variant === "context" ? ctxItemClass : undefined}
      >
        {item.icon && <span className="shrink-0 opacity-80">{item.icon}</span>}
        {item.label}
      </Item>
    </span>
  ));
}

function CardMenu({ items, align = "end" }: { items: MenuEntry[]; align?: "start" | "end" }) {
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
        <MenuItems items={items} variant="dropdown" />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CardContextMenu({ items, children }: { items: MenuEntry[]; children: React.ReactNode }) {
  return (
    <ContextMenu>
      <ContextMenuTrigger render={<div className="contents">{children}</div>} />
      <ContextMenuContent
        align="start"
        className="min-w-[180px] border border-[var(--border)] bg-[var(--surface-raised)] p-1.5 text-popover-foreground shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        <MenuItems items={items} variant="context" />
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function FileCard({
  item,
  view,
  onAction,
  variant = "personal",
  shareId,
  draggable = false,
  dragPayload,
  onDragStart,
  onDragEnd,
  drop,
}: {
  item: StorageItem;
  view: "grid" | "list";
  onAction: (action: CardAction, item: StorageItem) => void;
  variant?: "personal" | "shared";
  shareId?: string;
  draggable?: boolean;
  dragPayload?: DragItemPayload;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  drop?: { label: string; disabled?: boolean; onDrop: () => void };
}) {
  const isShared = variant === "shared";
  const isFolder = item.type === "folder";
  const isMedia = item.type === "image" || item.type === "video" || item.type === "audio";
  const menu = buildMenu(item, isShared, isFolder, isMedia, onAction);

  const dragProps = draggable && dragPayload
    ? {
        draggable: true,
        onDragStart: (e: React.DragEvent) => {
          e.dataTransfer.setData(DND_MIME, JSON.stringify(dragPayload));
          e.dataTransfer.effectAllowed = "move";
          onDragStart?.();
        },
        onDragEnd: () => onDragEnd?.(),
      }
    : {};

  const wrapDrop = (node: React.ReactNode, className?: string) =>
    isFolder && drop ? (
      <DropTarget
        label={drop.label}
        disabled={drop.disabled}
        onDrop={drop.onDrop}
        className={cn("rounded-xl", className)}
      >
        {node}
      </DropTarget>
    ) : (
      node
    );

  const wrapContext = (node: React.ReactNode) => (
    <CardContextMenu items={menu}>{node}</CardContextMenu>
  );

  if (view === "list") {
    return wrapDrop(
      wrapContext(
        <div
          className={cn(
            "interactive group flex cursor-pointer items-center gap-3 rounded-xl border border-transparent px-2.5 py-2 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-[var(--border)] hover:bg-[var(--surface)]",
            draggable && "cursor-grab active:cursor-grabbing",
          )}
          onClick={() => onAction("open", item)}
          {...dragProps}
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
        </div>,
      ),
    );
  }

  return wrapDrop(
    wrapContext(
      <div
        className={cn(
          "glow-card interactive group relative cursor-pointer overflow-hidden transition-[transform,border-color] duration-200 ease-out hover:-translate-y-1 hover:border-[var(--border-hover)]",
          draggable && "cursor-grab active:cursor-grabbing",
        )}
        onClick={() => onAction("open", item)}
        {...dragProps}
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
      </div>,
    ),
    "overflow-hidden rounded-[var(--radius)]",
  );
}
