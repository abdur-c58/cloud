import { assertSafeKey, normalizePrefix } from "./r2";
import { ApiError } from "./security";

const SHARE_SAFE = /[^a-zA-Z0-9_-]/g;

export function sharedRoot(shareId: string): string {
  const safe = shareId.trim().replace(SHARE_SAFE, "_");
  if (!safe) throw new ApiError(400, "Invalid share id.");
  return `shared/${safe}/`;
}

export function toSharedPrefix(shareId: string, prefix: string): string {
  return sharedRoot(shareId) + normalizePrefix(prefix);
}

export function toSharedKey(shareId: string, key: string): string {
  const root = sharedRoot(shareId);
  const trimmed = (key || "").trim().replace(/^\/+/, "");
  if (trimmed.startsWith("shared/")) {
    if (!trimmed.startsWith(root.slice(0, -1))) throw new ApiError(403, "Access denied.");
    return trimmed.endsWith("/") || !key.endsWith("/") ? trimmed : `${trimmed}/`;
  }
  return root + trimmed;
}

export function stripSharedRoot(shareId: string, key: string): string {
  const root = sharedRoot(shareId);
  return key.startsWith(root) ? key.slice(root.length) : key;
}

export function exposeSharedItem<T extends { key?: string }>(shareId: string, item: T): T {
  if (item.key) return { ...item, key: stripSharedRoot(shareId, item.key) };
  return item;
}

export function exposeSharedListing(
  result: { prefix: string; folders: Array<{ key: string }>; files: Array<{ key: string }> },
  shareId: string,
) {
  const root = sharedRoot(shareId);
  const relativePrefix = result.prefix.startsWith(root) ? result.prefix.slice(root.length) : result.prefix;
  return {
    prefix: relativePrefix,
    folders: result.folders.map((f) => exposeSharedItem(shareId, f)),
    files: result.files.map((f) => exposeSharedItem(shareId, f)),
  };
}

export function assertSharedKey(shareId: string, key: string): string {
  const full = toSharedKey(shareId, key);
  assertSafeKey(full);
  return full;
}
