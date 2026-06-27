"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const WIGGLE_PX = 2;
const WAVE_DURATION = 3.2;
const SCRAMBLE_CHARS = "!<>-_\\/[]{}—=+*^?#%&@0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const SCRAMBLE_TICK_MS = 36;
const SCRAMBLE_STEPS = 14;

function scrambleFrame(target: string, step: number, total: number): string {
  const reveal = Math.floor((step / total) * target.length);
  return target
    .split("")
    .map((char, i) => {
      if (char === " ") return " ";
      if (i < reveal) return target[i];
      return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
    })
    .join("");
}

function HackLabel({ label, active }: { label: string; active: boolean }) {
  const targetUpper = label.toUpperCase();
  const [text, setText] = useState(active ? targetUpper : label);
  const [glitching, setGlitching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (!active) {
      setGlitching(false);
      setText(label);
      return;
    }

    let step = 0;
    setGlitching(true);
    setText(scrambleFrame(targetUpper, 0, SCRAMBLE_STEPS));

    timerRef.current = setInterval(() => {
      step += 1;
      if (step >= SCRAMBLE_STEPS) {
        setText(targetUpper);
        setGlitching(false);
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        return;
      }
      setText(scrambleFrame(targetUpper, step, SCRAMBLE_STEPS));
    }, SCRAMBLE_TICK_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [active, label, targetUpper]);

  return (
    <motion.span
      className={cn(
        "relative z-[1] font-semibold tabular-nums",
        active ? "text-[11px] uppercase tracking-[0.18em]" : "text-sm font-medium normal-case tracking-normal",
        glitching && "nav-label-glitch",
      )}
      animate={
        glitching
          ? { x: [0, -1, 2, -1, 0], opacity: [1, 0.75, 1, 0.85, 1] }
          : active
            ? { x: 0, opacity: 1 }
            : { x: 0, opacity: 1 }
      }
      transition={glitching ? { duration: 0.45, ease: "linear" } : { duration: 0.2 }}
    >
      {text}
    </motion.span>
  );
}

export function NavTab({
  active,
  label,
  icon,
  onClick,
  index = 0,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  index?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "nav-tab group relative flex w-full items-center gap-3 px-3 py-2.5 text-left",
        active ? "nav-tab--active text-[var(--foreground)]" : "text-muted-foreground hover:text-[var(--foreground)]",
      )}
    >
      <motion.span
        className="relative z-[1] shrink-0"
        animate={
          active
            ? { x: [0, -6, 0], opacity: [1, 0.4, 1], scale: [1, 1, 1.15] }
            : { x: [-WIGGLE_PX, WIGGLE_PX, -WIGGLE_PX], opacity: 1, scale: 1 }
        }
        transition={
          active
            ? { duration: 0.32, times: [0, 0.28, 1], ease: "easeOut" }
            : {
                duration: WAVE_DURATION,
                repeat: Infinity,
                repeatType: "reverse",
                ease: "easeInOut",
                delay: -index * 0.5,
              }
        }
      >
        {icon}
      </motion.span>
      <HackLabel label={label} active={active} />
    </button>
  );
}

export function ViewTab({
  active,
  icon,
  onClick,
  label,
}: {
  active: boolean;
  icon: React.ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn("view-toggle-btn", active && "view-toggle-btn--active")}
    >
      {icon}
    </button>
  );
}
