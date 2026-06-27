import { json, withHandler } from "@/lib/server/http";
import { handleIndexOne } from "@/lib/server/handlers/storage";

export const runtime = "nodejs";
export const POST = withHandler(async (req) => json(await handleIndexOne(req)));
