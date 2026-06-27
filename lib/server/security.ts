import { timingSafeEqual } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { config } from "./config";

export const GATE_AUDIENCE = "gate";
export const SESSION_AUDIENCE = "session";
export const FOLDER_AUDIENCE = "folder-unlock";

const secret = () => new TextEncoder().encode(config.jwtSecret);

export type UserCtx = { userId: string; email: string };

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, hashed: string): boolean {
  try {
    return bcrypt.compareSync(password, hashed);
  } catch {
    return false;
  }
}

export function verifyAppPassword(password: string): boolean {
  const a = Buffer.from(password, "utf8");
  const b = Buffer.from(config.appPassword, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function createGateToken(): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = Math.floor(Date.now() / 1000) + config.gateTtlMinutes * 60;
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(GATE_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secret());
  return { token, expiresAt };
}

export async function createSessionToken(
  userId: string,
  email: string,
): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = Math.floor(Date.now() / 1000) + config.sessionTtlMinutes * 60;
  const token = await new SignJWT({ sub: userId, email })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secret());
  return { token, expiresAt };
}

export async function createFolderToken(
  userId: string,
  folders: string[],
): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = Math.floor(Date.now() / 1000) + config.sessionTtlMinutes * 60;
  const token = await new SignJWT({ sub: userId, folders: [...new Set(folders)].sort() })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(FOLDER_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secret());
  return { token, expiresAt };
}

async function decode(token: string, audience: string) {
  const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"], audience });
  return payload;
}

export async function verifyGateToken(token: string): Promise<void> {
  await decode(token, GATE_AUDIENCE);
}

export async function unlockedFolders(
  folderToken: string | null,
  userId: string,
): Promise<Set<string>> {
  if (!folderToken) return new Set();
  try {
    const payload = await decode(folderToken, FOLDER_AUDIENCE);
    if (payload.sub !== userId) return new Set();
    const folders = payload.folders;
    return new Set(Array.isArray(folders) ? (folders as string[]) : []);
  } catch {
    return new Set();
  }
}

export async function requireUser(req: Request): Promise<UserCtx> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    throw new ApiError(401, "Not authenticated.");
  }
  const token = auth.slice(7);
  try {
    const payload = await decode(token, SESSION_AUDIENCE);
    const userId = payload.sub;
    if (!userId || typeof userId !== "string") {
      throw new ApiError(401, "Invalid session.");
    }
    return { userId, email: typeof payload.email === "string" ? payload.email : "" };
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(401, "Invalid or expired session.");
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string | Record<string, unknown>,
  ) {
    super(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
}
