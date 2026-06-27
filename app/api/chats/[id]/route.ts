import { json, withHandler } from "@/lib/server/http";
import { handleDeleteChat, handleGetChat, handleUpdateChat } from "@/lib/server/handlers/chats";

export const runtime = "nodejs";

export const GET = withHandler(async (req, ctx) => {
  const { id } = await ctx!.params!;
  return json(await handleGetChat(req, id));
});

export const PATCH = withHandler(async (req, ctx) => {
  const { id } = await ctx!.params!;
  return json(await handleUpdateChat(req, id));
});

export const DELETE = withHandler(async (req, ctx) => {
  const { id } = await ctx!.params!;
  return json(await handleDeleteChat(req, id));
});
