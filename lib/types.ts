export type ItemType = "folder" | "image" | "video" | "audio" | "other";

export interface StorageItem {
  key: string;
  name: string;
  type: ItemType;
  size: number | null;
  last_modified: string | null;
  // present on files
  favorite?: boolean;
  tags?: string[];
  caption?: string;
  folder?: string;
  // present on folders
  locked?: boolean;
}

export interface Listing {
  prefix: string;
  folders: StorageItem[];
  files: StorageItem[];
}

export interface SearchResult {
  items: StorageItem[];
}

export interface IndexSummary {
  total_items: number;
  total_bytes: number;
  by_type: Record<string, { count: number; bytes: number }>;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatReply {
  reply: string;
  results: { key: string; name: string; type: ItemType; folder: string; tags: string[] }[];
  conversation_id?: string;
}

export interface ChatConversation {
  id: string;
  user_id: string;
  title: string;
  created_at: number;
  updated_at: number;
}

export interface StoredChatMessage {
  id: string;
  conversation_id: string;
  user_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  results: ChatReply["results"] | null;
  created_at: number;
}

export interface ChatDetail {
  conversation: ChatConversation;
  messages: StoredChatMessage[];
}

export interface TokenResponse {
  token: string;
  expires_at: number;
}

export interface HealthInfo {
  ok: boolean;
  version: string;
  r2_configured: boolean;
  openai_configured: boolean;
  supabase_configured?: boolean;
  visual_index_mode?: string;
}

export interface SharedFolderInfo {
  id: string;
  name: string;
  role: "owner" | "member";
  member_count: number;
  created_at: number;
  is_owner: boolean;
}

export interface SharedMemberInfo {
  user_id: string;
  role: string;
  joined_at: number;
  email?: string;
  name?: string;
}

export interface SharedJoinCodeInfo {
  code: string;
  share_id: string;
  revoked: boolean;
  use_count: number;
  created_at: number;
}

export class LockedError extends Error {
  folder: string;
  constructor(folder: string, message = "Folder is locked") {
    super(message);
    this.name = "LockedError";
    this.folder = folder;
  }
}

export class AuthError extends Error {
  constructor(message = "Not authenticated") {
    super(message);
    this.name = "AuthError";
  }
}
