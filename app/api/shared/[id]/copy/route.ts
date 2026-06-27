import { json, withHandler } from "@/lib/server/http";
import { handleSharedCopy } from "@/lib/server/handlers/shared";

export const runtime = "nodejs";
export const maxDuration = 120;

export const POST = withHandler(async (req, ctx) => {
  const { id } = await ctx!.params!;
  return json(await handleSharedCopy(req, id));
});
