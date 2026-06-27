import { json, withHandler } from "@/lib/server/http";
import { handleChat } from "@/lib/server/handlers/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = withHandler(async (req) => json(await handleChat(req)));
