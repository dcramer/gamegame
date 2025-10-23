import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Env } from '@/types';
import { getDb, games, resources, fragments } from '@/lib/db';
import { eq, sql, or } from 'drizzle-orm';
import { requireAdmin } from '@/middleware/auth';
import { ratelimit } from '@/middleware/ratelimit';
import { generateSlug, ensureUniqueSlug } from '@/lib/utils/slug';
import { createJob } from '@/lib/jobs/status';
import { RESOURCE_SOURCE_FILENAME, buildResourceSourceUrl } from '@/lib/services/r2-storage';
import { deleteEmbeddings } from '@/lib/ai/vectorize';
import { streamChatResponse } from './chat-handler';

const gamesRouter = new Hono<{ Bindings: Env }>();
// List all games
gamesRouter.get('/', async (c) => {
  const db = getDb(c.env.DB);

  const gamesList = await db
    .select({
      id: games.id,
      name: games.name,
      year: games.year,
      slug: games.slug,
      imageUrl: games.imageUrl,
      bggUrl: games.bggUrl,
      resourceCount: sql<number>`COUNT(DISTINCT ${resources.id})`,
    })
    .from(games)
    .leftJoin(resources, eq(games.id, resources.gameId))
    .groupBy(games.id)
    .all();

  return c.json(gamesList);
});

// Get single game (by slug or ID)
gamesRouter.get('/:gameIdOrSlug', async (c) => {
  const { gameIdOrSlug } = c.req.param();
  const db = getDb(c.env.DB);

  // Support both slug and ID lookups
  const [game] = await db
    .select({
      id: games.id,
      name: games.name,
      year: games.year,
      slug: games.slug,
      imageUrl: games.imageUrl,
      bggUrl: games.bggUrl,
      resourceCount: sql<number>`COUNT(DISTINCT ${resources.id})`,
    })
    .from(games)
    .leftJoin(resources, eq(games.id, resources.gameId))
    .where(or(eq(games.slug, gameIdOrSlug), eq(games.id, gameIdOrSlug)))
    .groupBy(games.id)
    .limit(1);

  if (!game) {
    return c.json({ error: 'Game not found' }, 404);
  }

  return c.json(game);
});

// Create game (admin only)
gamesRouter.post(
  '/',
  requireAdmin,
  zValidator(
    'json',
    z.object({
      name: z.string().min(1),
      year: z.number().int().min(1900).max(2100).optional(),
      // Accept both full URLs and relative paths
      imageUrl: z.string().min(1).optional(),
      bggUrl: z.string().url().optional(),
    })
  ),
  async (c) => {
    const data = c.req.valid('json');
    const db = getDb(c.env.DB);

    // Generate slug from name and year
    const baseSlug = generateSlug(data.name, data.year);

    // Try to insert with increasingly unique slugs on collision
    // This avoids fetching all existing games on every attempt
    const maxRetries = 5;
    let slug = baseSlug;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const [game] = await db
          .insert(games)
          .values({
            name: data.name,
            year: data.year,
            slug,
            imageUrl: data.imageUrl,
            bggUrl: data.bggUrl,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();

        return c.json(game, 201);
      } catch (error) {
        // Check if this is a unique constraint violation on slug
        const isSlugConflict = error instanceof Error &&
          (error.message.includes('UNIQUE constraint failed') && error.message.includes('slug'));

        if (isSlugConflict && attempt < maxRetries - 1) {
          // Collision detected - append random suffix for next attempt
          const randomSuffix = Math.random().toString(36).substring(2, 6);
          slug = `${baseSlug}-${randomSuffix}`;
          console.log(`[Create Game] Slug collision detected (attempt ${attempt + 1}), trying: ${slug}`);
          continue;
        }

        // Not a slug conflict or out of retries - rethrow
        throw error;
      }
    }

    // This should never be reached, but TypeScript needs it
    return c.json({ error: 'Failed to create game after multiple retries' }, 500);
  }
);

// Update game (admin only)
gamesRouter.patch(
  '/:gameId',
  requireAdmin,
  zValidator(
    'json',
    z.object({
      name: z.string().min(1).optional(),
      year: z.number().int().min(1900).max(2100).optional().nullable(),
      slug: z.string().min(1).optional(),
      // Accept both full URLs and relative paths
      imageUrl: z.string().min(1).optional(),
      bggUrl: z.string().url().optional(),
    })
  ),
  async (c) => {
    const { gameId } = c.req.param();
    const data = c.req.valid('json');
    const db = getDb(c.env.DB);

    // Build update data
    let updateData: Partial<typeof games.$inferInsert> = { ...data, updatedAt: new Date() };

    // If slug is explicitly provided, use it (admin's responsibility to ensure uniqueness)
    if (data.slug) {
      updateData.slug = data.slug;
    }
    // Otherwise, if name or year is changing, regenerate slug
    else if (data.name || data.year !== undefined) {
      // Get current game to determine final name and year
      const [currentGame] = await db
        .select()
        .from(games)
        .where(eq(games.id, gameId))
        .limit(1);

      if (!currentGame) {
        return c.json({ error: 'Game not found' }, 404);
      }

      const finalName = data.name || currentGame.name;
      const finalYear = data.year !== undefined ? data.year : currentGame.year;
      const baseSlug = generateSlug(finalName, finalYear);

      // Check for slug collisions (excluding current game)
      const existingGames = await db
        .select({ slug: games.slug })
        .from(games)
        .all();
      const existingSlugs = existingGames
        .filter(g => g.slug !== currentGame.slug)  // Exclude current game's slug
        .map(g => g.slug);

      updateData.slug = ensureUniqueSlug(baseSlug, existingSlugs);
    }

    const [game] = await db
      .update(games)
      .set(updateData)
      .where(eq(games.id, gameId))
      .returning();

    if (!game) {
      return c.json({ error: 'Game not found' }, 404);
    }

    return c.json(game);
  }
);

// Delete game (admin only)
gamesRouter.delete('/:gameId', requireAdmin, async (c) => {
  const { gameId } = c.req.param();
  const db = getDb(c.env.DB);

  // Step 1: Collect all data needed for cleanup BEFORE any deletions
  const fragmentList = await db
    .select({ id: fragments.id })
    .from(fragments)
    .where(eq(fragments.gameId, gameId))
    .all();

  const resourceList = await db
    .select({ id: resources.id })
    .from(resources)
    .where(eq(resources.gameId, gameId))
    .all();

  // Step 2: Delete from D1 (source of truth, cascades to resources, fragments, attachments)
  const result = await db.delete(games).where(eq(games.id, gameId)).returning();

  if (result.length === 0) {
    return c.json({ error: 'Game not found' }, 404);
  }

  const errors: string[] = [];

  // Step 3: Try to delete from Vectorize (log errors but don't fail)
  if (fragmentList.length > 0) {
    try {
      const fragmentIds = fragmentList.map(f => f.id);
      await deleteEmbeddings(c.env.VECTORIZE, fragmentIds);
    } catch (error) {
      const errorMsg = `Failed to delete ${fragmentList.length} embeddings from Vectorize: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`[Delete Game] ${errorMsg}`);
      errors.push(errorMsg);
    }
  }

  // Step 4: Try to delete from R2 (log errors but don't fail)
  let totalR2Deleted = 0;
  const { deleteResourceFiles } = await import('@/lib/services/r2-storage');
  for (const resource of resourceList) {
    try {
      const deleted = await deleteResourceFiles(c.env.FILES, resource.id);
      totalR2Deleted += deleted;
    } catch (error) {
      const errorMsg = `Failed to delete R2 files for resource ${resource.id}: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`[Delete Game] ${errorMsg}`);
      errors.push(errorMsg);
    }
  }

  console.log(`[Delete Game] Deleted game ${gameId}: ${fragmentList.length} fragments, ${totalR2Deleted} R2 files`);

  // Return 207 Multi-Status if cleanup had errors (game deleted, but orphaned data remains)
  // Return 200 only if everything succeeded
  const statusCode = errors.length > 0 ? 207 : 200;

  return c.json({
    success: errors.length === 0,
    deletedFragments: fragmentList.length,
    deletedR2Files: totalR2Deleted,
    warnings: errors.length > 0 ? errors : undefined,
    message: errors.length > 0
      ? 'Game deleted from database, but some cleanup operations failed. Orphaned data may remain in Vectorize or R2.'
      : 'Game and all associated data deleted successfully',
  }, statusCode);
});

// List resources for a game (by slug or ID)
gamesRouter.get('/:gameIdOrSlug/resources', async (c) => {
  const { gameIdOrSlug } = c.req.param();
  const db = getDb(c.env.DB);

  // Get game to ensure it exists and get its ID
  const [game] = await db
    .select({ id: games.id })
    .from(games)
    .where(or(eq(games.slug, gameIdOrSlug), eq(games.id, gameIdOrSlug)))
    .limit(1);

  if (!game) {
    return c.json({ error: 'Game not found' }, 404);
  }

  // Get resources for this game
  const resourceList = await db
    .select({
      id: resources.id,
      name: resources.name,
      url: resources.url,
      version: resources.version,
      pdfExtractor: resources.pdfExtractor,
      processedAt: resources.processedAt,
      pageCount: resources.pageCount,
      imageCount: resources.imageCount,
      wordCount: resources.wordCount,
      fragmentCount: sql<number>`COUNT(${fragments.id})`,
    })
    .from(resources)
    .leftJoin(fragments, eq(resources.id, fragments.resourceId))
    .where(eq(resources.gameId, game.id))
    .groupBy(resources.id)
    .all();

  return c.json(resourceList);
});

// Upload a new resource for a game (admin only, accepts multipart PDF upload)
// Rate limit: 10 uploads per 60 seconds to prevent abuse
gamesRouter.post('/:gameIdOrSlug/resources', requireAdmin, ratelimit(10, 60), async (c) => {
  const { gameIdOrSlug } = c.req.param();
  const db = getDb(c.env.DB);

  // Look up game by slug or ID
  const [game] = await db
    .select({ id: games.id, name: games.name })
    .from(games)
    .where(or(eq(games.slug, gameIdOrSlug), eq(games.id, gameIdOrSlug)))
    .limit(1);

  if (!game) {
    return c.json({ error: 'Game not found' }, 404);
  }

  try {
    const formData = await c.req.formData();
    const fileEntry = formData.get('file');

    if (!fileEntry || typeof fileEntry === 'string') {
      return c.json({ error: 'A PDF file is required' }, 400);
    }

    const file = fileEntry as File;

    const declaredName = formData.get('name');
    const candidateName =
      (typeof file.name === 'string' && file.name.trim().length > 0 ? file.name.trim() : undefined) ??
      (typeof declaredName === 'string' && declaredName.trim().length > 0 ? declaredName.trim() : undefined) ??
      'Uploaded Rulebook';
    const resourceOriginalFilename = candidateName;
    const initialResourceName = candidateName;

    // Read file buffer first for validation
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    // Validate file type by extension and MIME type
    const fileExtension = file.name?.split('.').pop()?.toLowerCase();
    const isPdfMimeType =
      file.type === 'application/pdf' ||
      file.type === 'application/x-pdf' ||
      (file.type === '' && fileExtension === 'pdf') ||
      fileExtension === 'pdf';

    if (!isPdfMimeType) {
      return c.json({ error: 'File must be a PDF (invalid file extension or MIME type)' }, 400);
    }

    // Validate PDF magic bytes: %PDF- (0x25 0x50 0x44 0x46 0x2D)
    const isPdfMagicBytes = buffer.length >= 5 &&
      buffer[0] === 0x25 &&  // %
      buffer[1] === 0x50 &&  // P
      buffer[2] === 0x44 &&  // D
      buffer[3] === 0x46 &&  // F
      buffer[4] === 0x2D;    // -

    if (!isPdfMagicBytes) {
      return c.json({ error: 'File must be a valid PDF (invalid file content)' }, 400);
    }

    const resourceId = crypto.randomUUID();
    const objectKey = `resources/${resourceId}/${RESOURCE_SOURCE_FILENAME}`;

    await c.env.FILES.put(objectKey, buffer, {
      httpMetadata: {
        contentType: file.type || 'application/pdf',
      },
      customMetadata: {
        resourceId,
        gameId: game.id,
        originalFilename: file.name || '',
      },
    });

    const resourceUrl = buildResourceSourceUrl(resourceId);

    const jobId = await createJob(c.env.JOB_STATUS_KV, resourceId, game.id);

    await db
      .insert(resources)
      .values({
        id: resourceId,
        gameId: game.id,
        name: initialResourceName,
        originalFilename: resourceOriginalFilename,
        url: resourceUrl,
        content: '',
        version: 0,
        pdfExtractor: 'mistral',
        status: 'processing',
        currentJobId: jobId,
        processingStage: 'ingest',
        processingMetadata: null,
        pageCount: null,
        imageCount: 0,
        wordCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

  await c.env.RESOURCE_QUEUE.send({
    jobId,
    resourceId,
    gameId: game.id,
    name: initialResourceName,
    type: 'INGEST',
    url: resourceUrl,
    gameName: game.name,
    sourceKey: objectKey,
  });

    return c.json(
      {
        resourceId,
        jobId,
        status: 'queued',
        message: 'Resource queued for processing',
      },
      202
    );
  } catch (error) {
    console.error('Failed to upload resource PDF:', error instanceof Error ? error.message : error);
    return c.json({ error: 'Failed to upload resource PDF' }, 500);
  }
});

// Chat endpoint - streaming AI responses (by slug or ID)
// Rate limit: 20 requests per 60s (equivalent to old 10 per 30s)
gamesRouter.post('/:gameIdOrSlug/chat', ratelimit(20, 60), async (c) => {
  const { gameIdOrSlug } = c.req.param();
  const body = await c.req.json();
  // Fetch game data - support both slug and ID lookups
  const db = getDb(c.env.DB);
  const [game] = await db
    .select()
    .from(games)
    .where(or(eq(games.slug, gameIdOrSlug), eq(games.id, gameIdOrSlug)))
    .limit(1);

  if (!game) {
    return c.json({ error: 'Game not found' }, 404);
  }

  if (body.messages === undefined) {
    return c.json({ error: 'messages array is required' }, 400);
  }

  if (!Array.isArray(body.messages)) {
    return c.json({ error: 'messages must be an array' }, 400);
  }

  const response = await streamChatResponse(c.env, game, body, {
    router: 'games',
    requestedGame: gameIdOrSlug,
  });

  return response;
});

export default gamesRouter;
