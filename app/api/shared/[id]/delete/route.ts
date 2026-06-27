import { json, withHandler } from "@/lib/server/http";
import { handleSharedDelete } from "@/lib/server/handlers/shared";

export const runtime = "nodejs";

export const POST = withHandler(async (req, ctx) => {
  const { id } = await ctx!.params!;
  return json(await handleSharedDelete(req, id));
});
