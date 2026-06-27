"use client";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

export type LibraryMenuEntry = {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  separatorBefore?: boolean;
};

const itemClass =
  "relative flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-hidden select-none transition-colors duration-150 ease-out hover:bg-[#222222] hover:text-[var(--foreground)] focus:bg-[#222222] focus:text-[var(--foreground)] data-highlighted:bg-[#222222] data-highlighted:text-[var(--foreground)] data-disabled:pointer-events-none data-disabled:cursor-not-allowed data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

export function LibraryContextMenu({
  items,
  children,
  enabled,
}: {
  items: LibraryMenuEntry[];
  children: React.ReactNode;
  enabled: boolean;
}) {
  if (!enabled) return <>{children}</>;

  return (
    <ContextMenu>
      <ContextMenuTrigger className="block min-h-full min-w-0 flex-1">{children}</ContextMenuTrigger>
      <ContextMenuContent
        align="start"
        className="min-w-[200px] border border-[var(--border)] bg-[var(--surface-raised)] p-1.5 text-popover-foreground shadow-md"
      >
        {items.map((item) => (
          <span key={item.label} className="contents">
            {item.separatorBefore && <ContextMenuSeparator className="my-1 bg-[var(--border)]" />}
            <ContextMenuItem
              disabled={item.disabled}
              onClick={item.onClick}
              className={itemClass}
            >
              {item.icon && <span className="shrink-0 opacity-80">{item.icon}</span>}
              {item.label}
            </ContextMenuItem>
          </span>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}
