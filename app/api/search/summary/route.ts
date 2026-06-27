import { json, withHandler } from "@/lib/server/http";
import { handleSummary } from "@/lib/server/handlers/search";

export const runtime = "nodejs";
export const GET = withHandler(async (req) => json(await handleSummary(req)));
