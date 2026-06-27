import { json, withHandler } from "@/lib/server/http";
import { createGateToken, verifyAppPassword, ApiError } from "@/lib/server/security";

export const runtime = "nodejs";

export const POST = withHandler(async (req) => {
  const body = await req.json();
  if (!verifyAppPassword(body.password || "")) {
    throw new ApiError(401, "Incorrect password.");
  }
  const { token, expiresAt } = await createGateToken();
  return json({ token, expires_at: expiresAt });
});
