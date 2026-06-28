`personal cloud use`

 private cloud for **photos, videos and audio** — backed by Cloudflare R2,

![stack](https://img.shields.io/badge/app-Next.js%2016-black) ![stack](https://img.shields.io/badge/storage-Cloudflare%20R2-f38020) ![stack](https://img.shields.io/badge/db-Supabase%20Postgres-3ECF8E)

```
Browser (Next.js 16)
   │  Bearer session JWT + X-Folder-Token
   ▼
Next.js API routes (lib/server)  ──►  Cloudflare R2
   │
   └─►  Supabase Postgres
```

- **UI** — `app/`, `components/`, `lib/api.ts`
- **Server** — `lib/server/` + `app/api/**` (TypeScript, runs on Vercel Node.js)



Next.js 16 · React 19 · Auth.js · AWS SDK v3 (R2) · jose · bcryptjs · pg · OpenAI · Supabase · Cloudflare R2
