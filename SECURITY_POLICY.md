# API Security Policy

This document outlines the authentication requirements for all API routes in the GameGame Next.js application.

## Authentication Helpers

Located in `/lib/auth/helpers.ts`:
- `requireAuth()` - Requires any authenticated user
- `requireAdmin()` - Requires admin user (throws 401 if not admin)

## Route Authentication Status

### Admin-Only Routes (require `requireAdmin()`)

#### BGG Integration Routes
- `POST /api/bgg/games/:bggId/import` - Import game from BGG
- `GET /api/bgg/search` - Search BGG for games
- `GET /api/bgg/extract-id` - Extract BGG ID from URL
- `GET /api/bgg/games/:bggId` - Get BGG game details

#### Game Management Routes
- `POST /api/games` - Create new game
- `PATCH /api/games/:gameIdOrSlug` - Update game
- `DELETE /api/games/:gameIdOrSlug` - Delete game
- `POST /api/games/:gameIdOrSlug/resources` - Upload resource

#### Resource Management Routes
- `PATCH /api/resources/:resourceId` - Update resource metadata
- `DELETE /api/resources/:resourceId` - Delete resource

#### Attachment Management Routes
- `PATCH /api/attachments/:attachmentId` - Update attachment metadata

#### Upload Routes
- `POST /api/upload` - Generic file upload endpoint

### Public Routes (no authentication required)

#### Game Information Routes
- `GET /api/games` - List all games
- `GET /api/games/:gameIdOrSlug` - Get single game details
- `GET /api/games/:gameIdOrSlug/resources` - List game resources
- `GET /api/games/:gameIdOrSlug/attachments` - List game attachments
- `POST /api/games/:gameIdOrSlug/chat` - Chat with game assistant

#### Resource Routes
- `GET /api/resources/:resourceId` - Get resource details
- `GET /api/resources/:resourceId/attachments` - List resource attachments

#### Attachment Routes
- `GET /api/attachments/:attachmentId` - Get attachment details

#### Health & System Routes
- `GET /api/health` - Health check endpoint

### Workflow Routes (internal)
- `POST /api/workflows/process-resource` - Trigger resource processing workflow
- `POST /api/workflows/cleanup-stalled-jobs` - Cleanup stalled processing jobs
- `POST /api/workflows/cleanup-orphaned-blobs` - Cleanup orphaned blob storage

**Note**: Workflow routes are internal endpoints triggered by the application. They should be protected by API keys or internal authentication in production.

## Server Actions Authentication Status

All server actions in `/lib/actions/` properly use `requireAdmin()`:

### Games Actions (`lib/actions/games.ts`)
- `createGame()` - Protected
- `updateGame()` - Protected
- `deleteGame()` - Protected

### Resources Actions (`lib/actions/resources.ts`)
- `uploadResource()` - Protected
- `reprocessResource()` - Protected
- `updateResource()` - Protected
- `deleteResource()` - Protected

### BGG Actions (`lib/actions/bgg.ts`)
- `searchBGG()` - Protected
- `fetchBGGGame()` - Protected
- `createGameFromBGG()` - Protected

### Attachments Actions (`lib/actions/attachments.ts`)
- No admin actions (read-only operations)

## Security Best Practices

1. **All write operations** (POST, PATCH, DELETE) on games, resources, and attachments require admin authentication
2. **All BGG integration operations** require admin authentication (prevents abuse of external API)
3. **Read operations** are generally public to allow users to view game information and chat with the assistant
4. **File uploads** require admin authentication to prevent abuse

## Error Handling

When `requireAdmin()` or `requireAuth()` throw an error:
- The error message is "Admin access required" or "Authentication required"
- Next.js API routes should catch this and return appropriate HTTP status codes (401 Unauthorized or 403 Forbidden)
- The existing implementations already handle this correctly by letting the error propagate, which Next.js converts to a proper error response

## Implementation Checklist

- [x] BGG search route authentication enabled
- [x] BGG extract-id route authentication enabled
- [x] BGG games detail route authentication enabled
- [x] BGG import route authentication enabled (already had it)
- [x] Games POST route authentication enabled (already had it)
- [x] Games PATCH route authentication enabled (already had it)
- [x] Games DELETE route authentication enabled (already had it)
- [x] Resources PATCH route authentication enabled (already had it)
- [x] Resources DELETE route authentication enabled (already had it)
- [x] Attachments PATCH route authentication enabled (already had it)
- [x] Upload route authentication enabled (already had it)
- [x] Server actions all use requireAdmin (verified)

## Recent Changes

### 2025-11-04: Enabled BGG Route Authentication
- Added `requireAdmin()` to `GET /api/bgg/search`
- Added `requireAdmin()` to `GET /api/bgg/extract-id`
- Added `requireAdmin()` to `GET /api/bgg/games/:bggId`
- Removed TODO comments about authentication

All three routes now properly import `requireAdmin` from `@/lib/auth/helpers` and call it at the start of the request handler.

## Testing Authentication

To test authentication on protected routes:

1. **Without authentication**: Should receive 401 Unauthorized or similar error
2. **With non-admin user**: Should receive 403 Forbidden or similar error
3. **With admin user**: Should process request successfully

## Notes

- NextAuth v5 (beta) is used for authentication
- Admin status is stored on the user model (`user.isAdmin`)
- The `/admin/*` pages use similar authentication checks via middleware
- Workflow routes may need additional protection in production (API keys, internal network, etc.)
