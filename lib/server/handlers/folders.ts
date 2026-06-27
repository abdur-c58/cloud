import * as db from "../db";
import {
  createFolderToken,
  hashPassword,
  requireUser,
  unlockedFolders,
  verifyPassword,
  ApiError,
} from "../security";
import { stripUserRoot, toStoragePrefix } from "../user-scope";

export async function handleLocked(req: Request) {
  const user = await requireUser(req);
  const folders = await db.listLockedFolders(user.userId);
  return { folders: folders.map((f) => stripUserRoot(user.userId, f)) };
}

export async function handleLock(req: Request) {
  const user = await requireUser(req);
  const body = await req.json();
  const folder = toStoragePrefix(user.userId, body.folder || "");
  if (folder === toStoragePrefix(user.userId, "")) {
    throw new ApiError(400, "Choose a folder to protect.");
  }
  await db.setFolderLock(user.userId, folder, hashPassword(body.password));
  return { folder: stripUserRoot(user.userId, folder), locked: true };
}

export async function handleUnlock(req: Request) {
  const user = await requireUser(req);
  const body = await req.json();
  const folder = toStoragePrefix(user.userId, body.folder || "");
  const stored = await db.getFolderLock(user.userId, folder);
  if (!stored) throw new ApiError(404, "Folder is not protected.");
  if (!verifyPassword(body.password, stored)) throw new ApiError(401, "Incorrect folder password.");
  const folders = [...(await unlockedFolders(body.current_token ?? null, user.userId)), folder];
  const { token, expiresAt } = await createFolderToken(user.userId, folders);
  return { token, expires_at: expiresAt };
}

export async function handleRemoveLock(req: Request) {
  const user = await requireUser(req);
  const body = await req.json();
  const folder = toStoragePrefix(user.userId, body.folder || "");
  const stored = await db.getFolderLock(user.userId, folder);
  if (!stored) throw new ApiError(404, "Folder is not protected.");
  if (!verifyPassword(body.password, stored)) throw new ApiError(401, "Incorrect folder password.");
  await db.removeFolderLock(user.userId, folder);
  return { folder: stripUserRoot(user.userId, folder), locked: false };
}
