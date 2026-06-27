import { json, withHandler } from "@/lib/server/http";
import { handleLocked } from "@/lib/server/handlers/folders";

export const runtime = "nodejs";
export const GET = withHandler(async (req) => json(await handleLocked(req)));
