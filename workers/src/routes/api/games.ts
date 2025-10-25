import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import type { Env } from '@/types';
import { getDb, games, resources, fragments, attachments } from '@/lib/db';
import { eq, sql, or, asc } from 'drizzle-orm';
import { requireAdmin } from '@/middleware/auth';
import { ratelimit } from '@/middleware/ratelimit';
import { generateSlug } from '@/lib/utils/slug';
import { createJob } from '@/lib/jobs/status';
import { RESOURCE_SOURCE_FILENAME, buildResourceSourceUrl, buildResourceSourceKey, r2KeyToUrl } from '@/lib/services/r2-storage';
import { deleteEmbeddings } from '@/lib/ai/vectorize';
import { streamChatResponse } from './chat-handler';
import { getBGGGameDetails, downloadImage } from '@/lib/services/bgg';
import {
  extractFileExtension,
  isSupportedExtension,
  validateFileContent,
  getFileTypeName,
  getMimeTypeForExtension,
} from '@/lib/file-types';
import {
  gamesListSchema,
  gameSchema,
  resourcesListSchema,
  uploadResponseSchema,
  deleteGameResponseSchema,
  validateResponse,
  chatRequestSchema,
} from './schemas';

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
      bggId: games.bggId,
      bggUrl: games.bggUrl,
      resourceCount: sql<number>`COUNT(DISTINCT ${resources.id})`,
      createdAt: games.createdAt,
      updatedAt: games.updatedAt,
    })
    .from(games)
    .leftJoin(resources, eq(games.id, resources.gameId))
    .groupBy(games.id)
    .all();

  return c.json(validateResponse(gamesList, gamesListSchema));
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
      bggId: games.bggId,
      bggUrl: games.bggUrl,
      resourceCount: db.$count(resources, eq(resources.gameId, games.id)),
      createdAt: games.createdAt,
      updatedAt: games.updatedAt,
    })
    .from(games)
    .where(or(eq(games.slug, gameIdOrSlug), eq(games.id, gameIdOrSlug)))
    .limit(1);

  if (!game) {
    return c.json({ error: 'Game not found' }, 404);
  }

  return c.json(validateResponse(game, gameSchema));
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

        // Convert Date objects to timestamps for proper JSON serialization
        const response = {
          ...game,
          createdAt: game.createdAt ? game.createdAt.getTime() : undefined,
          updatedAt: game.updatedAt ? game.updatedAt.getTime() : undefined,
        };

        return c.json(validateResponse(response, gameSchema), 201);
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

      // Only check for collision if slug is actually changing or missing
      // Defensive: handle case where currentGame.slug might be null (shouldn't happen with NOT NULL constraint, but TypeScript doesn't know that)
      if (baseSlug !== currentGame.slug || !currentGame.slug) {
        // Try with base slug first
        let candidateSlug = baseSlug;
        let attempts = 0;
        const maxAttempts = 5;

        while (attempts < maxAttempts) {
          const [existing] = await db
            .select({ id: games.id })
            .from(games)
            .where(eq(games.slug, candidateSlug))
            .limit(1);

          if (!existing) {
            // Slug is available
            updateData.slug = candidateSlug;
            break;
          }

          // Collision - generate new candidate
          attempts++;
          const randomSuffix = Math.random().toString(36).substring(2, 6);
          candidateSlug = `${baseSlug}-${randomSuffix}`;
        }

        if (attempts === maxAttempts) {
          return c.json({ error: 'Failed to generate unique slug after multiple attempts' }, 500);
        }
      }
    }

    const [game] = await db
      .update(games)
      .set(updateData)
      .where(eq(games.id, gameId))
      .returning();

    if (!game) {
      return c.json({ error: 'Game not found' }, 404);
    }

    // Convert Date objects to timestamps for proper JSON serialization
    const response = {
      ...game,
      createdAt: game.createdAt ? game.createdAt.getTime() : undefined,
      updatedAt: game.updatedAt ? game.updatedAt.getTime() : undefined,
    };

    return c.json(validateResponse(response, gameSchema));
  }
);

// Delete game (admin only)
// Note: D1 CASCADE handles database deletions (resources, fragments, attachments)
// We collect data before deletion to clean up external resources (Vectorize, R2)
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

  const response = {
    success: errors.length === 0,
    deletedFragments: fragmentList.length,
    deletedR2Files: totalR2Deleted,
    warnings: errors.length > 0 ? errors : undefined,
    message: errors.length > 0
      ? 'Game deleted from database, but some cleanup operations failed. Orphaned data may remain in Vectorize or R2.'
      : 'Game and all associated data deleted successfully',
  };

  return c.json(validateResponse(response, deleteGameResponseSchema), statusCode);
});

// Sync game from BGG (admin only)
gamesRouter.post('/:gameId/sync-from-bgg', requireAdmin, async (c) => {
  const { gameId } = c.req.param();
  const db = getDb(c.env.DB);

  // Get the game to ensure it exists and has a BGG ID
  const [game] = await db
    .select()
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1);

  if (!game) {
    return c.json({ error: 'Game not found' }, 404);
  }

  if (!game.bggId) {
    return c.json({ error: 'Game does not have a BGG ID' }, 400);
  }

  try {
    // Fetch latest data from BGG, bypassing cache to ensure fresh data
    const details = await getBGGGameDetails(
      game.bggId,
      c.env.DB,
      c.env.RATE_LIMIT_KV,
      { bypassCache: true }
    );

    // Prepare update data
    const updateData: Partial<typeof games.$inferInsert> = {
      name: details.name,
      year: details.yearPublished,
      updatedAt: new Date(),
    };

    // Download and upload image if available
    if (details.imageUrl) {
      try {
        const imageBuffer = await downloadImage(details.imageUrl);

        // Upload to R2
        const key = `games/game-${game.bggId}.jpg`;
        await c.env.FILES.put(key, imageBuffer, {
          httpMetadata: {
            contentType: 'image/jpeg',
          },
        });

        updateData.imageUrl = `/uploads/${key}`;
      } catch (imageError) {
        console.error('BGG image download failed:', imageError);
        // Continue without updating image
      }
    }

    // Regenerate slug if name or year changed
    if (updateData.name !== game.name || updateData.year !== game.year) {
      updateData.slug = generateSlug(
        updateData.name || game.name,
        updateData.year !== undefined ? updateData.year : game.year
      );
    }

    // Update the game
    const [updatedGame] = await db
      .update(games)
      .set(updateData)
      .where(eq(games.id, gameId))
      .returning();

    // Convert Date objects to timestamps for JSON serialization
    const response = {
      ...updatedGame,
      createdAt: updatedGame.createdAt ? updatedGame.createdAt.getTime() : undefined,
      updatedAt: updatedGame.updatedAt ? updatedGame.updatedAt.getTime() : undefined,
    };

    return c.json(validateResponse(response, gameSchema));
  } catch (error) {
    console.error('Failed to sync game from BGG:', error);
    return c.json({ error: 'Failed to sync game from BoardGameGeek' }, 500);
  }
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
      status: resources.status,
      currentJobId: resources.currentJobId,
      processingStage: resources.processingStage,
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

  // Convert Date objects to timestamps for proper JSON serialization
  const parsed = resourceList.map((resource) => ({
    ...resource,
    processedAt: resource.processedAt ? resource.processedAt.getTime() : null,
  }));

  return c.json(validateResponse(parsed, resourcesListSchema));
});

// Get all attachments for a game (by slug or ID)
gamesRouter.get('/:gameIdOrSlug/attachments', async (c) => {
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

  // Get attachments for this game with resource names
  const attachmentsList = await db
    .select({
      id: attachments.id,
      resourceId: attachments.resourceId,
      resourceName: resources.name,
      type: attachments.type,
      r2Key: attachments.r2Key,
      mimeType: attachments.mimeType,
      originalFilename: attachments.originalFilename,
      pageNumber: attachments.pageNumber,
      bbox: attachments.bbox,
      caption: attachments.caption,
      width: attachments.width,
      height: attachments.height,
      description: attachments.description,
      isGoodQuality: attachments.isGoodQuality,
      createdAt: attachments.createdAt,
    })
    .from(attachments)
    .innerJoin(resources, eq(attachments.resourceId, resources.id))
    .where(eq(attachments.gameId, game.id))
    .orderBy(asc(resources.name), asc(attachments.pageNumber), asc(attachments.createdAt))
    .all();

  // Helper to parse bbox JSON safely
  function parseBbox(bboxValue: string | null | undefined): number[] | undefined {
    if (!bboxValue) return undefined;
    try {
      const parsed = JSON.parse(typeof bboxValue === 'string' ? bboxValue : String(bboxValue));
      if (Array.isArray(parsed) && parsed.every(v => typeof v === 'number')) {
        return parsed;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  // Convert to proper format with URLs
  const parsed = attachmentsList.map((attachment) => ({
    ...attachment,
    url: r2KeyToUrl(attachment.r2Key),
    bbox: parseBbox(attachment.bbox),
    createdAt: attachment.createdAt ? attachment.createdAt.toISOString() : new Date().toISOString(),
  }));

  return c.json(parsed);
});

// Upload a new resource for a game (admin only, accepts multipart document/image upload)
// Rate limit: 10 uploads per 60 seconds to prevent abuse
// Max file size: 100MB
const MAX_FILE_UPLOAD_SIZE = 100 * 1024 * 1024; // 100MB

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
      return c.json({ error: 'A file is required' }, 400);
    }

    const file = fileEntry as File;

    // Validate file size
    if (file.size > MAX_FILE_UPLOAD_SIZE) {
      return c.json({ error: `File must be less than ${MAX_FILE_UPLOAD_SIZE / 1024 / 1024}MB` }, 400);
    }

    const declaredName = formData.get('name');
    const candidateName =
      (typeof file.name === 'string' && file.name.trim().length > 0 ? file.name.trim() : undefined) ??
      (typeof declaredName === 'string' && declaredName.trim().length > 0 ? declaredName.trim() : undefined) ??
      'Uploaded Document';
    const resourceOriginalFilename = candidateName;
    const initialResourceName = candidateName;

    // Read file buffer first for validation
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    // Extract and validate file extension (defense in depth - don't trust user metadata)
    const fileExtension = extractFileExtension(file.name || '');

    if (!fileExtension) {
      return c.json({ error: 'File must have a valid extension' }, 400);
    }

    if (!isSupportedExtension(fileExtension)) {
      return c.json({
        error: `Unsupported file type: .${fileExtension}. Supported: PDF, TXT, MD, DOCX, PNG, JPG, WebP, etc.`
      }, 400);
    }

    // SECURITY: Validate file content matches extension using magic bytes
    const validation = validateFileContent(buffer, fileExtension);
    if (!validation.valid) {
      return c.json({
        error: validation.error || `File content does not match .${fileExtension} extension`
      }, 400);
    }

    // Determine MIME type from extension (more reliable than user-supplied MIME type)
    const mimeType = getMimeTypeForExtension(fileExtension);

    const resourceId = nanoid();
    const objectKey = buildResourceSourceKey(resourceId, fileExtension);

    await c.env.FILES.put(objectKey, buffer, {
      httpMetadata: {
        contentType: mimeType,
      },
      customMetadata: {
        resourceId,
        gameId: game.id,
        originalFilename: file.name || '',
        fileExtension: fileExtension,
      },
    });

    const resourceUrl = buildResourceSourceUrl(resourceId, fileExtension);

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

    const response = {
      resourceId,
      jobId,
      status: 'queued',
      message: 'Resource queued for processing',
    };

    return c.json(validateResponse(response, uploadResponseSchema), 202);
  } catch (error) {
    console.error('Failed to upload resource:', error instanceof Error ? error.message : error);
    return c.json({ error: 'Failed to upload resource' }, 500);
  }
});

// Chat endpoint - streaming AI responses (by slug or ID)
// Rate limit: 20 requests per 60s (equivalent to old 10 per 30s)
gamesRouter.post('/:gameIdOrSlug/chat', ratelimit(20, 60), async (c) => {
  const { gameIdOrSlug } = c.req.param();

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

  // Parse and validate request body
  let body;
  try {
    const rawBody = await c.req.json();
    body = chatRequestSchema.parse(rawBody);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({
        error: 'Invalid request body',
        details: error.issues
      }, 400);
    }
    return c.json({ error: 'Failed to parse request body' }, 400);
  }

  // Extract base URL from request for absolute attachment URLs
  const baseUrl = new URL(c.req.url).origin;

  const response = await streamChatResponse(c.env, game, body, baseUrl, {
    router: 'games',
    requestedGame: gameIdOrSlug,
  });

  return response;
});

export default gamesRouter;
