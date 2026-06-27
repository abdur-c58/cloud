"""Supabase Postgres persistence for the media index and folder password hashes."""

from __future__ import annotations

import threading
import time
from contextlib import contextmanager
from typing import Any, Iterator

import psycopg
from psycopg.rows import dict_row

from .config import settings

_local = threading.local()

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    email       TEXT UNIQUE NOT NULL,
    name        TEXT,
    created_at  BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
    key           TEXT PRIMARY KEY,
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
    indexed_at    BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS folder_locks (
    folder      TEXT PRIMARY KEY,
    password    TEXT NOT NULL,
    created_at  BIGINT NOT NULL
);
"""

MIGRATIONS = """
ALTER TABLE items ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT '';
ALTER TABLE folder_locks ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT '';
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_pkey;
ALTER TABLE items ADD CONSTRAINT items_pkey PRIMARY KEY (user_id, key);
ALTER TABLE folder_locks DROP CONSTRAINT IF EXISTS folder_locks_pkey;
ALTER TABLE folder_locks ADD CONSTRAINT folder_locks_pkey PRIMARY KEY (user_id, folder);
"""

INDEXES = """
CREATE INDEX IF NOT EXISTS idx_items_folder ON items(user_id, folder);
CREATE INDEX IF NOT EXISTS idx_items_type ON items(user_id, type);
CREATE INDEX IF NOT EXISTS idx_items_user ON items(user_id);
"""


def _connect() -> psycopg.Connection:
    return psycopg.connect(settings.postgres_dsn, row_factory=dict_row)


def get_conn() -> psycopg.Connection:
    conn = getattr(_local, "conn", None)
    if conn is None or conn.closed:
        conn = _connect()
        _local.conn = conn
    return conn


@contextmanager
def cursor() -> Iterator[psycopg.Cursor]:
    conn = get_conn()
    cur = conn.cursor()
    try:
        yield cur
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()


def init_db() -> None:
    with cursor() as cur:
        cur.execute(SCHEMA)
        cur.execute(MIGRATIONS)
        cur.execute(INDEXES)


# --------------------------------------------------------------------------- #
# Users
# --------------------------------------------------------------------------- #
def upsert_user(user_id: str, email: str, name: str | None) -> None:
    with cursor() as cur:
        cur.execute(
            """
            INSERT INTO users (id, email, name, created_at)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET
                email = EXCLUDED.email,
                name = COALESCE(EXCLUDED.name, users.name)
            """,
            (user_id, email, name, int(time.time())),
        )


# --------------------------------------------------------------------------- #
# Item index helpers
# --------------------------------------------------------------------------- #
def upsert_item(user_id: str, item: dict[str, Any]) -> None:
    with cursor() as cur:
        cur.execute(
            """
            INSERT INTO items (user_id, key, name, folder, type, ext, size, content_type,
                               last_modified, indexed_at)
            VALUES (%(user_id)s, %(key)s, %(name)s, %(folder)s, %(type)s, %(ext)s, %(size)s,
                    %(content_type)s, %(last_modified)s, %(indexed_at)s)
            ON CONFLICT (user_id, key) DO UPDATE SET
                name = EXCLUDED.name,
                folder = EXCLUDED.folder,
                type = EXCLUDED.type,
                ext = EXCLUDED.ext,
                size = EXCLUDED.size,
                content_type = EXCLUDED.content_type,
                last_modified = EXCLUDED.last_modified,
                indexed_at = EXCLUDED.indexed_at
            """,
            {**item, "user_id": user_id, "indexed_at": int(time.time())},
        )


def delete_item(user_id: str, key: str) -> None:
    with cursor() as cur:
        cur.execute("DELETE FROM items WHERE user_id = %s AND key = %s", (user_id, key))


def delete_items_under(user_id: str, prefix: str) -> None:
    with cursor() as cur:
        cur.execute(
            "DELETE FROM items WHERE user_id = %s AND key LIKE %s",
            (user_id, prefix + "%"),
        )


def rename_prefix(user_id: str, old: str, new: str) -> None:
    offset = len(old) + 1
    with cursor() as cur:
        cur.execute(
            """
            UPDATE items SET
                key = %s || substring(key FROM %s),
                folder = %s || substring(folder FROM %s)
            WHERE user_id = %s AND key LIKE %s
            """,
            (new, offset, new, offset, user_id, old + "%"),
        )


def set_favorite(user_id: str, key: str, favorite: bool) -> None:
    with cursor() as cur:
        cur.execute(
            "UPDATE items SET favorite = %s WHERE user_id = %s AND key = %s",
            (favorite, user_id, key),
        )


def set_tags(user_id: str, key: str, tags: str, caption: str | None = None) -> None:
    with cursor() as cur:
        if caption is None:
            cur.execute(
                "UPDATE items SET tags = %s WHERE user_id = %s AND key = %s",
                (tags, user_id, key),
            )
        else:
            cur.execute(
                "UPDATE items SET tags = %s, caption = %s WHERE user_id = %s AND key = %s",
                (tags, caption, user_id, key),
            )


def get_item(user_id: str, key: str) -> dict[str, Any] | None:
    with cursor() as cur:
        cur.execute("SELECT * FROM items WHERE user_id = %s AND key = %s", (user_id, key))
        return cur.fetchone()


def search_items(
    user_id: str,
    query: str = "",
    types: list[str] | None = None,
    favorites_only: bool = False,
    limit: int = 200,
) -> list[dict[str, Any]]:
    clauses: list[str] = ["user_id = %s"]
    params: list[Any] = [user_id]
    if query:
        clauses.append("(name ILIKE %s OR tags ILIKE %s OR caption ILIKE %s)")
        like = f"%{query}%"
        params += [like, like, like]
    if types:
        placeholders = ",".join("%s" for _ in types)
        clauses.append(f"type IN ({placeholders})")
        params += types
    if favorites_only:
        clauses.append("favorite = TRUE")
    where = " WHERE " + " AND ".join(clauses)
    with cursor() as cur:
        cur.execute(
            f"SELECT * FROM items{where} ORDER BY last_modified DESC NULLS LAST LIMIT %s",
            (*params, limit),
        )
        return cur.fetchall()


def index_summary(user_id: str) -> dict[str, Any]:
    with cursor() as cur:
        cur.execute(
            "SELECT type, COUNT(*) AS count, COALESCE(SUM(size), 0) AS bytes "
            "FROM items WHERE user_id = %s GROUP BY type",
            (user_id,),
        )
        rows = cur.fetchall()
        cur.execute(
            "SELECT COUNT(*) AS c, COALESCE(SUM(size), 0) AS b FROM items WHERE user_id = %s",
            (user_id,),
        )
        total = cur.fetchone()
    return {
        "total_items": int(total["c"]) if total else 0,
        "total_bytes": int(total["b"]) if total else 0,
        "by_type": {
            r["type"]: {"count": int(r["count"]), "bytes": int(r["bytes"])} for r in rows
        },
    }


# --------------------------------------------------------------------------- #
# Folder lock helpers
# --------------------------------------------------------------------------- #
def set_folder_lock(user_id: str, folder: str, password_hash: str) -> None:
    with cursor() as cur:
        cur.execute(
            """
            INSERT INTO folder_locks (user_id, folder, password, created_at)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (user_id, folder) DO UPDATE SET password = EXCLUDED.password
            """,
            (user_id, folder, password_hash, int(time.time())),
        )


def remove_folder_lock(user_id: str, folder: str) -> None:
    with cursor() as cur:
        cur.execute(
            "DELETE FROM folder_locks WHERE user_id = %s AND folder = %s",
            (user_id, folder),
        )


def get_folder_lock(user_id: str, folder: str) -> str | None:
    with cursor() as cur:
        cur.execute(
            "SELECT password FROM folder_locks WHERE user_id = %s AND folder = %s",
            (user_id, folder),
        )
        row = cur.fetchone()
        return row["password"] if row else None


def list_locked_folders(user_id: str) -> list[str]:
    with cursor() as cur:
        cur.execute(
            "SELECT folder FROM folder_locks WHERE user_id = %s ORDER BY folder",
            (user_id,),
        )
        return [r["folder"] for r in cur.fetchall()]
