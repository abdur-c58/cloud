import type { PoolConfig } from "pg";
import { parse as parseConnectionString } from "pg-connection-string";

function env(key: string, fallback = ""): string {
  return process.env[key]?.trim() || fallback;
}

function normalizeConnectionString(raw: string): string {
  let s = raw.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  if (s.startsWith("postgres://")) {
    s = `postgresql://${s.slice("postgres://".length)}`;
  }
  return s;
}

function looksLikePostgresUri(raw: string): boolean {
  const s = normalizeConnectionString(raw);
  return /^postgresql:\/\/.+@.+/.test(s);
}

function isUsableHost(host: string | undefined | null): boolean {
  if (!host || host === "base") return false;
  return host.includes(".") || host === "localhost" || host.startsWith("/");
}

function poolConfigFromConnectionString(connectionString: string): PoolConfig {
  const parsed = parseConnectionString(normalizeConnectionString(connectionString));
  if (!isUsableHost(parsed.host)) {
    throw new Error("connection string missing a valid database host");
  }
  return {
    host: parsed.host ?? undefined,
    port: parsed.port ? parseInt(String(parsed.port), 10) : undefined,
    user: parsed.user ?? undefined,
    password: parsed.password ?? undefined,
    database: parsed.database ?? undefined,
    ssl: { rejectUnauthorized: false },
    max: 5,
  };
}

/** Build pool config from discrete env vars — no URL parsing (safe for special chars in password). */
function poolConfigFromEnvParts(): PoolConfig {
  const password = env("SUPABASE_DB_PASSWORD");
  if (!password) {
    throw new Error(
      "Database not configured. Set SUPABASE_PROJECT_ID + SUPABASE_DB_PASSWORD, or a valid DATABASE_URL.",
    );
  }

  const projectId = env("SUPABASE_PROJECT_ID");
  const hostOverride = env("SUPABASE_DB_HOST");

  if (hostOverride) {
    return {
      host: hostOverride,
      port: parseInt(env("SUPABASE_DB_PORT", "6543"), 10),
      user: env("SUPABASE_DB_USER") || (projectId ? `postgres.${projectId}` : "postgres"),
      password,
      database: env("SUPABASE_DB_NAME", "postgres"),
      ssl: { rejectUnauthorized: false },
      max: 5,
    };
  }

  if (!projectId) {
    throw new Error(
      "Database not configured. Set SUPABASE_PROJECT_ID + SUPABASE_DB_PASSWORD, or fix DATABASE_URL.",
    );
  }

  return {
    host: `db.${projectId}.supabase.co`,
    port: 5432,
    user: "postgres",
    password,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
    max: 5,
  };
}

/** Resolve Postgres pool settings — skips bad DATABASE_URL, never URL-parses the fallback. */
export function getDatabasePoolConfig(): PoolConfig {
  const direct =
    env("DATABASE_URL") || env("POSTGRES_URL") || env("POSTGRES_PRISMA_URL");

  if (direct && looksLikePostgresUri(direct)) {
    try {
      return poolConfigFromConnectionString(direct);
    } catch (err) {
      console.warn(
        "[db] DATABASE_URL invalid — using SUPABASE_* env vars instead:",
        err instanceof Error ? err.message : err,
      );
    }
  } else if (direct) {
    console.warn(
      "[db] DATABASE_URL is not a postgres URI (check for quotes or a password pasted without the full URL) — using SUPABASE_* env vars instead.",
    );
  }

  return poolConfigFromEnvParts();
}

export function isDatabaseConfigured(): boolean {
  return Boolean(
    env("DATABASE_URL") ||
      env("POSTGRES_URL") ||
      env("POSTGRES_PRISMA_URL") ||
      (env("SUPABASE_DB_PASSWORD") && (env("SUPABASE_DB_HOST") || env("SUPABASE_PROJECT_ID"))),
  );
}
