"use client";

import { useEffect, useRef, useState } from "react";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import type { ItemType } from "@/lib/types";
import { Icon } from "./Icons";

const typeIcon: Record<string, React.ReactNode> = {
  image: <Icon.Image size={26} />,
  video: <Icon.Video size={26} />,
  audio: <Icon.Audio size={26} />,
  other: <Icon.File size={26} />,
};

export function MediaThumb({
  itemKey,
  type,
  className = "",
  rounded = "rounded-xl",
  shareId,
}: {
  itemKey: string;
  type: ItemType;
  className?: string;
  rounded?: string;
  shareId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || (type !== "image" && type !== "video")) return;
    let active = true;
    resolveMediaUrl(itemKey, false, shareId)
      .then((u) => active && setUrl(u))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [visible, itemKey, type, shareId]);

  const showMedia = (type === "image" || type === "video") && url && !failed;

  return (
    <div
      ref={ref}
      className={`relative flex items-center justify-center overflow-hidden ${rounded} ${className}`}
      style={{ background: showMedia ? "var(--surface-raised)" : "var(--surface-raised)" }}
    >
      {showMedia && type === "image" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      )}
      {showMedia && type === "video" && (
        <>
          <video
            src={`${url}#t=0.1`}
            preload="metadata"
            muted
            playsInline
            onError={() => setFailed(true)}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <span className="absolute flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-transform duration-300 group-hover:scale-110">
            <Icon.Play size={18} />
          </span>
        </>
      )}
      {!showMedia && (
        <span className="text-muted-foreground">
          {type === "video" && (
            <span className="absolute right-2 top-2 rounded-md bg-black/30 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              VIDEO
            </span>
          )}
          {typeIcon[type] || typeIcon.other}
        </span>
      )}
    </div>
  );
}
