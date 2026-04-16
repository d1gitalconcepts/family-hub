# Family Hub — frontend

React + Vite app that powers the Family Hub dashboard UI.

See the [root README](../README.md) for full setup, architecture, and deployment instructions.

## Local dev

```bash
cp .env.example .env
# Add your VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

## Build

```bash
npm run build
```

Output goes to `dist/`. Deploy to Cloudflare Pages, Vercel, or any static host.
