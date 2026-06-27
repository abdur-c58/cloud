function env(key: string, fallback = ""): string {
  return process.env[key]?.trim() || fallback;
}

function envInt(key: string, fallback: number): number {
  const v = process.env[key];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  get r2AccountId() {
    return env("R2_ACCOUNT_ID");
  },
  get r2AccessKeyId() {
    return env("R2_ACCESS_KEY_ID");
  },
  get r2SecretAccessKey() {
    return env("R2_SECRET_ACCESS_KEY");
  },
  get r2BucketName() {
    return env("R2_BUCKET_NAME");
  },
  get r2Endpoint() {
    return `https://${config.r2AccountId}.r2.cloudflarestorage.com`;
  },
  get r2Configured() {
    return Boolean(
      config.r2AccountId &&
        config.r2AccessKeyId &&
        config.r2SecretAccessKey &&
        config.r2BucketName,
    );
  },
  get appPassword() {
    return env("APP_PASSWORD", "change-me-please");
  },
  get jwtSecret() {
    return env("JWT_SECRET", "please-generate-a-long-random-secret");
  },
  get gateTtlMinutes() {
    return envInt("GATE_TTL_MINUTES", 15);
  },
  get sessionTtlMinutes() {
    return envInt("SESSION_TTL_MINUTES", 60 * 24 * 7);
  },
  get presignTtlSeconds() {
    return envInt("PRESIGN_TTL_SECONDS", 3600);
  },
  get openaiApiKey() {
    return env("OPENAI_API_KEY");
  },
  get openaiModel() {
    return env("OPENAI_MODEL", "gpt-4o-mini");
  },
  get openaiConfigured() {
    return Boolean(config.openaiApiKey);
  },
  get databaseUrl() {
    if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
    const projectId = env("SUPABASE_PROJECT_ID");
    const password = env("SUPABASE_DB_PASSWORD");
    if (!projectId || !password) {
      throw new Error(
        "Database not configured. Set DATABASE_URL or SUPABASE_PROJECT_ID + SUPABASE_DB_PASSWORD.",
      );
    }
    return `postgresql://postgres:${encodeURIComponent(password)}@db.${projectId}.supabase.co:5432/postgres`;
  },
  get supabaseConfigured() {
    return Boolean(process.env.DATABASE_URL || (env("SUPABASE_PROJECT_ID") && env("SUPABASE_DB_PASSWORD")));
  },
  get version() {
    return "1.0.0";
  },
};
