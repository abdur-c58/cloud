import { randomUUID } from "crypto";
import * as db from "../db";
import { ApiError, requireUser } from "../security";

function titleFromMessage(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (!trimmed) return "New chat";
  return trimmed.length > 48 ? `${trimmed.slice(0, 48)}…` : trimmed;
}

export async function handleListChats(req: Request) {
  const user = await requireUser(req);
  const conversations = await db.listChatConversations(user.userId);
  return { conversations };
}

export async function handleCreateChat(req: Request) {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "New chat";
  const conversation = await db.createChatConversation(user.userId, randomUUID(), title);
  return { conversation };
}

export async function handleGetChat(req: Request, conversationId: string) {
  const user = await requireUser(req);
  const conversation = await db.getChatConversation(user.userId, conversationId);
  if (!conversation) throw new ApiError(404, "Conversation not found.");
  const messages = await db.listChatMessages(user.userId, conversationId);
  return { conversation, messages };
}

export async function handleUpdateChat(req: Request, conversationId: string) {
  const user = await requireUser(req);
  const body = await req.json();
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) throw new ApiError(400, "Title is required.");
  const conversation = await db.updateChatConversation(user.userId, conversationId, title);
  if (!conversation) throw new ApiError(404, "Conversation not found.");
  return { conversation };
}

export async function handleDeleteChat(req: Request, conversationId: string) {
  const user = await requireUser(req);
  const deleted = await db.deleteChatConversation(user.userId, conversationId);
  if (!deleted) throw new ApiError(404, "Conversation not found.");
  return { ok: true };
}

export { titleFromMessage };
