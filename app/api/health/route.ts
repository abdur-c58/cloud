import { config } from "@/lib/server/config";
import { json, withHandler } from "@/lib/server/http";
import { visualIndexMode } from "@/lib/server/visual-index";

export const runtime = "nodejs";

export const GET = withHandler(async () =>
  json({
    ok: true,
    version: config.version,
    r2_configured: config.r2Configured,
    openai_configured: config.openaiConfigured,
    supabase_configured: config.supabaseConfigured,
    visual_index_mode: visualIndexMode(),
  }),
);
