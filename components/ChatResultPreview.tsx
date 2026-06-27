"use client";

import type { ChatReply } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MediaThumb } from "./MediaThumb";
import { Icon } from "./Icons";

type Result = ChatReply["results"][number];

export function ChatResultPreview({
  result,
  onOpen,
}: {
  result: Result;
  onOpen: () => void;
}) {
  const isVisual = result.type === "image" || result.type === "video";

  if (isVisual) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "group overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]",
          "transition-all duration-150 hover:border-[var(--border-hover)] hover:opacity-95",
        )}
        title={result.name}
      >
        <MediaThumb
          itemKey={result.key}
          type={result.type}
          className="h-[88px] w-[88px] sm:h-[96px] sm:w-[96px]"
          rounded="rounded-none"
          objectFit="contain"
        />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex max-w-full items-center gap-2 rounded-lg bg-[var(--surface)] px-2.5 py-1.5 text-left text-xs transition-all duration-150 hover:bg-[var(--card-hover)]"
    >
      <span className="text-[var(--foreground)]">
        <Icon.Audio size={15} />
      </span>
      <span className="truncate text-[var(--foreground)]">{result.name}</span>
    </button>
  );
}
