import { json, withHandler } from "@/lib/server/http";
import { handleSharedUploadUrl } from "@/lib/server/handlers/shared";

export const runtime = "nodejs";

export const POST = withHandler(async (req, ctx) => {
  const { id } = await ctx!.params!;
  return json(await handleSharedUploadUrl(req, id));
});
