import { json, withHandler } from "@/lib/server/http";
import { handleLock } from "@/lib/server/handlers/folders";

export const runtime = "nodejs";
export const POST = withHandler(async (req) => json(await handleLock(req)));
