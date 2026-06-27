import { assertSafeKey, normalizePrefix } from "./r2";
import { ApiError } from "./security";

const USER_SAFE = /[^a-zA-Z0-9._-]/g;

export function userRoot(userId: string): string {
  const safe = userId.trim().replace(USER_SAFE, "_");
  if (!safe) throw new ApiError(400, "Invalid user id.");
  return `users/${safe}/`;
}

export function toStoragePrefix(userId: string, prefix: string): string {
  return userRoot(userId) + normalizePrefix(prefix);
}

export function toStorageKey(userId: string, key: string): string {
  const root = userRoot(userId);
  const trimmed = (key || "").trim().replace(/^\/+/, "");
  if (trimmed.startsWith("users/")) {
    if (!trimmed.startsWith(root)) throw new ApiError(403, "Access denied.");
    return trimmed.endsWith("/") || !key.endsWith("/") ? trimmed : `${trimmed}/`;
  }
  return root + trimmed;
}

export function assertOwned(userId: string, key: string): string {
  const full = toStorageKey(userId, key);
  assertSafeKey(full);
  return full;
}

export function stripUserRoot(userId: string, key: string): string {
  const root = userRoot(userId);
  return key.startsWith(root) ? key.slice(root.length) : key;
}

export function exposeItem<T extends { key?: string }>(userId: string, item: T): T {
  if (item.key) return { ...item, key: stripUserRoot(userId, item.key) };
  return item;
}

export function exposeListing(
  result: { prefix: string; folders: Array<{ key: string }>; files: Array<{ key: string }> },
  userId: string,
) {
  const root = userRoot(userId);
  const relativePrefix = result.prefix.startsWith(root) ? result.prefix.slice(root.length) : result.prefix;
  return {
    prefix: relativePrefix,
    folders: result.folders.map((f) => exposeItem(userId, f)),
    files: result.files.map((f) => exposeItem(userId, f)),
  };
}
