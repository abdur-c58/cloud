import { json, withHandler } from "@/lib/server/http";
import { handleUnlock } from "@/lib/server/handlers/folders";

export const runtime = "nodejs";
export const POST = withHandler(async (req) => json(await handleUnlock(req)));
