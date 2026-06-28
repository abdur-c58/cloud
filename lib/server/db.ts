import { Pool } from "pg";
import { getDatabasePoolConfig } from "./database-config";
import { classify, contentTypeFor, extOf } from "./media";
import { expandSearchTerms } from "./query-terms";
import * as r2 from "./r2";
import { ensureDbSchema } from "./schema";

export type DbItem = {
  user_id: string;
  key: string;
  name: string;
  folder: string;
  type: string;
  ext: string | null;
  size: number | null;
  content_type: string | null;
  last_modified: string | null;
  favorite: boolean;
  tags: string;
  caption: string;
  visual_tags: string;
  visual_indexed_at: number | null;
  visual_index_size: number | null;
  indexed_at: number;
};

export type DbChatConversation = {
  id: string;
  user_id: string;
  title: string;
  created_at: number;
  updated_at: number;
};

export type DbChatMessage = {
  id: string;
  conversation_id: string;
  user_id: string;
  role: string;
  content: string;
  results: unknown[] | null;
  created_at: number;
};

let pool: Pool | null = null;

async function getPool(): Promise<Pool> {
  if (!pool) {
    pool = new Pool(getDatabasePoolConfig());
    await ensureDbSchema(pool);
  }
  return pool;
}

export async function upsertUser(
  userId: string,
  email: string,
  name: string | null,
  image: string | null = null,
): Promise<void> {
  await (await getPool()).query(
    `INSERT INTO users (id, email, name, image, created_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET
       email = EXCLUDED.email,
       name = COALESCE(EXCLUDED.name, users.name),
       image = CASE
         WHEN EXCLUDED.image IS NOT NULL AND EXCLUDED.image <> '' THEN EXCLUDED.image
         ELSE users.image
       END`,
    [userId, email, name, image, Math.floor(Date.now() / 1000)],
  );
}

export async function upsertItem(
  userId: string,
  item: {
    key: string;
    name: string;
    folder: string;
    type: string;
    ext: string | null;
    size: number | null;
    content_type: string | null;
    last_modified: string | null;
  },
): Promise<void> {
  await (await getPool()).query(
    `INSERT INTO items (user_id, key, name, folder, type, ext, size, content_type, last_modified, indexed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (user_id, key) DO UPDATE SET
       name = EXCLUDED.name, folder = EXCLUDED.folder, type = EXCLUDED.type,
       ext = EXCLUDED.ext,
       size = COALESCE(EXCLUDED.size, items.size),
       content_type = COALESCE(EXCLUDED.content_type, items.content_type),
       last_modified = COALESCE(EXCLUDED.last_modified, items.last_modified),
       indexed_at = EXCLUDED.indexed_at`,
    [
      userId,
      item.key,
      item.name,
      item.folder,
      item.type,
      item.ext,
      item.size,
      item.content_type,
      item.last_modified,
      Math.floor(Date.now() / 1000),
    ],
  );
}

export async function deleteItem(userId: string, key: string): Promise<void> {
  await (await getPool()).query("DELETE FROM items WHERE user_id = $1 AND key = $2", [userId, key]);
}

export async function deleteItemsUnder(userId: string, prefix: string): Promise<void> {
  await (await getPool()).query("DELETE FROM items WHERE user_id = $1 AND key LIKE $2", [userId, `${prefix}%`]);
}

export async function renamePrefix(userId: string, oldPrefix: string, newPrefix: string): Promise<void> {
  const offset = oldPrefix.length + 1;
  await (await getPool()).query(
    `UPDATE items SET
       key = $1 || substring(key from $2),
       folder = $1 || substring(folder from $2)
     WHERE user_id = $3 AND key LIKE $4`,
    [newPrefix, offset, userId, `${oldPrefix}%`],
  );
}

export async function setFavorite(userId: string, key: string, favorite: boolean): Promise<void> {
  await (await getPool()).query("UPDATE items SET favorite = $1 WHERE user_id = $2 AND key = $3", [
    favorite,
    userId,
    key,
  ]);
}

export async function setTags(
  userId: string,
  key: string,
  tags: string,
  caption?: string,
): Promise<void> {
  if (caption === undefined) {
    await (await getPool()).query("UPDATE items SET tags = $1 WHERE user_id = $2 AND key = $3", [
      tags,
      userId,
      key,
    ]);
  } else {
    await (await getPool()).query(
      "UPDATE items SET tags = $1, caption = $2 WHERE user_id = $3 AND key = $4",
      [tags, caption, userId, key],
    );
  }
}

export async function getItem(userId: string, key: string): Promise<DbItem | null> {
  const res = await (await getPool()).query("SELECT * FROM items WHERE user_id = $1 AND key = $2", [
    userId,
    key,
  ]);
  return (res.rows[0] as DbItem) || null;
}

export async function cloneItemRecord(
  userId: string,
  srcKey: string,
  dstKey: string,
  newName: string,
): Promise<void> {
  const old = await getItem(userId, srcKey);
  const folder = r2.folderOf(dstKey);
  if (!old) {
    await upsertItem(userId, {
      key: dstKey,
      name: newName,
      folder,
      type: classify(newName),
      ext: extOf(newName),
      size: null,
      content_type: contentTypeFor(newName),
      last_modified: null,
    });
    return;
  }
  await (await getPool()).query(
    `INSERT INTO items (
       user_id, key, name, folder, type, ext, size, content_type, last_modified,
       favorite, tags, caption, visual_tags, visual_indexed_at, visual_index_size, indexed_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     ON CONFLICT (user_id, key) DO UPDATE SET
       name = EXCLUDED.name, folder = EXCLUDED.folder, type = EXCLUDED.type,
       ext = EXCLUDED.ext, size = EXCLUDED.size, content_type = EXCLUDED.content_type,
       last_modified = EXCLUDED.last_modified, favorite = EXCLUDED.favorite,
       tags = EXCLUDED.tags, caption = EXCLUDED.caption, visual_tags = EXCLUDED.visual_tags,
       visual_indexed_at = EXCLUDED.visual_indexed_at, visual_index_size = EXCLUDED.visual_index_size,
       indexed_at = EXCLUDED.indexed_at`,
    [
      userId,
      dstKey,
      newName,
      folder,
      old.type,
      old.ext,
      old.size,
      old.content_type,
      old.last_modified,
      old.favorite,
      old.tags,
      old.caption,
      old.visual_tags,
      old.visual_indexed_at,
      old.visual_index_size,
      Math.floor(Date.now() / 1000),
    ],
  );
}

export const VISUAL_INDEX_UNREADABLE = "__unreadable__";

export async function setVisualIndex(
  userId: string,
  key: string,
  visualTags: string,
  caption: string,
  size: number | null,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await (await getPool()).query(
    `UPDATE items SET visual_tags = $1, caption = CASE WHEN caption = '' THEN $2 ELSE caption END,
     visual_indexed_at = $3, visual_index_size = $4 WHERE user_id = $5 AND key = $6`,
    [visualTags, caption, now, size, userId, key],
  );
}

/** Clears failed attempts that were marked indexed with no tags (allows retry on reindex). */
export async function resetStuckVisualIndexAttempts(userId: string): Promise<number> {
  const res = await (await getPool()).query(
    `UPDATE items SET visual_indexed_at = NULL, visual_index_size = NULL
     WHERE user_id = $1 AND type = 'image'
       AND COALESCE(visual_tags, '') = ''
       AND visual_indexed_at IS NOT NULL`,
    [userId],
  );
  return res.rowCount ?? 0;
}

export async function listImagesNeedingVisualIndex(
  userId: string,
  limit: number,
): Promise<Array<{ key: string; size: number | null }>> {
  const res = await (await getPool()).query(
    `SELECT key, size FROM items
     WHERE user_id = $1 AND type = 'image'
       AND COALESCE(visual_tags, '') <> $3
       AND (
         visual_indexed_at IS NULL
         OR visual_index_size IS DISTINCT FROM size
       )
     ORDER BY indexed_at DESC
     LIMIT $2`,
    [userId, limit, VISUAL_INDEX_UNREADABLE],
  );
  return res.rows as Array<{ key: string; size: number | null }>;
}

export async function countImagesNeedingVisualIndex(userId: string): Promise<number> {
  const res = await (await getPool()).query(
    `SELECT COUNT(*)::int AS c FROM items
     WHERE user_id = $1 AND type = 'image'
       AND COALESCE(visual_tags, '') <> $2
       AND (
         visual_indexed_at IS NULL
         OR visual_index_size IS DISTINCT FROM size
       )`,
    [userId, VISUAL_INDEX_UNREADABLE],
  );
  return res.rows[0]?.c ?? 0;
}

export async function searchItems(
  userId: string,
  opts: { query?: string; types?: string[]; favoritesOnly?: boolean; limit?: number },
): Promise<DbItem[]> {
  const clauses = ["user_id = $1"];
  const params: unknown[] = [userId];

  if (opts.query) {
    const terms = expandSearchTerms(opts.query);
    if (terms.length) {
      const termClauses: string[] = [];
      for (const term of terms) {
        params.push(`%${term}%`);
        const idx = params.length;
        termClauses.push(
          `(name ILIKE $${idx} OR tags ILIKE $${idx} OR caption ILIKE $${idx} OR visual_tags ILIKE $${idx})`,
        );
      }
      clauses.push(`(${termClauses.join(" OR ")})`);
    } else {
      params.push(`%${opts.query}%`);
      const idx = params.length;
      clauses.push(
        `(name ILIKE $${idx} OR tags ILIKE $${idx} OR caption ILIKE $${idx} OR visual_tags ILIKE $${idx})`,
      );
    }
  }
  if (opts.types?.length) {
    const placeholders = opts.types.map((_, i) => `$${params.length + i + 1}`).join(",");
    params.push(...opts.types);
    clauses.push(`type IN (${placeholders})`);
  }
  if (opts.favoritesOnly) clauses.push("favorite = TRUE");
  params.push(opts.limit ?? 200);
  const res = await (await getPool()).query(
    `SELECT * FROM items WHERE ${clauses.join(" AND ")} ORDER BY last_modified DESC NULLS LAST LIMIT $${params.length}`,
    params,
  );
  return res.rows as DbItem[];
}

export async function repairMissingItemSizes(userId: string): Promise<number> {
  const res = await (await getPool()).query(
    `SELECT key FROM items WHERE user_id = $1 AND type != 'folder' AND size IS NULL`,
    [userId],
  );
  let repaired = 0;
  for (const row of res.rows as Array<{ key: string }>) {
    const meta = await r2.headObject(row.key);
    if (!meta?.size) continue;
    await (await getPool()).query(
      `UPDATE items SET size = $1, last_modified = COALESCE($2, last_modified) WHERE user_id = $3 AND key = $4`,
      [meta.size, meta.last_modified, userId, row.key],
    );
    repaired++;
  }
  return repaired;
}

export async function indexSummary(userId: string) {
  const byType = await (await getPool()).query(
    "SELECT type, COUNT(*)::int AS count, COALESCE(SUM(size),0)::bigint AS bytes FROM items WHERE user_id = $1 GROUP BY type",
    [userId],
  );
  const total = await (await getPool()).query(
    "SELECT COUNT(*)::int AS c, COALESCE(SUM(size),0)::bigint AS b FROM items WHERE user_id = $1",
    [userId],
  );
  const row = total.rows[0];
  return {
    total_items: row?.c ?? 0,
    total_bytes: Number(row?.b ?? 0),
    by_type: Object.fromEntries(
      byType.rows.map((r) => [
        r.type,
        { count: r.count, bytes: Number(r.bytes) },
      ]),
    ),
  };
}

export async function setFolderLock(userId: string, folder: string, passwordHash: string): Promise<void> {
  await (await getPool()).query(
    `INSERT INTO folder_locks (user_id, folder, password, created_at)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id, folder) DO UPDATE SET password = EXCLUDED.password`,
    [userId, folder, passwordHash, Math.floor(Date.now() / 1000)],
  );
}

export async function removeFolderLock(userId: string, folder: string): Promise<void> {
  await (await getPool()).query("DELETE FROM folder_locks WHERE user_id = $1 AND folder = $2", [userId, folder]);
}

export async function getFolderLock(userId: string, folder: string): Promise<string | null> {
  const res = await (await getPool()).query(
    "SELECT password FROM folder_locks WHERE user_id = $1 AND folder = $2",
    [userId, folder],
  );
  return res.rows[0]?.password ?? null;
}

export async function listLockedFolders(userId: string): Promise<string[]> {
  const res = await (await getPool()).query(
    "SELECT folder FROM folder_locks WHERE user_id = $1 ORDER BY folder",
    [userId],
  );
  return res.rows.map((r) => r.folder as string);
}

export async function listChatConversations(userId: string): Promise<DbChatConversation[]> {
  const res = await (await getPool()).query(
    `SELECT id, user_id, title, created_at, updated_at
     FROM chat_conversations
     WHERE user_id = $1
     ORDER BY updated_at DESC`,
    [userId],
  );
  return res.rows as DbChatConversation[];
}

export async function getChatConversation(
  userId: string,
  conversationId: string,
): Promise<DbChatConversation | null> {
  const res = await (await getPool()).query(
    `SELECT id, user_id, title, created_at, updated_at
     FROM chat_conversations
     WHERE user_id = $1 AND id = $2`,
    [userId, conversationId],
  );
  return (res.rows[0] as DbChatConversation) || null;
}

export async function createChatConversation(
  userId: string,
  id: string,
  title = "New chat",
): Promise<DbChatConversation> {
  const now = Math.floor(Date.now() / 1000);
  await (await getPool()).query(
    `INSERT INTO chat_conversations (id, user_id, title, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, userId, title, now, now],
  );
  return { id, user_id: userId, title, created_at: now, updated_at: now };
}

export async function updateChatConversation(
  userId: string,
  conversationId: string,
  title: string,
): Promise<DbChatConversation | null> {
  const now = Math.floor(Date.now() / 1000);
  const res = await (await getPool()).query(
    `UPDATE chat_conversations
     SET title = $1, updated_at = $2
     WHERE user_id = $3 AND id = $4
     RETURNING id, user_id, title, created_at, updated_at`,
    [title, now, userId, conversationId],
  );
  return (res.rows[0] as DbChatConversation) || null;
}

export async function touchChatConversation(userId: string, conversationId: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await (await getPool()).query(
    `UPDATE chat_conversations SET updated_at = $1 WHERE user_id = $2 AND id = $3`,
    [now, userId, conversationId],
  );
}

export async function deleteChatConversation(userId: string, conversationId: string): Promise<boolean> {
  const res = await (await getPool()).query(
    `DELETE FROM chat_conversations WHERE user_id = $1 AND id = $2`,
    [userId, conversationId],
  );
  return (res.rowCount ?? 0) > 0;
}

export async function listChatMessages(userId: string, conversationId: string): Promise<DbChatMessage[]> {
  const res = await (await getPool()).query(
    `SELECT id, conversation_id, user_id, role, content, results, created_at
     FROM chat_messages
     WHERE user_id = $1 AND conversation_id = $2
     ORDER BY created_at ASC`,
    [userId, conversationId],
  );
  return res.rows as DbChatMessage[];
}

export async function insertChatMessage(
  userId: string,
  conversationId: string,
  id: string,
  role: string,
  content: string,
  results?: unknown[] | null,
): Promise<DbChatMessage> {
  const now = Math.floor(Date.now() / 1000);
  const resultsJson = results != null ? JSON.stringify(results) : null;
  await (await getPool()).query(
    `INSERT INTO chat_messages (id, conversation_id, user_id, role, content, results, created_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
    [id, conversationId, userId, role, content, resultsJson, now],
  );
  return {
    id,
    conversation_id: conversationId,
    user_id: userId,
    role,
    content,
    results: results ?? null,
    created_at: now,
  };
}

export type DbSharedFolder = {
  id: string;
  owner_id: string;
  name: string;
  r2_root: string;
  created_at: number;
};

export type DbSharedMember = {
  share_id: string;
  user_id: string;
  role: string;
  joined_at: number;
  joined_via: string | null;
  email?: string;
  name?: string;
  image?: string;
};

export type DbSharedJoinCode = {
  code: string;
  share_id: string;
  created_by: string;
  revoked: boolean;
  use_count: number;
  created_at: number;
};

export type DbSharedItem = {
  share_id: string;
  key: string;
  name: string;
  folder: string;
  type: string;
  ext: string | null;
  size: number | null;
  content_type: string | null;
  last_modified: string | null;
  imported_from: string | null;
  imported_by: string;
  indexed_at: number;
};

export async function createSharedFolder(
  id: string,
  ownerId: string,
  name: string,
  r2Root: string,
): Promise<DbSharedFolder> {
  const now = Math.floor(Date.now() / 1000);
  await (await getPool()).query(
    `INSERT INTO shared_folders (id, owner_id, name, r2_root, created_at) VALUES ($1,$2,$3,$4,$5)`,
    [id, ownerId, name, r2Root, now],
  );
  await addSharedMember(id, ownerId, "owner", null);
  return { id, owner_id: ownerId, name, r2_root: r2Root, created_at: now };
}

export async function getSharedFolder(shareId: string): Promise<DbSharedFolder | null> {
  const res = await (await getPool()).query(
    `SELECT id, owner_id, name, r2_root, created_at FROM shared_folders WHERE id = $1`,
    [shareId],
  );
  return (res.rows[0] as DbSharedFolder) || null;
}

export async function listSharedFoldersForUser(userId: string): Promise<
  Array<DbSharedFolder & { role: string; member_count: number }>
> {
  const res = await (await getPool()).query(
    `SELECT f.id, f.owner_id, f.name, f.r2_root, f.created_at, m.role,
            (SELECT COUNT(*)::int FROM shared_members sm WHERE sm.share_id = f.id) AS member_count
     FROM shared_folders f
     JOIN shared_members m ON m.share_id = f.id AND m.user_id = $1
     ORDER BY f.created_at DESC`,
    [userId],
  );
  return res.rows as Array<DbSharedFolder & { role: string; member_count: number }>;
}

export async function getSharedMembership(
  shareId: string,
  userId: string,
): Promise<DbSharedMember | null> {
  const res = await (await getPool()).query(
    `SELECT share_id, user_id, role, joined_at, joined_via FROM shared_members WHERE share_id = $1 AND user_id = $2`,
    [shareId, userId],
  );
  return (res.rows[0] as DbSharedMember) || null;
}

export async function addSharedMember(
  shareId: string,
  userId: string,
  role: string,
  joinedVia: string | null,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await (await getPool()).query(
    `INSERT INTO shared_members (share_id, user_id, role, joined_at, joined_via)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (share_id, user_id) DO NOTHING`,
    [shareId, userId, role, now, joinedVia],
  );
}

export async function removeSharedMember(shareId: string, userId: string): Promise<boolean> {
  const res = await (await getPool()).query(
    `DELETE FROM shared_members WHERE share_id = $1 AND user_id = $2 AND role != 'owner'`,
    [shareId, userId],
  );
  return (res.rowCount ?? 0) > 0;
}

export async function listSharedMembers(shareId: string): Promise<DbSharedMember[]> {
  const res = await (await getPool()).query(
    `SELECT m.share_id, m.user_id, m.role, m.joined_at, m.joined_via, u.email, u.name, u.image
     FROM shared_members m
     LEFT JOIN users u ON u.id = m.user_id
     WHERE m.share_id = $1
     ORDER BY m.role DESC, m.joined_at ASC`,
    [shareId],
  );
  return res.rows as DbSharedMember[];
}

export async function sharedFolderHasOtherUploads(
  shareId: string,
  folderPrefix: string,
  uploaderId: string,
): Promise<boolean> {
  const prefix = folderPrefix.endsWith("/") ? folderPrefix : `${folderPrefix}/`;
  const res = await (await getPool()).query(
    `SELECT EXISTS(
       SELECT 1 FROM shared_items
       WHERE share_id = $1 AND key LIKE $2 AND imported_by <> $3
     ) AS has_other`,
    [shareId, `${prefix}%`, uploaderId],
  );
  return Boolean(res.rows[0]?.has_other);
}

export async function createJoinCode(
  code: string,
  shareId: string,
  createdBy: string,
): Promise<DbSharedJoinCode> {
  const now = Math.floor(Date.now() / 1000);
  await (await getPool()).query(
    `INSERT INTO shared_join_codes (code, share_id, created_by, created_at) VALUES ($1,$2,$3,$4)`,
    [code, shareId, createdBy, now],
  );
  return { code, share_id: shareId, created_by: createdBy, revoked: false, use_count: 0, created_at: now };
}

export async function getJoinCode(code: string): Promise<DbSharedJoinCode | null> {
  const res = await (await getPool()).query(
    `SELECT code, share_id, created_by, revoked, use_count, created_at FROM shared_join_codes WHERE code = $1`,
    [code.toUpperCase()],
  );
  return (res.rows[0] as DbSharedJoinCode) || null;
}

export async function listJoinCodes(shareId: string): Promise<DbSharedJoinCode[]> {
  const res = await (await getPool()).query(
    `SELECT code, share_id, created_by, revoked, use_count, created_at
     FROM shared_join_codes WHERE share_id = $1 ORDER BY created_at DESC`,
    [shareId],
  );
  return res.rows as DbSharedJoinCode[];
}

export async function revokeJoinCode(shareId: string, code: string): Promise<boolean> {
  const res = await (await getPool()).query(
    `UPDATE shared_join_codes SET revoked = TRUE WHERE share_id = $1 AND code = $2`,
    [shareId, code.toUpperCase()],
  );
  return (res.rowCount ?? 0) > 0;
}

export async function incrementJoinCodeUse(code: string): Promise<void> {
  await (await getPool()).query(
    `UPDATE shared_join_codes SET use_count = use_count + 1 WHERE code = $1`,
    [code.toUpperCase()],
  );
}

export async function upsertSharedItem(
  shareId: string,
  item: {
    key: string;
    name: string;
    folder: string;
    type: string;
    ext: string | null;
    size: number | null;
    content_type: string | null;
    last_modified: string | null;
    imported_from?: string | null;
    imported_by: string;
  },
): Promise<void> {
  await (await getPool()).query(
    `INSERT INTO shared_items (share_id, key, name, folder, type, ext, size, content_type, last_modified, imported_from, imported_by, indexed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (share_id, key) DO UPDATE SET
       name = EXCLUDED.name, folder = EXCLUDED.folder, type = EXCLUDED.type,
       ext = EXCLUDED.ext, size = EXCLUDED.size, content_type = EXCLUDED.content_type,
       last_modified = EXCLUDED.last_modified, indexed_at = EXCLUDED.indexed_at`,
    [
      shareId,
      item.key,
      item.name,
      item.folder,
      item.type,
      item.ext,
      item.size,
      item.content_type,
      item.last_modified,
      item.imported_from ?? null,
      item.imported_by,
      Math.floor(Date.now() / 1000),
    ],
  );
}

export async function deleteSharedFolder(shareId: string, ownerId: string): Promise<boolean> {
  const res = await (await getPool()).query(
    `DELETE FROM shared_folders WHERE id = $1 AND owner_id = $2`,
    [shareId, ownerId],
  );
  return (res.rowCount ?? 0) > 0;
}

export async function deleteSharedItem(shareId: string, key: string): Promise<void> {
  await (await getPool()).query(`DELETE FROM shared_items WHERE share_id = $1 AND key = $2`, [shareId, key]);
}

export async function deleteSharedItemsUnder(shareId: string, prefix: string): Promise<void> {
  await (await getPool()).query(`DELETE FROM shared_items WHERE share_id = $1 AND key LIKE $2`, [
    shareId,
    `${prefix}%`,
  ]);
}

export async function renameSharedPrefix(
  shareId: string,
  oldPrefix: string,
  newPrefix: string,
): Promise<void> {
  const offset = oldPrefix.length + 1;
  await (await getPool()).query(
    `UPDATE shared_items SET
       key = $1 || substring(key from $2),
       folder = $1 || substring(folder from $2)
     WHERE share_id = $3 AND key LIKE $4`,
    [newPrefix, offset, shareId, `${oldPrefix}%`],
  );
}

export async function getSharedItem(shareId: string, key: string): Promise<DbSharedItem | null> {
  const res = await (await getPool()).query(`SELECT * FROM shared_items WHERE share_id = $1 AND key = $2`, [
    shareId,
    key,
  ]);
  return (res.rows[0] as DbSharedItem) || null;
}
