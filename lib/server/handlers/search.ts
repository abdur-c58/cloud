import * as db from "../db";
import { lockingAncestor, folderTokenFromRequest } from "../locks";
import { classify, contentTypeFor, extOf } from "../media";
import * as r2 from "../r2";
import { requireUser, unlockedFolders } from "../security";
import { assertOwned, stripUserRoot, userRoot } from "../user-scope";
import { visualIndexImage, visualIndexPending } from "../visual-index";

export async function handleReindex(req: Request) {
  const user = await requireUser(req);
  const prefix = userRoot(user.userId);
  const objects = await r2.listAll(prefix);
  let count = 0;
  for (const obj of objects) {
    const name = obj.key.split("/").pop() || "";
    await db.upsertItem(user.userId, {
      key: obj.key,
      name,
      folder: r2.folderOf(obj.key),
      type: classify(name),
      ext: extOf(name),
      size: obj.size,
      content_type: contentTypeFor(name),
      last_modified: obj.last_modified,
    });
    count++;
  }
  await db.resetStuckVisualIndexAttempts(user.userId);
  const visual = await visualIndexPending(user.userId);
  return { indexed: count, ...visual };
}

async function visible(userId: string, rows: db.DbItem[], folderToken: string | null) {
  const unlocked = await unlockedFolders(folderToken, userId);
  const locked = await db.listLockedFolders(userId);
  const out = [];
  for (const r of rows) {
    const gate = lockingAncestor(r.key, locked);
    if (gate && !unlocked.has(gate)) continue;
    out.push({
      key: stripUserRoot(userId, r.key),
      name: r.name,
      folder: stripUserRoot(userId, r.folder),
      type: r.type,
      ext: r.ext,
      size: r.size,
      last_modified: r.last_modified,
      favorite: Boolean(r.favorite),
      tags: r.tags ? r.tags.split(",").filter(Boolean) : [],
      caption: r.caption,
      visual_tags: r.visual_tags
        ? r.visual_tags
            .split(",")
            .filter(Boolean)
            .filter((t) => t !== db.VISUAL_INDEX_UNREADABLE)
        : [],
    });
  }
  return out;
}

export async function handleSearch(req: Request) {
  const user = await requireUser(req);
  const ft = folderTokenFromRequest(req);
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const type = searchParams.get("type");
  const favorites = searchParams.get("favorites") === "true";
  const limit = parseInt(searchParams.get("limit") || "200", 10);
  const types = type ? type.split(",").filter(Boolean) : undefined;
  const rows = await db.searchItems(user.userId, {
    query: q,
    types,
    favoritesOnly: favorites,
    limit,
  });
  return { items: await visible(user.userId, rows, ft) };
}

export async function handleSummary(req: Request) {
  const user = await requireUser(req);
  await db.repairMissingItemSizes(user.userId);
  return db.indexSummary(user.userId);
}

export async function handleSetTags(req: Request) {
  const user = await requireUser(req);
  const body = await req.json();
  const storageKey = assertOwned(user.userId, body.key);
  const cleaned = [...new Set((body.tags as string[]).map((t) => t.trim().toLowerCase()).filter(Boolean))].sort().join(",");
  await db.setTags(user.userId, storageKey, cleaned);
  return { ok: true, tags: cleaned ? cleaned.split(",") : [] };
}
