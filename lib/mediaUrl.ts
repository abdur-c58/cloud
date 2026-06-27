"use client";

import { useEffect, useState } from "react";
import { api } from "./api";

// Presigned URLs are valid for ~1h; cache them client-side to avoid re-signing.
const CACHE = new Map<string, { url: string; expires: number }>();
const TTL_MS = 50 * 60 * 1000; // refresh a little before the 60-min server TTL

export async function resolveMediaUrl(
  key: string,
  download = false,
  shareId?: string,
): Promise<string> {
  const cacheKey = `${shareId || "p"}:${download ? "dl:" : ""}${key}`;
  const cached = CACHE.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.url;
  const { url } = await api.mediaUrl(key, download, shareId);
  CACHE.set(cacheKey, { url, expires: Date.now() + TTL_MS });
  return url;
}

export function invalidateMediaUrl(key: string, shareId?: string) {
  CACHE.delete(`${shareId || "p"}:${key}`);
  CACHE.delete(`${shareId || "p"}:dl:${key}`);
}

/** Lazily resolve a viewable presigned URL for a media key. */
export function useMediaUrl(key: string | null, enabled = true, shareId?: string) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setError(false);
    if (!key || !enabled) {
      setUrl(null);
      return;
    }
    resolveMediaUrl(key, false, shareId)
      .then((u) => active && setUrl(u))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, [key, enabled, shareId]);

  return { url, error };
}
