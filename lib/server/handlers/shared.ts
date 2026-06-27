import { randomBytes } from "crypto";
import * as db from "../db";
import { nextDuplicateName } from "../../duplicate-name";
import { classify, contentTypeFor, extOf, isMedia } from "../media";
import * as r2 from "../r2";
import { ApiError, requireUser } from "../security";
import {
  assertSharedKey,
  exposeSharedListing,
  sharedRoot,
  stripSharedRoot,
  toSharedPrefix,
} from "../share-scope";
import { assertOwned, stripUserRoot, toStoragePrefix } from "../user-scope";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateShareId(): string {
  return `sh_${randomBytes(8).toString("hex")}`;
}

function generateJoinCode(): string {
  let code = "";
  const bytes = randomBytes(8);
  for (let i = 0; i < 8; i++) code += CODE_CHARS[bytes[i]! % CODE_CHARS.length];
  return code;
}

async function requireMember(shareId: string, userId: string) {
  const member = await db.getSharedMembership(shareId, userId);
  if (!member) throw new ApiError(403, "You are not a member of this shared folder.");
  return member;
}

async function requireOwner(shareId: string, userId: string) {
  const member = await requireMember(shareId, userId);
  if (member.role !== "owner") throw new ApiError(403, "Only the owner can do this.");
  return member;
}

async function indexSharedFile(
  shareId: string,
  key: string,
  importedBy: string,
  importedFrom: string | null,
  size: number | null = null,
) {
  const name = key.split("/").pop() || "";
  await db.upsertSharedItem(shareId, {
    key,
    name,
    folder: r2.folderOf(key),
    type: classify(name),
    ext: extOf(name),
    size,
    content_type: contentTypeFor(name),
    last_modified: new Date().toISOString(),
    imported_from: importedFrom,
    imported_by: importedBy,
  });
}

export async function handleListShared(_req: Request) {
  const user = await requireUser(_req);
  const folders = await db.listSharedFoldersForUser(user.userId);
  return {
    folders: folders.map((f) => ({
      id: f.id,
      name: f.name,
      role: f.role,
      member_count: f.member_count,
      created_at: f.created_at,
      is_owner: f.role === "owner",
    })),
  };
}

export async function handleCreateShared(req: Request) {
  const user = await requireUser(req);
  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) throw new ApiError(400, "Name is required.");
  const id = generateShareId();
  const root = sharedRoot(id);
  await r2.createFolder("shared/", id);
  const folder = await db.createSharedFolder(id, user.userId, name, root);
  const code = generateJoinCode();
  await db.createJoinCode(code, id, user.userId);
  return { folder: { id: folder.id, name: folder.name, role: "owner" }, code };
}

export async function handleJoinShared(req: Request) {
  const user = await requireUser(req);
  const body = await req.json();
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!code) throw new ApiError(400, "Join code is required.");
  const row = await db.getJoinCode(code);
  if (!row || row.revoked) throw new ApiError(404, "Invalid or expired join code.");
  const existing = await db.getSharedMembership(row.share_id, user.userId);
  if (existing) {
    const folder = await db.getSharedFolder(row.share_id);
    return { folder: { id: folder!.id, name: folder!.name, role: existing.role }, already_member: true };
  }
  await db.addSharedMember(row.share_id, user.userId, "member", code);
  await db.incrementJoinCodeUse(code);
  const folder = await db.getSharedFolder(row.share_id);
  if (!folder) throw new ApiError(404, "Shared folder not found.");
  return { folder: { id: folder.id, name: folder.name, role: "member" } };
}

export async function handleSharedList(req: Request, shareId: string) {
  const user = await requireUser(req);
  await requireMember(shareId, user.userId);
  const { searchParams } = new URL(req.url);
  const prefix = searchParams.get("prefix") || "";
  const storagePrefix = toSharedPrefix(shareId, prefix);
  const result = await r2.listDir(storagePrefix);
  return exposeSharedListing(result, shareId);
}

export async function handleSharedCreateFolder(req: Request, shareId: string) {
  const user = await requireUser(req);
  await requireMember(shareId, user.userId);
  const body = await req.json();
  const storagePrefix = toSharedPrefix(shareId, body.prefix || "");
  const key = await r2.createFolder(storagePrefix, body.name);
  return { key: stripSharedRoot(shareId, key) };
}

export async function handleSharedUploadUrl(req: Request, shareId: string) {
  const user = await requireUser(req);
  await requireMember(shareId, user.userId);
  const body = await req.json();
  const prefix = toSharedPrefix(shareId, body.prefix || "");
  const finalName =
    typeof body.relative_path === "string" && body.relative_path.trim()
      ? r2.sanitizeRelativePath(body.relative_path)
      : r2.sanitizeSegment(body.name);
  if (!isMedia(finalName.split("/").pop() || finalName)) {
    throw new r2.StorageError("Unsupported file type.");
  }
  const key = `${prefix}${finalName}`;
  const content_type = body.content_type || contentTypeFor(finalName);
  const url = await r2.presignPut(key);
  return { key: stripSharedRoot(shareId, key), url, content_type };
}

export async function handleSharedUpload(req: Request, shareId: string) {
  const user = await requireUser(req);
  await requireMember(shareId, user.userId);
  const form = await req.formData();
  const prefix = String(form.get("prefix") || "");
  const relativePath = String(form.get("relative_path") || "");
  const file = form.get("file");
  if (!(file instanceof File)) throw new r2.StorageError("No file provided.");
  const storagePrefix = toSharedPrefix(shareId, prefix);
  const fileName = relativePath
    ? r2.sanitizeRelativePath(relativePath)
    : r2.sanitizeSegment(file.name || "upload");
  if (!isMedia(fileName.split("/").pop() || fileName)) {
    throw new r2.StorageError("Unsupported file type.");
  }
  const key = `${storagePrefix}${fileName}`;
  const content_type = file.type || contentTypeFor(fileName);
  const buf = Buffer.from(await file.arrayBuffer());
  await r2.putObject(key, buf, content_type);
  await indexSharedFile(shareId, key, user.userId, null, buf.length);
  return { key: stripSharedRoot(shareId, key) };
}

export async function handleSharedIndexOne(req: Request, shareId: string) {
  const user = await requireUser(req);
  await requireMember(shareId, user.userId);
  const body = await req.json();
  const key = assertSharedKey(shareId, body.key);
  const meta = await r2.headObject(key);
  if (!meta) throw new r2.StorageError("Upload not found in storage.");
  await indexSharedFile(shareId, key, user.userId, null, meta.size);
  return { ok: true };
}

export async function handleSharedMediaUrl(req: Request, shareId: string) {
  const user = await requireUser(req);
  await requireMember(shareId, user.userId);
  const { searchParams } = new URL(req.url);
  const key = assertSharedKey(shareId, searchParams.get("key") || "");
  const download = searchParams.get("download") === "true";
  return { url: await r2.presignGet(key, download) };
}

export async function handleSharedDelete(req: Request, shareId: string) {
  const user = await requireUser(req);
  await requireMember(shareId, user.userId);
  const body = await req.json();
  const storageKey = assertSharedKey(shareId, body.key);
  const deleted = await r2.deleteKey(storageKey);
  if (storageKey.endsWith("/")) {
    await db.deleteSharedItemsUnder(shareId, storageKey);
  } else {
    await db.deleteSharedItem(shareId, storageKey);
  }
  return { deleted: deleted.map((k) => stripSharedRoot(shareId, k)) };
}

export async function handleSharedImport(req: Request, shareId: string) {
  const user = await requireUser(req);
  await requireMember(shareId, user.userId);
  const body = await req.json();
  const sources: string[] = Array.isArray(body.sources) ? body.sources : [];
  const destPrefix = toSharedPrefix(shareId, body.destination_prefix || "");
  if (!sources.length) throw new ApiError(400, "No sources selected.");

  const imported: string[] = [];
  for (const rel of sources) {
    const trimmed = String(rel).trim();
    if (!trimmed) continue;
    const srcFull = assertOwned(user.userId, trimmed);
    const isFolder = trimmed.endsWith("/");

    if (isFolder) {
      const folderName = trimmed.replace(/\/$/, "").split("/").pop() || "folder";
      const dstRoot = `${destPrefix}${r2.sanitizeSegment(folderName)}/`;
      const copied = await r2.copyTree(srcFull, dstRoot);
      for (const key of copied) {
        if (key.endsWith("/")) continue;
        await indexSharedFile(shareId, key, user.userId, srcFull);
        imported.push(stripSharedRoot(shareId, key));
      }
    } else {
      const baseName = trimmed.split("/").pop() || trimmed;
      const dst = `${destPrefix}${r2.sanitizeSegment(baseName)}`;
      await r2.copyKey(srcFull, dst);
      await indexSharedFile(shareId, dst, user.userId, srcFull);
      imported.push(stripSharedRoot(shareId, dst));
    }
  }
  return { imported };
}

export async function handleSharedMove(req: Request, shareId: string) {
  const user = await requireUser(req);
  await requireMember(shareId, user.userId);
  const body = await req.json();
  const src = assertSharedKey(shareId, body.source);
  const isFolder = src.endsWith("/");
  const base = isFolder ? src.replace(/\/$/, "").split("/").pop()! : src.split("/").pop()!;
  const name = body.new_name ? r2.sanitizeSegment(body.new_name) : base;
  const destPrefix = toSharedPrefix(shareId, body.destination_prefix || "");
  const dst = `${destPrefix}${name}${isFolder ? "/" : ""}`;
  const newKey = await r2.moveKey(src, dst);
  if (isFolder) {
    await db.renameSharedPrefix(shareId, src, newKey);
  } else {
    const old = await db.getSharedItem(shareId, src);
    await db.deleteSharedItem(shareId, src);
    await indexSharedFile(
      shareId,
      newKey,
      user.userId,
      old?.imported_from ?? null,
      old?.size ?? null,
    );
  }
  return { key: stripSharedRoot(shareId, newKey) };
}

function siblingNames(listing: { folders: Array<{ name: string }>; files: Array<{ name: string }> }) {
  return new Set([...listing.folders.map((f) => f.name), ...listing.files.map((f) => f.name)]);
}

export async function handleSharedCopy(req: Request, shareId: string) {
  const user = await requireUser(req);
  await requireMember(shareId, user.userId);
  const body = await req.json();
  const src = assertSharedKey(shareId, body.source);
  const destPrefix = toSharedPrefix(shareId, body.destination_prefix ?? "");
  const isFolder = src.endsWith("/");
  if (isFolder && (destPrefix === src || destPrefix.startsWith(src))) {
    throw new r2.StorageError("Cannot copy a folder into itself.");
  }

  const listing = await r2.listDir(destPrefix);
  const existing = siblingNames(listing);
  const srcName = isFolder ? src.replace(/\/$/, "").split("/").pop()! : src.split("/").pop()!;
  const newName = body.new_name
    ? r2.sanitizeSegment(body.new_name)
    : nextDuplicateName(srcName, existing, isFolder);

  if (isFolder) {
    const dst = `${destPrefix}${r2.sanitizeSegment(newName)}/`;
    const copied = await r2.copyTree(src, dst);
    const srcNorm = src.endsWith("/") ? src : `${src}/`;
    const dstNorm = dst;
    for (const key of copied) {
      if (key.endsWith("/")) continue;
      const rel = key.slice(dstNorm.length);
      const srcKey = `${srcNorm}${rel}`;
      const old = await db.getSharedItem(shareId, srcKey);
      const meta = await r2.headObject(key);
      await indexSharedFile(
        shareId,
        key,
        user.userId,
        old?.imported_from ?? null,
        meta?.size ?? null,
      );
    }
    return { key: stripSharedRoot(shareId, dst), name: newName };
  }

  const dst = `${destPrefix}${r2.sanitizeSegment(newName)}`;
  await r2.copyKey(src, dst);
  const old = await db.getSharedItem(shareId, src);
  const meta = await r2.headObject(dst);
  await indexSharedFile(shareId, dst, user.userId, old?.imported_from ?? null, meta?.size ?? null);
  return { key: stripSharedRoot(shareId, dst), name: newName };
}

export async function handleSharedMembers(req: Request, shareId: string) {
  const user = await requireUser(req);
  await requireMember(shareId, user.userId);
  const members = await db.listSharedMembers(shareId);
  return {
    members: members.map((m) => ({
      user_id: m.user_id,
      role: m.role,
      joined_at: m.joined_at,
      email: m.email,
      name: m.name,
    })),
  };
}

export async function handleSharedKick(req: Request, shareId: string) {
  const user = await requireUser(req);
  await requireOwner(shareId, user.userId);
  const body = await req.json();
  const targetId = typeof body.user_id === "string" ? body.user_id.trim() : "";
  if (!targetId) throw new ApiError(400, "user_id is required.");
  if (targetId === user.userId) throw new ApiError(400, "You cannot kick yourself.");
  const removed = await db.removeSharedMember(shareId, targetId);
  if (!removed) throw new ApiError(404, "Member not found or cannot be removed.");
  return { ok: true };
}

export async function handleSharedCodes(req: Request, shareId: string) {
  const user = await requireUser(req);
  await requireOwner(shareId, user.userId);
  if (req.method === "GET") {
    const codes = await db.listJoinCodes(shareId);
    return { codes };
  }
  const code = generateJoinCode();
  await db.createJoinCode(code, shareId, user.userId);
  return { code };
}

export async function handleSharedRevokeCode(req: Request, shareId: string, code: string) {
  const user = await requireUser(req);
  await requireOwner(shareId, user.userId);
  const revoked = await db.revokeJoinCode(shareId, code);
  if (!revoked) throw new ApiError(404, "Code not found.");
  return { ok: true };
}

export async function handleDeleteSharedFolder(_req: Request, shareId: string) {
  const user = await requireUser(_req);
  await requireOwner(shareId, user.userId);
  const folder = await db.getSharedFolder(shareId);
  if (!folder) throw new ApiError(404, "Shared folder not found.");
  const root = folder.r2_root.endsWith("/") ? folder.r2_root : `${folder.r2_root}/`;
  await r2.deleteKey(root);
  const deleted = await db.deleteSharedFolder(shareId, user.userId);
  if (!deleted) throw new ApiError(404, "Shared folder not found.");
  return { ok: true };
}

/** Resolve a media key for personal or shared storage. */
export async function resolveMediaKeyForUser(
  userId: string,
  key: string,
  shareId?: string | null,
): Promise<string> {
  if (shareId) {
    await requireMember(shareId, userId);
    return assertSharedKey(shareId, key);
  }
  return assertOwned(userId, key);
}

export { stripUserRoot, stripSharedRoot };
