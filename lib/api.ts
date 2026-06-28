import {
  AuthError,
  ChatReply,
  ChatConversation,
  ChatDetail,
  HealthInfo,
  IndexSummary,
  Listing,
  LockedError,
  SearchResult,
  SharedFolderInfo,
  SharedJoinCodeInfo,
  SharedMemberInfo,
  StorageItem,
  TokenResponse,
} from "./types";

// Same-origin Next.js API routes (Vercel). Set NEXT_PUBLIC_API_BASE only to override.
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/$/, "");

const SESSION_KEY = "gcc-session";
const FOLDER_KEY = "gcc-folder-token";
const GATE_KEY = "gcc-gate";

// ----------------------------- token storage ----------------------------- //
let sessionToken: string | null = null;
let folderToken: string | null = null;

function loadTokens() {
  if (typeof window === "undefined") return;
  if (sessionToken === null) sessionToken = localStorage.getItem(SESSION_KEY);
  if (folderToken === null) folderToken = localStorage.getItem(FOLDER_KEY);
}

export function getSessionToken(): string | null {
  loadTokens();
  return sessionToken;
}

export function setSessionToken(token: string | null) {
  sessionToken = token;
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(SESSION_KEY, token);
  else localStorage.removeItem(SESSION_KEY);
}

export function getFolderToken(): string | null {
  loadTokens();
  return folderToken;
}

export function setFolderToken(token: string | null) {
  folderToken = token;
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(FOLDER_KEY, token);
  else localStorage.removeItem(FOLDER_KEY);
}

export function getGateToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(GATE_KEY);
}

export function setGateToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) sessionStorage.setItem(GATE_KEY, token);
  else sessionStorage.removeItem(GATE_KEY);
}

export function clearTokens() {
  setSessionToken(null);
  setFolderToken(null);
  setGateToken(null);
}

// ----------------------------- core request ------------------------------ //
type ReqOptions = {
  method?: string;
  body?: unknown;
  auth?: boolean;
  query?: Record<string, string | number | boolean | undefined>;
};

async function request<T>(path: string, opts: ReqOptions = {}): Promise<T> {
  loadTokens();
  const { method = "GET", body, auth = true, query } = opts;

  let url = `${API_BASE}${path}`;
  if (query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
    }
    const s = qs.toString();
    if (s) url += `?${s}`;
  }

  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth && sessionToken) headers["Authorization"] = `Bearer ${sessionToken}`;
  if (folderToken) headers["X-Folder-Token"] = folderToken;

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    throw new AuthError();
  }
  if (res.status === 423) {
    const data = await res.json().catch(() => ({}));
    const detail = data?.detail ?? {};
    throw new LockedError(detail.folder ?? "", detail.message ?? "Folder is locked");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const message =
      (data && (typeof data.detail === "string" ? data.detail : data.detail?.message)) ||
      `Request failed (${res.status})`;
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ------------------------------- endpoints ------------------------------- //
export const api = {
  health: () => request<HealthInfo>("/api/health", { auth: false }),

  login: async (password: string) => {
    const data = await request<TokenResponse>("/api/auth/login", {
      method: "POST",
      auth: false,
      body: { password },
    });
    setGateToken(data.token);
    return data;
  },

  completeSession: async () => {
    const gateToken = getGateToken();
    if (!gateToken) throw new Error("Master password gate expired. Unlock again.");
    const res = await fetch("/api/auth/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gateToken }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(typeof data.detail === "string" ? data.detail : "Session exchange failed.");
    }
    setSessionToken(data.token);
    setGateToken(null);
    return data as TokenResponse;
  },

  syncProfile: () =>
    request<{ ok: boolean; image: string | null; name: string | null }>("/api/auth/sync-profile", {
      method: "POST",
    }),

  list: (prefix: string) => request<Listing>("/api/storage/list", { query: { prefix } }),

  createFolder: (prefix: string, name: string) =>
    request<{ key: string }>("/api/storage/folder", {
      method: "POST",
      body: { prefix, name },
    }),

  uploadUrl: (prefix: string, name: string, content_type?: string, relative_path?: string) =>
    request<{ key: string; url: string; content_type: string }>("/api/storage/upload-url", {
      method: "POST",
      body: { prefix, name, content_type, relative_path },
    }),

  /** Fallback upload through the server (no R2 CORS required). */
  uploadFile: async (
    prefix: string,
    file: File,
    onProgress?: (pct: number) => void,
    relative_path?: string,
  ) => {
    loadTokens();
    const form = new FormData();
    form.append("prefix", prefix);
    form.append("file", file, file.name);
    if (relative_path) form.append("relative_path", relative_path);

    return new Promise<{ key: string }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_BASE}/api/storage/upload`);
      if (sessionToken) xhr.setRequestHeader("Authorization", `Bearer ${sessionToken}`);
      if (folderToken) xhr.setRequestHeader("X-Folder-Token", folderToken);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
      xhr.onload = () => {
        if (xhr.status === 401) {
          reject(new AuthError());
          return;
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText) as { key: string });
          } catch {
            reject(new Error("Invalid upload response"));
          }
          return;
        }
        try {
          const data = JSON.parse(xhr.responseText);
          reject(new Error(typeof data.detail === "string" ? data.detail : `Upload failed (${xhr.status})`));
        } catch {
          reject(new Error(`Upload failed (${xhr.status})`));
        }
      };
      xhr.onerror = () => reject(new Error("Network error during upload"));
      xhr.send(form);
    });
  },

  indexOne: (key: string) =>
    request<{ ok: boolean }>("/api/storage/index-one", { method: "POST", body: { key } }),

  mediaUrl: (key: string, download = false, shareId?: string) =>
    shareId
      ? request<{ url: string }>(`/api/shared/${shareId}/url`, {
          query: { key, download: download ? "true" : undefined },
        })
      : request<{ url: string }>("/api/storage/url", { query: { key, download } }),

  delete: (key: string) =>
    request<{ deleted: string[] }>("/api/storage/delete", { method: "POST", body: { key } }),

  move: (source: string, destination_prefix: string, new_name?: string) =>
    request<{ key: string }>("/api/storage/move", {
      method: "POST",
      body: { source, destination_prefix, new_name },
    }),

  copy: (source: string, destination_prefix: string, new_name?: string) =>
    request<{ key: string; name: string }>("/api/storage/copy", {
      method: "POST",
      body: { source, destination_prefix, new_name },
    }),

  favorite: (key: string, favorite: boolean) =>
    request<{ ok: boolean }>("/api/storage/favorite", {
      method: "POST",
      body: { key, favorite },
    }),

  search: (params: { q?: string; type?: string; favorites?: boolean; limit?: number }) =>
    request<SearchResult>("/api/search", { query: params }),

  reindex: () =>
    request<{
      indexed: number;
      visual_indexed?: number;
      visual_skipped?: number;
      visual_failed?: number;
      visual_pending?: number;
    }>("/api/search/reindex", { method: "POST" }),

  summary: () => request<IndexSummary>("/api/search/summary"),

  setTags: (key: string, tags: string[]) =>
    request<{ ok: boolean; tags: string[] }>("/api/search/tags", {
      method: "POST",
      body: { key, tags },
    }),

  lockedFolders: () => request<{ folders: string[] }>("/api/folders/locked"),

  lockFolder: (folder: string, password: string) =>
    request<{ folder: string; locked: boolean }>("/api/folders/lock", {
      method: "POST",
      body: { folder, password },
    }),

  unlockFolder: async (folder: string, password: string) => {
    const data = await request<TokenResponse>("/api/folders/unlock", {
      method: "POST",
      body: { folder, password, current_token: getFolderToken() },
    });
    setFolderToken(data.token);
    return data;
  },

  removeLock: (folder: string, password: string) =>
    request<{ folder: string; locked: boolean }>("/api/folders/remove", {
      method: "POST",
      body: { folder, password },
    }),

  chat: (conversationId: string, message: string) =>
    request<ChatReply>("/api/ai/chat", {
      method: "POST",
      body: { conversation_id: conversationId, message },
    }),

  listChats: () => request<{ conversations: ChatConversation[] }>("/api/chats"),

  createChat: (title?: string) =>
    request<{ conversation: ChatConversation }>("/api/chats", {
      method: "POST",
      body: title ? { title } : {},
    }),

  getChat: (id: string) => request<ChatDetail>(`/api/chats/${id}`),

  updateChat: (id: string, title: string) =>
    request<{ conversation: ChatConversation }>(`/api/chats/${id}`, {
      method: "PATCH",
      body: { title },
    }),

  deleteChat: (id: string) =>
    request<{ ok: boolean }>(`/api/chats/${id}`, { method: "DELETE" }),

  suggestTags: (key: string) =>
    request<{ tags: string[]; caption: string; message?: string }>("/api/ai/suggest-tags", {
      method: "POST",
      body: { key },
    }),

  listShared: () => request<{ folders: SharedFolderInfo[] }>("/api/shared"),

  createShared: (name: string) =>
    request<{ folder: SharedFolderInfo; code: string }>("/api/shared", {
      method: "POST",
      body: { name },
    }),

  joinShared: (code: string) =>
    request<{ folder: SharedFolderInfo; already_member?: boolean }>("/api/shared/join", {
      method: "POST",
      body: { code },
    }),

  sharedList: (shareId: string, prefix: string) =>
    request<Listing>(`/api/shared/${shareId}/list`, { query: { prefix } }),

  sharedCreateFolder: (shareId: string, prefix: string, name: string) =>
    request<{ key: string }>(`/api/shared/${shareId}/folder`, {
      method: "POST",
      body: { prefix, name },
    }),

  sharedUploadUrl: (
    shareId: string,
    prefix: string,
    name: string,
    content_type?: string,
    relative_path?: string,
  ) =>
    request<{ key: string; url: string; content_type: string }>(`/api/shared/${shareId}/upload-url`, {
      method: "POST",
      body: { prefix, name, content_type, relative_path },
    }),

  sharedUploadFile: (
    shareId: string,
    prefix: string,
    file: File,
    onProgress?: (pct: number) => void,
    relative_path?: string,
  ) =>
    new Promise<{ key: string }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const form = new FormData();
      form.append("prefix", prefix);
      form.append("file", file);
      if (relative_path) form.append("relative_path", relative_path);
      xhr.open("POST", `${API_BASE}/api/shared/${shareId}/upload`);
      loadTokens();
      if (sessionToken) xhr.setRequestHeader("Authorization", `Bearer ${sessionToken}`);
      if (folderToken) xhr.setRequestHeader("X-Folder-Token", folderToken);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          try {
            const data = JSON.parse(xhr.responseText);
            reject(new Error(data.detail || "Upload failed"));
          } catch {
            reject(new Error("Upload failed"));
          }
        }
      };
      xhr.onerror = () => reject(new Error("Upload network error"));
      xhr.send(form);
    }),

  sharedIndexOne: (shareId: string, key: string) =>
    request<{ ok: boolean }>(`/api/shared/${shareId}/index-one`, {
      method: "POST",
      body: { key },
    }),

  sharedDelete: (shareId: string, key: string) =>
    request<{ deleted: string[] }>(`/api/shared/${shareId}/delete`, {
      method: "POST",
      body: { key },
    }),

  sharedImport: (shareId: string, sources: string[], destination_prefix: string) =>
    request<{ imported: string[] }>(`/api/shared/${shareId}/import`, {
      method: "POST",
      body: { sources, destination_prefix },
    }),

  sharedMove: (shareId: string, source: string, destination_prefix: string, new_name?: string) =>
    request<{ key: string }>(`/api/shared/${shareId}/move`, {
      method: "POST",
      body: { source, destination_prefix, new_name },
    }),

  sharedCopy: (shareId: string, source: string, destination_prefix: string, new_name?: string) =>
    request<{ key: string; name: string }>(`/api/shared/${shareId}/copy`, {
      method: "POST",
      body: { source, destination_prefix, new_name },
    }),

  sharedMembers: (shareId: string) =>
    request<{ members: SharedMemberInfo[] }>(`/api/shared/${shareId}/members`),

  sharedLeave: (shareId: string) =>
    request<{ ok: boolean }>(`/api/shared/${shareId}/leave`, { method: "POST" }),

  sharedKick: (shareId: string, user_id: string) =>
    request<{ ok: boolean }>(`/api/shared/${shareId}/kick`, {
      method: "POST",
      body: { user_id },
    }),

  sharedCodes: (shareId: string) =>
    request<{ codes: SharedJoinCodeInfo[] }>(`/api/shared/${shareId}/codes`),

  sharedCreateCode: (shareId: string) =>
    request<{ code: string }>(`/api/shared/${shareId}/codes`, { method: "POST" }),

  sharedRevokeCode: (shareId: string, code: string) =>
    request<{ ok: boolean }>(`/api/shared/${shareId}/codes/${encodeURIComponent(code)}`, {
      method: "DELETE",
    }),

  sharedDeleteFolder: (shareId: string) =>
    request<{ ok: boolean }>(`/api/shared/${shareId}`, { method: "DELETE" }),
};

/** Upload a file straight to R2 using a presigned URL, with progress. */
export function uploadToR2(
  url: string,
  file: File,
  onProgress?: (pct: number) => void,
  contentType?: string,
): Promise<void> {
  const type = contentType || file.type || "application/octet-stream";
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status})`));
    };
    xhr.onerror = () =>
      reject(
        new Error(
          "Direct upload blocked (check R2 CORS). Retrying via server…",
        ),
      );
    xhr.send(file);
  });
}

export type { StorageItem };
export { API_BASE };
