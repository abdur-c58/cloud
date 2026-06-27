import { json, withHandler } from "@/lib/server/http";
import { handleDeleteSharedFolder } from "@/lib/server/handlers/shared";

export const runtime = "nodejs";

export const DELETE = withHandler(async (req, ctx) => {
  const { id } = await ctx!.params!;
  return json(await handleDeleteSharedFolder(req, id));
});
