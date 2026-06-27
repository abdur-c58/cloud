import { json, withHandler } from "@/lib/server/http";
import { handleSearch } from "@/lib/server/handlers/search";

export const runtime = "nodejs";
export const GET = withHandler(async (req) => json(await handleSearch(req)));
