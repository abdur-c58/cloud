import { json, withHandler } from "@/lib/server/http";
import { handleSharedUpload } from "@/lib/server/handlers/shared";

export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = withHandler(async (req, ctx) => {
  const { id } = await ctx!.params!;
  return json(await handleSharedUpload(req, id));
});
