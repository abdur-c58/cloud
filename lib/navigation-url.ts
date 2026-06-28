import type { NavKey } from "@/components/Sidebar";
import type { SharedFolderInfo } from "@/lib/types";

const NAV_KEYS = new Set<NavKey>(["library", "image", "video", "audio", "favorites"]);

export type AppLocation = {
  nav: NavKey;
  prefix: string;
  shareId: string | null;
};

export function parseNav(value: string | null): NavKey {
  if (value && NAV_KEYS.has(value as NavKey)) return value as NavKey;
  return "library";
}

export function decodePath(value: string | null): string {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function encodePath(prefix: string): string {
  return encodeURIComponent(prefix);
}

export function locationFromSearchParams(
  params: URLSearchParams,
  sharedFolders: SharedFolderInfo[],
): AppLocation {
  const shareId = params.get("share")?.trim() || null;
  const path = decodePath(params.get("path"));

  if (shareId) {
    const share = sharedFolders.find((s) => s.id === shareId);
    if (share) {
      return { nav: "library", prefix: path, shareId: share.id };
    }
    return { nav: "library", prefix: "", shareId: null };
  }

  const nav = parseNav(params.get("view"));
  return { nav, prefix: nav === "library" ? path : "", shareId: null };
}

export function searchParamsFromLocation(loc: AppLocation): string {
  const params = new URLSearchParams();

  if (loc.shareId) {
    params.set("share", loc.shareId);
    if (loc.prefix) params.set("path", encodePath(loc.prefix));
    return params.toString();
  }

  if (loc.nav !== "library") params.set("view", loc.nav);
  else if (loc.prefix) params.set("path", encodePath(loc.prefix));

  return params.toString();
}

export function resolveShare(
  shareId: string | null,
  sharedFolders: SharedFolderInfo[],
): SharedFolderInfo | null {
  if (!shareId) return null;
  return sharedFolders.find((s) => s.id === shareId) ?? null;
}

export function locationsMatch(a: AppLocation, b: AppLocation): boolean {
  return a.nav === b.nav && a.prefix === b.prefix && a.shareId === b.shareId;
}

export function currentLocation(
  nav: NavKey,
  prefix: string,
  activeShare: SharedFolderInfo | null,
): AppLocation {
  return {
    nav,
    prefix,
    shareId: activeShare?.id ?? null,
  };
}
