import { auth } from "@/auth";
import { upsertUser } from "@/lib/server/db";
import { json, withHandler } from "@/lib/server/http";
import { ApiError, requireUser } from "@/lib/server/security";

export const runtime = "nodejs";

export const POST = withHandler(async (req) => {
  const user = await requireUser(req);
  const session = await auth();
  if (!session?.user?.id || session.user.id !== user.userId) {
    throw new ApiError(401, "Google session required.");
  }

  const email = session.user.email ?? user.email;
  if (!email) throw new ApiError(400, "Missing user email.");

  const image = session.user.image?.trim() || null;
  await upsertUser(user.userId, email, session.user.name ?? null, image);

  return json({
    ok: true,
    image,
    name: session.user.name ?? null,
  });
});
