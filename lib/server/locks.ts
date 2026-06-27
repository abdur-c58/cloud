import * as db from "./db";
import { normalizePrefix } from "./r2";
import { ApiError, unlockedFolders } from "./security";

export function lockingAncestor(path: string, locked?: string[]): string | null {
  const list = locked ?? [];
  const matches = list.filter((f) => path === f || path.startsWith(f));
  if (!matches.length) return null;
  return matches.reduce((a, b) => (a.length >= b.length ? a : b));
}

export async function ensureUnlocked(
  path: string,
  folderToken: string | null,
  userId: string,
): Promise<void> {
  const locked = await db.listLockedFolders(userId);
  const gate = lockingAncestor(path, locked);
  if (!gate) return;
  const unlocked = await unlockedFolders(folderToken, userId);
  if (!unlocked.has(gate)) {
    throw new ApiError(423, { message: "This folder is password protected.", folder: gate });
  }
}

export function folderTokenFromRequest(req: Request): string | null {
  return req.headers.get("x-folder-token");
}

export async function isLockedPrefix(prefix: string, userId: string): Promise<boolean> {
  const locked = await db.listLockedFolders(userId);
  return locked.includes(normalizePrefix(prefix));
}
