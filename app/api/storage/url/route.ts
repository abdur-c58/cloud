import { json, withHandler } from "@/lib/server/http";
import { handleMediaUrl } from "@/lib/server/handlers/storage";

export const runtime = "nodejs";
export const GET = withHandler(async (req) => json(await handleMediaUrl(req)));
