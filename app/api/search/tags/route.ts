import { json, withHandler } from "@/lib/server/http";
import { handleSetTags } from "@/lib/server/handlers/search";

export const runtime = "nodejs";
export const POST = withHandler(async (req) => json(await handleSetTags(req)));
