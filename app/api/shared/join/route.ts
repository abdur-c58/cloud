import { json, withHandler } from "@/lib/server/http";
import { handleJoinShared } from "@/lib/server/handlers/shared";

export const runtime = "nodejs";

export const POST = withHandler(async (req) => json(await handleJoinShared(req)));
