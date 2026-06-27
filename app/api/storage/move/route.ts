import { json, withHandler } from "@/lib/server/http";
import { handleMove } from "@/lib/server/handlers/storage";

export const runtime = "nodejs";
export const POST = withHandler(async (req) => json(await handleMove(req)));
