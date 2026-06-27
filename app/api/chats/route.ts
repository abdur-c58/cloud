import { json, withHandler } from "@/lib/server/http";
import { handleCreateChat, handleListChats } from "@/lib/server/handlers/chats";

export const runtime = "nodejs";

export const GET = withHandler(async (req) => json(await handleListChats(req)));

export const POST = withHandler(async (req) => json(await handleCreateChat(req)));
