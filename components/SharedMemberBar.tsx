"use client";

import type { SharedMemberInfo } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Icon } from "./Icons";

function MemberAvatar({ member }: { member: SharedMemberInfo }) {
  const label = member.name?.trim() || member.email?.trim() || "Member";
  const initial = (label[0] || "M").toUpperCase();

  return (
    <span
      title={member.role === "owner" ? `${label} (Host)` : label}
      className={cn(
        "relative inline-flex h-8 w-8 shrink-0 overflow-hidden rounded-full border-2 border-[var(--surface)] bg-[var(--surface-raised)] ring-1 ring-[var(--border)]",
        member.role === "owner" && "ring-[var(--foreground)]/30",
      )}
    >
      {member.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={member.image} alt={label} referrerPolicy="no-referrer" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-[11px] font-semibold text-[var(--foreground)]">
          {initial}
        </span>
      )}
    </span>
  );
}

export function SharedMemberBar({
  members,
  isOwner,
  onLeave,
}: {
  members: SharedMemberInfo[];
  isOwner: boolean;
  onLeave: () => void;
}) {
  if (members.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center">
        {members.map((member, i) => (
          <span key={member.user_id} className={cn(i > 0 && "-ml-2.5")} style={{ zIndex: members.length - i }}>
            <MemberAvatar member={member} />
          </span>
        ))}
      </div>
      {!isOwner && (
        <button
          type="button"
          onClick={onLeave}
          className="btn btn-ghost flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:text-[var(--foreground)]"
          title="Leave shared folder"
        >
          <Icon.Logout size={14} />
          <span className="hidden sm:inline">Leave</span>
        </button>
      )}
    </div>
  );
}
