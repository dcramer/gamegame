# GameGame Workers - Vite Setup

This project now uses the modern **Vite + Cloudflare Workers** development stack for the best DX.

## Quick Start

```bash
# Install dependencies
pnpm install

# Initialize the database (first time only)
pnpm setup

# Start dev server
pnpm dev

# Access the app
open http://localhost:4000
```

## What Changed

### Before (Old Setup)
- Separate `wrangler dev` for Worker backend
- Separate Vite dev server for React client (or manual rebuilds)
- Proxying between two servers
- No hot module replacement for client code
- Build step required before running dev server

### After (New Setup)
- ✅ **Single `pnpm dev` command** - one server for everything
- ⚡ **Instant HMR** - React changes update in milliseconds
- 🔧 **Full Workers runtime** - D1, KV, R2, Vectorize, Queues all available
- 🎯 **Unified architecture** - Client and API in one dev server
- 🚀 **Fast startup** - No build step needed

## Development Workflow

### Starting Development
```bash
pnpm dev
```

This starts Vite with the Cloudflare plugin, which:
- Serves the React SPA at http://localhost:4000
- Runs the Hono Worker backend with full bindings
- Enables instant HMR for client code
- Auto-reloads server code on changes

### Database Setup

The local D1 database is stored in `.wrangler/state/v3/d1/`.

**First time setup:**
```bash
# Apply migrations using Wrangler
pnpm setup

# Then start the dev server
pnpm dev
```

**Reset database:**
```bash
rm -rf .wrangler/state/v3/d1
pnpm setup  # Recreates and migrates DB
pnpm dev
```

**The proper way:** This uses `wrangler d1 migrations apply --local`, which is the official Drizzle + D1 workflow. The Vite plugin and Wrangler share the same `.wrangler/` persistence directory.

### Making Changes

**Client Code (Hot Module Replacement)**
Edit any file in `client/src/`:
- Changes appear instantly (< 100ms)
- No page refresh needed
- React state preserved

**Server Code (Auto-reload)**
Edit any file in `src/`:
- Server automatically reloads (~ 1-2 seconds)
- Preserves database state

**Config Changes**
Changes to `vite.config.ts` or `wrangler.toml`:
- Requires manual restart: Ctrl+C and `pnpm dev`

## Project Structure

```
workers/
├── client/                    # React SPA
│   ├── src/
│   │   ├── pages/            # Page components
│   │   │   ├── GameList.tsx
│   │   │   ├── GameDetail.tsx
│   │   │   ├── Admin.tsx
│   │   │   └── Login.tsx
│   │   ├── App.tsx           # React Router setup
│   │   └── main.tsx          # Entry point
│   ├── index.html            # HTML template
│   └── .wrangler/            # Vite's persistence (D1, KV, R2)
├── src/                      # Worker backend
│   ├── index.tsx             # Hono app + routes
│   ├── routes/api/           # API endpoints
│   ├── middleware/           # Auth, rate limiting
│   └── lib/                  # Business logic
├── vite.config.ts            # Vite + Cloudflare config
├── wrangler.toml             # Worker bindings
└── scripts/init-db.sh        # Database initialization
```

## Environment Variables

Create `.dev.vars` in the project root:

```bash
OPENAI_API_KEY=sk-...
MISTRAL_API_KEY=...
JWT_SECRET=your-secret-here
```

These are automatically loaded by the Vite dev server.

## Common Tasks

### Add a new migration
```bash
# 1. Edit schema in src/lib/db/schema/d1.ts

# 2. Generate migration
pnpm db:generate

# 3. Restart dev server to pick up migration
pnpm dev

# 4. Apply to local DB
pnpm db:migrate:local

# 5. Restart dev server again
pnpm dev

# 6. Deploy to production later
pnpm db:migrate:remote
```

### Type checking
```bash
pnpm type-check
```

### Build for production
```bash
pnpm build
```

### Deploy
```bash
# Build and deploy
pnpm deploy
```

## Troubleshooting

### "No such table" errors

The database needs to be initialized:
```bash
pnpm setup
```

### Port 4000 already in use

Kill the existing process:
```bash
lsof -ti:4000 | xargs kill
pnpm dev
```

### HMR not working

1. Check the browser console for errors
2. Restart the dev server
3. Clear `.vite` cache: `rm -rf node_modules/.vite`

### Database changes not persisting

The database is stored in `client/.wrangler/state/`. Don't delete this directory unless you want to reset.

## Key Differences from Next.js Version

This is the **Workers version** of GameGame. Key differences:

| Feature | Next.js (main) | Workers (this) |
|---------|---------------|----------------|
| **Runtime** | Node.js | V8 isolates |
| **Database** | PostgreSQL + pgvector | D1 (SQLite) + Vectorize |
| **Storage** | Vercel Blob | Cloudflare R2 |
| **Cache** | Redis | KV |
| **Dev Server** | Next.js dev | Vite + Cloudflare plugin |
| **Deployment** | Vercel | Cloudflare Workers |

## Further Reading

- [Cloudflare Vite Plugin Docs](https://developers.cloudflare.com/workers/vite-plugin/)
- [Vite HMR API](https://vite.dev/guide/api-hmr.html)
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
