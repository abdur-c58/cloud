import { json, withHandler } from "@/lib/server/http";
import { handleSharedIndexOne } from "@/lib/server/handlers/shared";

export const runtime = "nodejs";

export const POST = withHandler(async (req, ctx) => {
  const { id } = await ctx!.params!;
  return json(await handleSharedIndexOne(req, id));
});
