"use client";

import { useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function DropTarget({
  label,
  disabled,
  onDrop,
  className,
  children,
}: {
  label: string;
  disabled?: boolean;
  onDrop: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const [over, setOver] = useState(false);
  const active = over && !disabled;

  return (
    <Tooltip open={active}>
      <TooltipTrigger
        render={
          <div
            className={cn(
              className,
              active &&
                "ring-2 ring-[var(--foreground)] ring-offset-2 ring-offset-[var(--background)] bg-[var(--surface-raised)]/80",
            )}
            onDragEnter={(e) => {
              if (disabled) return;
              e.preventDefault();
              e.stopPropagation();
              setOver(true);
            }}
            onDragOver={(e) => {
              if (disabled) return;
              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = "move";
              setOver(true);
            }}
            onDragLeave={(e) => {
              e.stopPropagation();
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOver(false);
              if (disabled) return;
              onDrop();
            }}
          >
            {children}
          </div>
        }
      />
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}
