import { json, withHandler } from "@/lib/server/http";
import { handleSharedMembers } from "@/lib/server/handlers/shared";

export const runtime = "nodejs";

export const GET = withHandler(async (req, ctx) => {
  const { id } = await ctx!.params!;
  return json(await handleSharedMembers(req, id));
});
