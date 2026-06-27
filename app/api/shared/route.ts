import { json, withHandler } from "@/lib/server/http";
import { handleCreateShared, handleJoinShared, handleListShared } from "@/lib/server/handlers/shared";

export const runtime = "nodejs";

export const GET = withHandler(async (req) => json(await handleListShared(req)));

export const POST = withHandler(async (req) => json(await handleCreateShared(req)));
