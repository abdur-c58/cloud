import { Pool } from "pg";

const ITEMS_MIGRATIONS = `
ALTER TABLE items ADD COLUMN IF NOT EXISTS visual_tags TEXT NOT NULL DEFAULT '';
ALTER TABLE items ADD COLUMN IF NOT EXISTS visual_indexed_at BIGINT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS visual_index_size BIGINT;
`;

const CHAT_SCHEMA = `
CREATE TABLE IF NOT EXISTS chat_conversations (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    title       TEXT NOT NULL DEFAULT 'New chat',
    created_at  BIGINT NOT NULL,
    updated_at  BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_user ON chat_conversations(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    user_id         TEXT NOT NULL,
    role            TEXT NOT NULL,
    content         TEXT NOT NULL,
    results         JSONB,
    created_at      BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversation_id, created_at);
`;

const SHARED_SCHEMA = `
CREATE TABLE IF NOT EXISTS shared_folders (
    id          TEXT PRIMARY KEY,
    owner_id    TEXT NOT NULL,
    name        TEXT NOT NULL,
    r2_root     TEXT NOT NULL,
    created_at  BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shared_folders_owner ON shared_folders(owner_id);

CREATE TABLE IF NOT EXISTS shared_join_codes (
    code        TEXT PRIMARY KEY,
    share_id    TEXT NOT NULL REFERENCES shared_folders(id) ON DELETE CASCADE,
    created_by  TEXT NOT NULL,
    revoked     BOOLEAN NOT NULL DEFAULT FALSE,
    use_count   INT NOT NULL DEFAULT 0,
    created_at  BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shared_join_codes_share ON shared_join_codes(share_id);

CREATE TABLE IF NOT EXISTS shared_members (
    share_id    TEXT NOT NULL REFERENCES shared_folders(id) ON DELETE CASCADE,
    user_id     TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'member',
    joined_at   BIGINT NOT NULL,
    joined_via  TEXT,
    PRIMARY KEY (share_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_shared_members_user ON shared_members(user_id);

CREATE TABLE IF NOT EXISTS shared_items (
    share_id        TEXT NOT NULL REFERENCES shared_folders(id) ON DELETE CASCADE,
    key             TEXT NOT NULL,
    name            TEXT NOT NULL,
    folder          TEXT NOT NULL,
    type            TEXT NOT NULL,
    ext             TEXT,
    size            BIGINT,
    content_type    TEXT,
    last_modified   TEXT,
    imported_from   TEXT,
    imported_by     TEXT NOT NULL,
    indexed_at      BIGINT NOT NULL,
    PRIMARY KEY (share_id, key)
);

CREATE INDEX IF NOT EXISTS idx_shared_items_folder ON shared_items(share_id, folder);
`;

let schemaReady: Promise<void> | null = null;

export function ensureDbSchema(pool: Pool): Promise<void> {
  if (!schemaReady) {
    schemaReady = pool.query(ITEMS_MIGRATIONS + CHAT_SCHEMA + SHARED_SCHEMA).then(() => undefined);
  }
  return schemaReady;
}

/** @deprecated use ensureDbSchema */
export const ensureChatSchema = ensureDbSchema;
