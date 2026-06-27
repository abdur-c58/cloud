import { json, withHandler } from "@/lib/server/http";
import { handleSharedRevokeCode } from "@/lib/server/handlers/shared";

export const runtime = "nodejs";

export const DELETE = withHandler(async (req, ctx) => {
  const { id, code } = await ctx!.params!;
  return json(await handleSharedRevokeCode(req, id, code));
});
