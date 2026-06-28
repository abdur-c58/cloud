import { json, withHandler } from "@/lib/server/http";
import { handleSharedLeave } from "@/lib/server/handlers/shared";

export const runtime = "nodejs";

export const POST = withHandler(async (req, ctx) => {
  const { id } = await ctx!.params!;
  return json(await handleSharedLeave(req, id));
});
