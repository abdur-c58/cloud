# GigaChad Cloud

Your private cloud for **photos, videos and audio** — backed by Cloudflare R2,
with a secure Next.js API and a fast, modern UI. **Deploys entirely on Vercel.**

![stack](https://img.shields.io/badge/app-Next.js%2016-black) ![stack](https://img.shields.io/badge/storage-Cloudflare%20R2-f38020) ![stack](https://img.shields.io/badge/db-Supabase%20Postgres-3ECF8E)

## Features

- 📁 **Folders & organisation** — nested folders, move, rename, grid/list views, sort, breadcrumbs.
- 🖼️ **Every format** — images, video and audio with a built-in lightbox/player (range‑streamed from R2).
- 🔒 **Password-protected folders** — bcrypt-hashed per-folder passwords; locked folders need an unlock token.
- 🛡️ **Security** — R2 credentials never reach the browser. Master password + Google OAuth per user.
- 🔎 **Indexing & search** — Supabase Postgres index for instant search by name, tags and captions.
- 🤖 **OpenAI features** — chat assistant + auto-tagging for photos. *(Optional.)*
- 🚀 **Direct-to-R2 uploads** — browser uploads straight to R2 with server fallback.

## Architecture

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

## Local setup

```powershell
npm install
cp .env.example .env.local   # fill in secrets (single env file)
npm run dev
```

Open <http://localhost:3000>. Sign in: master password → Google.

All secrets live in **`.env.local`** only. See **`.env.example`** for every variable.

## Deploy to Vercel

This project is a **single Next.js app**. No `vercel.json` or separate backend required.

1. Push to GitHub and import the repo in [Vercel](https://vercel.com).
2. **Project settings:** Root Directory empty, Framework Preset **Next.js**.
3. Copy every variable from `.env.example` into Vercel → Environment Variables.
4. Add your Vercel URL to **Google OAuth** redirect URIs:
   `https://your-app.vercel.app/api/auth/callback/google`
5. Configure **R2 CORS** in Cloudflare to allow your Vercel domain.

## First run

1. Master password → Google sign-in.
2. **Upload** media (direct to R2, with server fallback).
3. **Reindex** (↻) to refresh search/stats.

## Tech

Next.js 16 · React 19 · Auth.js · AWS SDK v3 (R2) · jose · bcryptjs · pg · OpenAI · Supabase · Cloudflare R2
