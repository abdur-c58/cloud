import { json, withHandler } from "@/lib/server/http";
import { handleUpload } from "@/lib/server/handlers/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = withHandler(async (req) => json(await handleUpload(req)));
