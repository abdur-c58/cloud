import { json, withHandler } from "@/lib/server/http";
import { handleReindex } from "@/lib/server/handlers/search";

export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = withHandler(async (req) => json(await handleReindex(req)));
