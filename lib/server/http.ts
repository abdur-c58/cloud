import { NextResponse } from "next/server";
import { ApiError } from "./security";
import { StorageError } from "./r2";

export const runtime = "nodejs";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function folderToken(req: Request): string | null {
  return req.headers.get("x-folder-token");
}

export function withHandler(
  fn: (req: Request, ctx?: { params?: Promise<Record<string, string>> }) => Promise<Response>,
) {
  return async (req: Request, ctx?: { params?: Promise<Record<string, string>> }) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof ApiError) {
        return NextResponse.json({ detail: e.detail }, { status: e.status });
      }
      if (e instanceof StorageError) {
        return NextResponse.json({ detail: e.message }, { status: 400 });
      }
      console.error(e);
      return NextResponse.json({ detail: "Internal server error." }, { status: 500 });
    }
  };
}
