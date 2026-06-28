"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SharedMemberInfo } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Icon } from "./Icons";

function memberLabel(member: SharedMemberInfo): string {
  return member.name?.trim() || member.email?.trim() || "Member";
}

function memberTooltip(member: SharedMemberInfo): string {
  const label = memberLabel(member);
  return member.role === "owner" ? `${label} (Host)` : label;
}

function resolveImage(member: SharedMemberInfo, sessionUserId?: string, sessionImage?: string | null) {
  if (member.image) return member.image;
  if (sessionUserId && member.user_id === sessionUserId && sessionImage) return sessionImage;
  return null;
}

function MemberAvatar({ member }: { member: SharedMemberInfo }) {
  const { data: session } = useSession();
  const [failed, setFailed] = useState(false);
  const label = memberLabel(member);
  const initial = (label[0] || "M").toUpperCase();
  const image = resolveImage(member, session?.user?.id, session?.user?.image);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              "relative inline-flex h-8 w-8 shrink-0 overflow-hidden rounded-full border-2 border-[var(--surface)] bg-[var(--surface-raised)] ring-1 ring-[var(--border)]",
              member.role === "owner" && "ring-[var(--foreground)]/30",
            )}
          >
            {image && !failed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image}
                alt={label}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
                onError={() => setFailed(true)}
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-[11px] font-semibold text-[var(--foreground)]">
                {initial}
              </span>
            )}
          </span>
        }
      />
      <TooltipContent side="bottom">{memberTooltip(member)}</TooltipContent>
    </Tooltip>
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
  const { data: session } = useSession();

  const displayMembers = useMemo(
    () =>
      members.map((member) => ({
        ...member,
        image: resolveImage(member, session?.user?.id, session?.user?.image) ?? member.image,
      })),
    [members, session?.user?.id, session?.user?.image],
  );

  if (displayMembers.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center">
        {displayMembers.map((member, i) => (
          <span key={member.user_id} className={cn(i > 0 && "-ml-2.5")} style={{ zIndex: displayMembers.length - i }}>
            <MemberAvatar member={member} />
          </span>
        ))}
      </div>
      {!isOwner && (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={onLeave}
                className="btn btn-ghost flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:text-[var(--foreground)]"
              >
                <Icon.Logout size={14} />
                <span className="hidden sm:inline">Leave</span>
              </button>
            }
          />
          <TooltipContent side="bottom">Leave shared folder</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
