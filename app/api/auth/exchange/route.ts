import { auth } from "@/auth";
import { upsertUser } from "@/lib/server/db";
import { json, withHandler } from "@/lib/server/http";
import {
  createSessionToken,
  verifyGateToken,
  ApiError,
} from "@/lib/server/security";

export const runtime = "nodejs";

export const POST = withHandler(async (req) => {
  const session = await auth();
  if (!session?.user?.id) {
    throw new ApiError(401, "Sign in with Google first.");
  }

  const body = await req.json().catch(() => ({}));
  const gateToken = typeof body.gateToken === "string" ? body.gateToken : "";
  if (!gateToken) {
    throw new ApiError(400, "Master password gate required.");
  }

  try {
    await verifyGateToken(gateToken);
  } catch {
    throw new ApiError(401, "Invalid or expired gate.");
  }

  const email = session.user.email ?? "";
  if (!email) throw new ApiError(400, "Missing user email.");

  await upsertUser(session.user.id, email, session.user.name ?? null, session.user.image ?? null);
  const { token, expiresAt } = await createSessionToken(session.user.id, email);
  return json({ token, expires_at: expiresAt });
});
