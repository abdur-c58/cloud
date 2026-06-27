import {
  S3Client,
  ListObjectsV2Command,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  CopyObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  PutBucketCorsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "./config";
import { classify, contentTypeFor } from "./media";

const KEY_SAFE = /[\x00-\x1f\x7f]/;

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageError";
  }
}

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!config.r2Configured) {
    throw new StorageError(
      "R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME.",
    );
  }
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: config.r2Endpoint,
      credentials: {
        accessKeyId: config.r2AccessKeyId,
        secretAccessKey: config.r2SecretAccessKey,
      },
    });
  }
  return client;
}

export function normalizePrefix(prefix: string): string {
  const trimmed = (prefix || "").trim().replace(/^\/+/, "");
  if (!trimmed) return "";
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

export function sanitizeSegment(name: string): string {
  let n = (name || "").trim().replace(/\\/g, "/");
  n = n.split("/").pop() || "";
  if (!n || n === "." || n === ".." || KEY_SAFE.test(n)) {
    throw new StorageError("Invalid name.");
  }
  return n;
}

export function assertSafeKey(key: string): void {
  if (!key || key.split("/").includes("..") || KEY_SAFE.test(key)) {
    throw new StorageError("Invalid key.");
  }
}

export function folderOf(key: string): string {
  const k = key.replace(/\/$/, "");
  if (!k.includes("/")) return "";
  return `${k.split("/").slice(0, -1).join("/")}/`;
}

export type StorageItem = {
  key: string;
  name: string;
  type: string;
  size: number | null;
  last_modified: string | null;
};

export async function listDir(prefix = ""): Promise<{
  prefix: string;
  folders: StorageItem[];
  files: StorageItem[];
}> {
  const normalized = normalizePrefix(prefix);
  const c = getClient();
  const folders: StorageItem[] = [];
  const files: StorageItem[] = [];
  let token: string | undefined;

  do {
    const res = await c.send(
      new ListObjectsV2Command({
        Bucket: config.r2BucketName,
        Prefix: normalized,
        Delimiter: "/",
        ContinuationToken: token,
      }),
    );
    for (const cp of res.CommonPrefixes || []) {
      const key = cp.Prefix || "";
      if (!key) continue;
      folders.push({
        key,
        name: key.slice(normalized.length).replace(/\/$/, ""),
        type: "folder",
        size: null,
        last_modified: null,
      });
    }
    for (const obj of res.Contents || []) {
      const key = obj.Key || "";
      if (!key || key === normalized || key.endsWith("/")) continue;
      files.push({
        key,
        name: key.slice(normalized.length),
        type: classify(key),
        size: obj.Size ?? null,
        last_modified: obj.LastModified?.toISOString() ?? null,
      });
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);

  folders.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  files.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return { prefix: normalized, folders, files };
}

export async function listAll(prefix = ""): Promise<
  Array<{ key: string; size: number | null; last_modified: string | null }>
> {
  const normalized = normalizePrefix(prefix);
  const c = getClient();
  const out: Array<{ key: string; size: number | null; last_modified: string | null }> = [];
  let token: string | undefined;

  do {
    const res = await c.send(
      new ListObjectsV2Command({
        Bucket: config.r2BucketName,
        Prefix: normalized,
        ContinuationToken: token,
      }),
    );
    for (const obj of res.Contents || []) {
      const key = obj.Key || "";
      if (!key || key.endsWith("/")) continue;
      out.push({
        key,
        size: obj.Size ?? null,
        last_modified: obj.LastModified?.toISOString() ?? null,
      });
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);

  return out;
}

export async function headObject(key: string): Promise<{
  size: number | null;
  last_modified: string | null;
  content_type: string | null;
} | null> {
  assertSafeKey(key);
  try {
    const res = await getClient().send(new HeadObjectCommand({ Bucket: config.r2BucketName, Key: key }));
    return {
      size: res.ContentLength ?? null,
      last_modified: res.LastModified?.toISOString() ?? null,
      content_type: res.ContentType ?? null,
    };
  } catch {
    return null;
  }
}

export async function objectExists(key: string): Promise<boolean> {
  return (await headObject(key)) !== null;
}

export async function createFolder(prefix: string, name: string): Promise<string> {
  const folderName = sanitizeSegment(name);
  const key = `${normalizePrefix(prefix)}${folderName}/`;
  await getClient().send(
    new PutObjectCommand({ Bucket: config.r2BucketName, Key: key, Body: new Uint8Array() }),
  );
  return key;
}

export async function deleteKey(key: string): Promise<string[]> {
  assertSafeKey(key);
  const c = getClient();
  const deleted: string[] = [];

  if (key.endsWith("/")) {
    const objects = await listAll(key);
    const keys = [...objects.map((o) => ({ Key: o.key })), { Key: key }];
    for (let i = 0; i < keys.length; i += 1000) {
      const batch = keys.slice(i, i + 1000);
      await c.send(
        new DeleteObjectsCommand({
          Bucket: config.r2BucketName,
          Delete: { Objects: batch },
        }),
      );
      deleted.push(...batch.map((b) => b.Key!));
    }
  } else {
    await c.send(new DeleteObjectCommand({ Bucket: config.r2BucketName, Key: key }));
    deleted.push(key);
  }
  return deleted;
}

export async function copyKey(src: string, dst: string): Promise<void> {
  assertSafeKey(src);
  assertSafeKey(dst);
  await copy(src, dst);
}

export async function copyTree(srcPrefix: string, dstPrefix: string): Promise<string[]> {
  assertSafeKey(srcPrefix);
  assertSafeKey(dstPrefix);
  const src = normalizePrefix(srcPrefix);
  const dst = normalizePrefix(dstPrefix);
  const copied: string[] = [];
  const objects = await listAll(src);
  for (const obj of objects) {
    const rel = obj.key.slice(src.length);
    const target = `${dst}${rel}`;
    await copy(obj.key, target);
    copied.push(target);
  }
  if (src.endsWith("/") || objects.length === 0) {
    await getClient().send(
      new PutObjectCommand({ Bucket: config.r2BucketName, Key: dst, Body: new Uint8Array() }),
    );
    copied.push(dst);
  }
  return copied;
}

export function sanitizeRelativePath(relative: string): string {
  const parts = relative.replace(/\\/g, "/").split("/").filter(Boolean);
  if (!parts.length) throw new StorageError("Invalid path.");
  return parts.map((p) => sanitizeSegment(p)).join("/");
}

async function copy(src: string, dst: string): Promise<void> {
  await getClient().send(
    new CopyObjectCommand({
      Bucket: config.r2BucketName,
      CopySource: `${config.r2BucketName}/${src}`,
      Key: dst,
    }),
  );
}

export async function moveKey(src: string, dst: string): Promise<string> {
  assertSafeKey(src);
  assertSafeKey(dst);
  if (src === dst) throw new StorageError("Source and destination are identical.");
  const c = getClient();

  if (src.endsWith("/")) {
    if (dst.startsWith(src)) throw new StorageError("Cannot move a folder into itself.");
    const objects = await listAll(src);
    for (const obj of objects) {
      const rel = obj.key.slice(src.length);
      await copy(obj.key, `${dst}${rel}`);
    }
    await c.send(
      new PutObjectCommand({ Bucket: config.r2BucketName, Key: dst, Body: new Uint8Array() }),
    );
    await deleteKey(src);
    return dst;
  }

  await copy(src, dst);
  await c.send(new DeleteObjectCommand({ Bucket: config.r2BucketName, Key: src }));
  return dst;
}

export async function presignGet(key: string, download = false): Promise<string> {
  assertSafeKey(key);
  const filename = key.split("/").pop() || "file";
  const getCmd = new GetObjectCommand({
    Bucket: config.r2BucketName,
    Key: key,
    ResponseContentDisposition: download
      ? `attachment; filename="${filename}"`
      : "inline",
    ResponseContentType: download ? undefined : contentTypeFor(filename),
  });
  return getSignedUrl(getClient(), getCmd, { expiresIn: config.presignTtlSeconds });
}

export async function presignPut(key: string): Promise<string> {
  assertSafeKey(key);
  const cmd = new PutObjectCommand({ Bucket: config.r2BucketName, Key: key });
  return getSignedUrl(getClient(), cmd, { expiresIn: config.presignTtlSeconds });
}

export async function getObjectBytes(key: string, maxBytes = 8 * 1024 * 1024): Promise<Buffer | null> {
  assertSafeKey(key);
  try {
    const head = await getClient().send(
      new HeadObjectCommand({ Bucket: config.r2BucketName, Key: key }),
    );
    if (head.ContentLength && head.ContentLength > maxBytes) return null;
    const res = await getClient().send(
      new GetObjectCommand({ Bucket: config.r2BucketName, Key: key }),
    );
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) return null;
    return Buffer.from(bytes);
  } catch {
    return null;
  }
}

export async function putObject(key: string, body: Buffer | Uint8Array, contentType?: string): Promise<void> {
  assertSafeKey(key);
  await getClient().send(
    new PutObjectCommand({
      Bucket: config.r2BucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function ensureBucketCors(origins: string[]): Promise<void> {
  if (!config.r2Configured) return;
  try {
    await getClient().send(
      new PutBucketCorsCommand({
        Bucket: config.r2BucketName,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedHeaders: ["*"],
              AllowedMethods: ["GET", "PUT", "POST", "HEAD", "DELETE"],
              AllowedOrigins: origins.length ? origins : ["http://localhost:3000"],
              ExposeHeaders: ["ETag", "Content-Length"],
              MaxAgeSeconds: 86400,
            },
          ],
        },
      }),
    );
  } catch {
    // CORS may be configured manually in Cloudflare dashboard.
  }
}
