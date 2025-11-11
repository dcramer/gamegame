# GameGame

An LLM-powered board game assistant that helps players understand game rules using RAG (Retrieval-Augmented Generation) with hybrid search.

## Quick Start

### Prerequisites
- Node.js 20+
- pnpm (`npm install -g pnpm`)
- Docker and Docker Compose

### Setup

```bash
# 1. Clone and install dependencies
git clone <repository-url>
cd gamegame
pnpm install

# 2. Start PostgreSQL
docker-compose up -d

# 3. Configure environment variables
cp .env.example .env.local
```

Edit `.env.local` and add your API keys:
```bash
# Required for core functionality
OPENAI_API_KEY=sk-...              # From platform.openai.com
MISTRAL_API_KEY=...                # From console.mistral.ai
AUTH_SECRET=...                    # Generate: npx auth secret
SESSION_SECRET=...                 # Generate: openssl rand -base64 32
AUTH_RESEND_KEY=...                # From resend.com (for magic link emails)

# Optional (falls back to local storage)
BLOB_READ_WRITE_TOKEN=...          # Vercel Blob for file storage
```

```bash
# 4. Initialize database (creates databases + runs migrations)
make setup

# 5. Create an admin user
make grant-admin
# Enter your email when prompted

# 6. Start development server
pnpm dev
```

Visit http://localhost:3000

### First Login

After starting the dev server, generate a magic link:
```bash
pnpm cli users login-url your-email@example.com
```
Click the link to sign in.

## Common Commands

### Development
```bash
pnpm dev              # Start dev server with Turbopack (http://localhost:3000)
pnpm build            # Production build
pnpm lint             # Run ESLint
pnpm type-check       # TypeScript type check without building
```

### Database Management
```bash
# Daily operations
make reset-db         # Drop and recreate databases (dev + test)
pnpm db:studio        # Open Drizzle Studio (GUI for database)
docker-compose ps     # Check if database is running

# Schema changes
pnpm db:generate      # Generate new migration from schema changes
make migrate          # Apply pending migrations
pnpm db:push          # Push schema directly (dev only, skips migrations)
```

### CLI Tools

The CLI handles common admin tasks without needing to write SQL:

```bash
# User management
pnpm cli users create user@example.com [--admin]
pnpm cli users grant-admin user@example.com
pnpm cli users login-url user@example.com

# Game management
pnpm cli games list
pnpm cli games create "Game Name" --slug game-slug

# Resource management
pnpm cli resources reprocess <resource-id> [--from=stage]
pnpm cli resources reprocess-all [--game=slug]
pnpm cli resources status <job-id>

# Interactive chat (test RAG system)
pnpm cli ask <game-slug> "How do I setup the game?"
```

### Testing
```bash
pnpm test             # Run tests in watch mode (TDD)
pnpm test:run         # Run tests once (CI mode)

# Test database must be running and migrated:
docker-compose up -d
make migrate-test
```

## Documentation

- **[CLAUDE.md](./CLAUDE.md)** - Complete architecture, development guide, and AI assistant context
- **[docs/testing.md](./docs/testing.md)** - Testing philosophy and guidelines
- **[docs/api-routes.md](./docs/api-routes.md)** - API documentation

## Tech Stack

- **Framework**: Next.js 16 with App Router, React 19
- **Database**: PostgreSQL with pgvector extension
- **ORM**: Drizzle ORM
- **AI**: OpenAI GPT-5, Mistral OCR
- **Storage**: Vercel Blob (falls back to local filesystem in dev)
- **Auth**: JWT sessions with magic link email authentication
- **Workflows**: Vercel Workflows for async PDF processing
- **Styling**: Tailwind CSS v4, Radix UI components

## Environment Variables

### Required Variables

| Variable | Description | How to Get |
|----------|-------------|------------|
| `DATABASE_URL` | PostgreSQL connection | Auto-configured: `postgres://postgres:postgres@localhost:5433/gamegame` |
| `OPENAI_API_KEY` | OpenAI API key for embeddings and chat | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| `MISTRAL_API_KEY` | Mistral API for PDF OCR | [console.mistral.ai/api-keys](https://console.mistral.ai/api-keys) |
| `AUTH_SECRET` | NextAuth session encryption | Generate: `npx auth secret` |
| `SESSION_SECRET` | JWT signing secret (32+ chars) | Generate: `openssl rand -base64 32` |
| `AUTH_RESEND_KEY` | Resend API for magic link emails | [resend.com/api-keys](https://resend.com/api-keys) |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob for file storage | Falls back to `./public/uploads` |
| `KV_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Vercel KV for rate limiting | Rate limiting disabled |
| `NEXT_PUBLIC_APP_URL` | Public app URL | `http://localhost:3000` |
| `SENTRY_DSN` | Error tracking (production) | Spotlight debugging UI |

See [.env.example](./.env.example) for complete list with descriptions.

## Troubleshooting

### Database won't start
```bash
# Check if port 5433 is already in use
lsof -i :5433

# Reset Docker containers
docker-compose down
docker-compose up -d
```

### Migrations fail
```bash
# Ensure database is running
docker-compose ps

# Reset database and re-run migrations
make reset-db
```

### "Module not found" errors
```bash
# Clear Next.js cache and reinstall
rm -rf .next node_modules
pnpm install
```

### Tests fail with database errors
```bash
# Ensure test database is created and migrated
make create-db-test
make migrate-test
```

## License

MIT
