import * as db from "../db";
import { ensureUnlocked, folderTokenFromRequest } from "../locks";
import { classify, contentTypeFor, extOf, isMedia } from "../media";
import * as r2 from "../r2";
import { requireUser } from "../security";
import {
  assertOwned,
  exposeListing,
  stripUserRoot,
  toStoragePrefix,
} from "../user-scope";
import { visualIndexImage } from "../visual-index";

async function decorate(userId: string, items: Array<Record<string, unknown>>) {
  const locked = new Set(await db.listLockedFolders(userId));
  for (const it of items) {
    const storageKey = toStoragePrefix(userId, String(it.key));
    if (it.type === "folder") {
      it.locked = locked.has(storageKey);
    } else {
      const row = await db.getItem(userId, storageKey);
      it.favorite = Boolean(row?.favorite);
      it.tags = row?.tags ? row.tags.split(",").filter(Boolean) : [];
    }
  }
  return items;
}

export async function handleList(req: Request) {
  const user = await requireUser(req);
  const ft = folderTokenFromRequest(req);
  const { searchParams } = new URL(req.url);
  const prefix = searchParams.get("prefix") || "";
  const storagePrefix = toStoragePrefix(user.userId, prefix);
  await ensureUnlocked(storagePrefix, ft, user.userId);
  const result = await r2.listDir(storagePrefix);
  const exposed = exposeListing(result, user.userId);
  exposed.folders = (await decorate(user.userId, exposed.folders as Array<Record<string, unknown>>)) as typeof exposed.folders;
  exposed.files = (await decorate(user.userId, exposed.files as Array<Record<string, unknown>>)) as typeof exposed.files;
  return exposed;
}

export async function handleCreateFolder(req: Request) {
  const user = await requireUser(req);
  const body = await req.json();
  const storagePrefix = toStoragePrefix(user.userId, body.prefix || "");
  const key = await r2.createFolder(storagePrefix, body.name);
  return { key: stripUserRoot(user.userId, key) };
}

export async function handleUploadUrl(req: Request) {
  const user = await requireUser(req);
  const ft = folderTokenFromRequest(req);
  const body = await req.json();
  const prefix = toStoragePrefix(user.userId, body.prefix || "");
  await ensureUnlocked(prefix, ft, user.userId);
  const finalName =
    typeof body.relative_path === "string" && body.relative_path.trim()
      ? r2.sanitizeRelativePath(body.relative_path)
      : r2.sanitizeSegment(body.name);
  if (!isMedia(finalName.split("/").pop() || finalName)) {
    throw new r2.StorageError("Unsupported file type. Allowed: images, video and audio formats.");
  }
  const key = `${prefix}${finalName}`;
  const content_type = body.content_type || contentTypeFor(finalName);
  const url = await r2.presignPut(key);
  return { key: stripUserRoot(user.userId, key), url, content_type };
}

export async function handleUpload(req: Request) {
  const user = await requireUser(req);
  const ft = folderTokenFromRequest(req);
  const form = await req.formData();
  const prefix = String(form.get("prefix") || "");
  const relativePath = String(form.get("relative_path") || "");
  const file = form.get("file");
  if (!(file instanceof File)) throw new r2.StorageError("No file provided.");
  const storagePrefix = toStoragePrefix(user.userId, prefix);
  await ensureUnlocked(storagePrefix, ft, user.userId);
  const fileName = relativePath
    ? r2.sanitizeRelativePath(relativePath)
    : r2.sanitizeSegment(file.name || "upload");
  if (!isMedia(fileName.split("/").pop() || fileName)) {
    throw new r2.StorageError("Unsupported file type. Allowed: images, video and audio formats.");
  }
  const key = `${storagePrefix}${fileName}`;
  const name = fileName.split("/").pop() || fileName;
  const content_type = file.type || contentTypeFor(name);
  const buf = Buffer.from(await file.arrayBuffer());
  await r2.putObject(key, buf, content_type);
  await db.upsertItem(user.userId, {
    key,
    name,
    folder: r2.folderOf(key),
    type: classify(name),
    ext: extOf(name),
    size: buf.length,
    content_type,
    last_modified: null,
  });
  if (classify(name) === "image") {
    void visualIndexImage(user.userId, key, buf.length).catch(() => {});
  }
  return { key: stripUserRoot(user.userId, key) };
}

export async function handleIndexOne(req: Request) {
  const user = await requireUser(req);
  const ft = folderTokenFromRequest(req);
  const body = await req.json();
  const key = assertOwned(user.userId, body.key);
  await ensureUnlocked(key, ft, user.userId);
  const meta = await r2.headObject(key);
  if (!meta) throw new r2.StorageError("Upload not found in storage.");
  const name = key.split("/").pop() || "";
  await db.upsertItem(user.userId, {
    key,
    name,
    folder: r2.folderOf(key),
    type: classify(name),
    ext: extOf(name),
    size: meta.size,
    content_type: meta.content_type || contentTypeFor(name),
    last_modified: meta.last_modified,
  });
  let visual: { indexed: boolean; tags: string[] } | undefined;
  if (classify(name) === "image") {
    visual = await visualIndexImage(user.userId, key, meta.size);
  }
  return { ok: true, visual_tags: visual?.tags };
}

export async function handleMediaUrl(req: Request) {
  const user = await requireUser(req);
  const ft = folderTokenFromRequest(req);
  const { searchParams } = new URL(req.url);
  const key = assertOwned(user.userId, searchParams.get("key") || "");
  const download = searchParams.get("download") === "true";
  await ensureUnlocked(key, ft, user.userId);
  return { url: await r2.presignGet(key, download) };
}

export async function handleDelete(req: Request) {
  const user = await requireUser(req);
  const ft = folderTokenFromRequest(req);
  const body = await req.json();
  const storageKey = assertOwned(user.userId, body.key);
  await ensureUnlocked(storageKey, ft, user.userId);
  const deleted = await r2.deleteKey(storageKey);
  if (storageKey.endsWith("/")) {
    await db.deleteItemsUnder(user.userId, storageKey);
    await db.removeFolderLock(user.userId, storageKey);
  } else {
    await db.deleteItem(user.userId, storageKey);
  }
  return { deleted: deleted.map((k) => stripUserRoot(user.userId, k)) };
}

export async function handleMove(req: Request) {
  const user = await requireUser(req);
  const ft = folderTokenFromRequest(req);
  const body = await req.json();
  const src = assertOwned(user.userId, body.source);
  const isFolder = src.endsWith("/");
  const base = isFolder ? src.replace(/\/$/, "").split("/").pop()! : src.split("/").pop()!;
  const name = body.new_name ? r2.sanitizeSegment(body.new_name) : base;
  const destPrefix = toStoragePrefix(user.userId, body.destination_prefix || "");
  const dst = `${destPrefix}${name}${isFolder ? "/" : ""}`;
  await ensureUnlocked(src, ft, user.userId);
  await ensureUnlocked(dst, ft, user.userId);
  const newKey = await r2.moveKey(src, dst);
  if (isFolder) {
    await db.renamePrefix(user.userId, src, newKey);
  } else {
    const old = await db.getItem(user.userId, src);
    await db.deleteItem(user.userId, src);
    await db.upsertItem(user.userId, {
      key: newKey,
      name: newKey.split("/").pop() || "",
      folder: r2.folderOf(newKey),
      type: classify(newKey),
      ext: extOf(newKey),
      size: old?.size ?? null,
      content_type: contentTypeFor(newKey),
      last_modified: old?.last_modified ?? null,
    });
  }
  return { key: stripUserRoot(user.userId, newKey) };
}

export async function handleFavorite(req: Request) {
  const user = await requireUser(req);
  const body = await req.json();
  const storageKey = assertOwned(user.userId, body.key);
  await db.setFavorite(user.userId, storageKey, Boolean(body.favorite));
  return { ok: true };
}
