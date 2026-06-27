-- GigaChad Cloud schema (also applied automatically on backend startup)

CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    email       TEXT UNIQUE NOT NULL,
    name        TEXT,
    created_at  BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
    user_id       TEXT NOT NULL DEFAULT '',
    key           TEXT NOT NULL,
    name          TEXT NOT NULL,
    folder        TEXT NOT NULL,
    type          TEXT NOT NULL,
    ext           TEXT,
    size          BIGINT,
    content_type  TEXT,
    last_modified TEXT,
    favorite      BOOLEAN NOT NULL DEFAULT FALSE,
    tags          TEXT NOT NULL DEFAULT '',
    caption       TEXT NOT NULL DEFAULT '',
    visual_tags   TEXT NOT NULL DEFAULT '',
    visual_indexed_at BIGINT,
    visual_index_size BIGINT,
    indexed_at    BIGINT NOT NULL,
    PRIMARY KEY (user_id, key)
);

CREATE INDEX IF NOT EXISTS idx_items_folder ON items(user_id, folder);
CREATE INDEX IF NOT EXISTS idx_items_type ON items(user_id, type);
CREATE INDEX IF NOT EXISTS idx_items_user ON items(user_id);

CREATE TABLE IF NOT EXISTS folder_locks (
    user_id     TEXT NOT NULL DEFAULT '',
    folder      TEXT NOT NULL,
    password    TEXT NOT NULL,
    created_at  BIGINT NOT NULL,
    PRIMARY KEY (user_id, folder)
);

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
