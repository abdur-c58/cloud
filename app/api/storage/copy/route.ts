import { json, withHandler } from "@/lib/server/http";
import { handleCopy } from "@/lib/server/handlers/storage";

export const runtime = "nodejs";
export const maxDuration = 120;

export const POST = withHandler(async (req) => json(await handleCopy(req)));
