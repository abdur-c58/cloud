"use client";

import { useEffect } from "react";
import { Icon } from "./Icons";

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = "max-w-md",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 animate-fade-in"
      style={{ background: "rgba(8,9,13,0.55)", backdropFilter: "blur(4px)" }}
      onMouseDown={onClose}
    >
      <div
        className={`glow-card w-full ${width} animate-pop-in p-5`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--foreground)]">{title}</h2>
            <button onClick={onClose} className="btn-ghost rounded-lg p-1.5" aria-label="Close">
              <Icon.X size={18} />
            </button>
          </div>
        )}
        <div>{children}</div>
        {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
